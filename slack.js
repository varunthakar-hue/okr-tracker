import fetch from 'node-fetch';

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const APPROVAL_CHANNEL = process.env.SLACK_APPROVAL_CHANNEL || '#community-approvals';

export async function postApprovalCard(event, content) {
  const channelOptions = ['linkedin', 'twitter', 'instagram', 'whatsapp_dm', 'email', 'card']
    .map(ch => ({ text: { type: 'plain_text', text: ch }, value: ch }));

  const body = {
    channel: APPROVAL_CHANNEL,
    text: `New milestone detected: ${event.company} — ${event.event_type}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `🎯 ${event.company}: ${event.headline}` }
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Type:* ${event.event_type}` },
          { type: 'mrkdwn', text: `*Date:* ${event.event_date}` },
          { type: 'mrkdwn', text: `*Confidence:* ${event.confidence}` },
          { type: 'mrkdwn', text: `*Source:* <${event.source_url}|link>` }
        ]
      },
      { type: 'divider' },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*LinkedIn draft:*\n${content.linkedin_post.slice(0, 400)}…` }
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Tweet:*\n${content.tweet}` }
      },
      { type: 'divider' },
      {
        type: 'input',
        block_id: 'channel_select',
        label: { type: 'plain_text', text: 'Publish to channels:' },
        element: {
          type: 'multi_static_select',
          action_id: 'channels',
          placeholder: { type: 'plain_text', text: 'Select channels' },
          options: channelOptions,
          initial_options: channelOptions.slice(0, 3)
        }
      },
      {
        type: 'input',
        block_id: 'cm_notes',
        optional: true,
        label: { type: 'plain_text', text: 'Notes / edits:' },
        element: { type: 'plain_text_input', action_id: 'notes', multiline: true }
      },
      {
        type: 'actions',
        block_id: 'decision',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Approve ✅' },
            style: 'primary',
            action_id: 'approve',
            value: event.event_id
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Reject ❌' },
            style: 'danger',
            action_id: 'reject',
            value: event.event_id
          }
        ]
      }
    ]
  };

  const res = await slackPost('chat.postMessage', body);
  return res.ts; // message timestamp used for polling
}

export async function postError(message, detail) {
  await slackPost('chat.postMessage', {
    channel: APPROVAL_CHANNEL,
    text: `⚠️ *Community OS Error*\n${message}\n\`\`\`${detail}\`\`\``
  });
}

export async function pollForDecision(messageTs, timeoutMs = 24 * 60 * 60 * 1000) {
  // Poll the conversation replies every 30s for an interactive action response.
  // In production, replace with a Slack webhook listener for instant response.
  const deadline = Date.now() + timeoutMs;
  const pollInterval = 30_000;

  while (Date.now() < deadline) {
    await sleep(pollInterval);
    const replies = await slackGet('conversations.replies', {
      channel: await resolveChannelId(),
      ts: messageTs,
      limit: 20
    });

    for (const msg of replies.messages || []) {
      if (msg.metadata?.event_type === 'approval_decision') {
        return msg.metadata.event_payload;
      }
    }
  }

  throw new Error(`Approval timeout after ${timeoutMs / 3600000}h for message ${messageTs}`);
}

// Called by the Slack interactivity webhook handler (separate Express server or serverless fn)
export async function handleInteractivePayload(payload) {
  const action = payload.actions?.[0];
  if (!action) return;

  const decision = action.action_id; // 'approve' or 'reject'
  const eventId = action.value;
  const approvedChannels = payload.state?.values?.channel_select?.channels?.selected_options
    ?.map(o => o.value) || [];
  const cmNotes = payload.state?.values?.cm_notes?.notes?.value || null;

  // Post a metadata message that pollForDecision can detect
  await slackPost('chat.postMessage', {
    channel: payload.channel.id,
    thread_ts: payload.message.ts,
    text: `Decision recorded: *${decision}* by <@${payload.user.id}>`,
    metadata: {
      event_type: 'approval_decision',
      event_payload: {
        decision,
        event_id: eventId,
        approved_channels: approvedChannels,
        cm_notes: cmNotes,
        approved_by: payload.user.id,
        approved_at: new Date().toISOString()
      }
    }
  });

  // Acknowledge original message
  await slackPost('chat.update', {
    channel: payload.channel.id,
    ts: payload.message.ts,
    text: payload.message.text,
    blocks: payload.message.blocks.filter(b => b.type !== 'actions' && b.type !== 'input'),
    attachments: [{
      color: decision === 'approve' ? '#36a64f' : '#cc0000',
      text: `${decision === 'approve' ? '✅ Approved' : '❌ Rejected'} by <@${payload.user.id}>`
    }]
  });
}

async function resolveChannelId() {
  if (APPROVAL_CHANNEL.startsWith('C')) return APPROVAL_CHANNEL; // already an ID
  const res = await slackGet('conversations.list', { types: 'public_channel,private_channel', limit: 200 });
  const ch = res.channels?.find(c => `#${c.name}` === APPROVAL_CHANNEL || c.name === APPROVAL_CHANNEL.replace('#', ''));
  if (!ch) throw new Error(`Slack channel not found: ${APPROVAL_CHANNEL}`);
  return ch.id;
}

async function slackPost(method, body) {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Slack ${method} error: ${json.error}`);
  return json;
}

async function slackGet(method, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`https://slack.com/api/${method}?${qs}`, {
    headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` }
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Slack ${method} error: ${json.error}`);
  return json;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
