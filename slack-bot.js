/**
 * slack-bot.js — Interactive Slack event listener for Central Brand OKR Bot
 *
 * Handles incoming DMs from team members, answers questions using brain context + OKR data,
 * and responds to check-in replies.
 *
 * Run: node src/slack-bot.js  (separate process on port 3003)
 * Expose via ngrok: ngrok http 3003
 * Set in Slack app: Event Subscriptions → Request URL → https://<ngrok>.ngrok.io/slack/events
 * Subscribe to bot events: message.im
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env'), override: true });
const express = require('express');
const crypto  = require('crypto');
const { WebClient } = require('@slack/web-api');
const Anthropic = require('@anthropic-ai/sdk');
const { getAllContext, loadIndex } = require('./brain');
const { TEAM, VARUN_ID } = require('./config');
const fs   = require('fs');
const path = require('path');

const slack  = new WebClient(process.env.SLACK_BOT_TOKEN);
const PORT   = process.env.SLACK_BOT_PORT || 3003;
const SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET || '';

// ── Anthropic client (same gateway as brain.js) ────────────────────────────
function makeClient() {
  if (process.env.AZURE_ANTHROPIC_ENDPOINT && process.env.AZURE_ANTHROPIC_API_KEY) {
    return new Anthropic({
      apiKey: process.env.AZURE_ANTHROPIC_API_KEY,
      baseURL: process.env.AZURE_ANTHROPIC_ENDPOINT,
      defaultHeaders: { 'api-key': process.env.AZURE_ANTHROPIC_API_KEY },
      defaultQuery: { 'api-version': '2024-06-01' },
    });
  }
  const opts = { apiKey: process.env.ANTHROPIC_API_KEY };
  if (process.env.ANTHROPIC_BASE_URL) opts.baseURL = process.env.ANTHROPIC_BASE_URL;
  return new Anthropic(opts);
}
const ai    = makeClient();
const MODEL = process.env.AZURE_MODEL_FAST || process.env.AZURE_MODEL_LARGE || 'claude-sonnet-4-6';

// ── Dedup — prevent double-processing Slack retries ───────────────────────
const SEEN = new Set();

// ── Verify Slack signature ─────────────────────────────────────────────────
function verifySlack(req) {
  if (!SIGNING_SECRET) return true; // dev mode
  const ts  = req.headers['x-slack-request-timestamp'];
  const sig = req.headers['x-slack-signature'];
  if (!ts || !sig) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const base = `v0:${ts}:${req.rawBody}`;
  const expected = 'v0=' + crypto.createHmac('sha256', SIGNING_SECRET).update(base).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

// ── Build brain context string ─────────────────────────────────────────────
function buildBrainContext() {
  const meetings = loadIndex().slice(0, 12); // last 12 meetings
  const okrPath  = path.join(__dirname, '../data/okr-cache.json');
  let okrText = '';
  try {
    const okr = JSON.parse(fs.readFileSync(okrPath, 'utf8'));
    const all = [...(okr.brand||[]), ...(okr.social||[]), ...(okr.engage||[])];
    okrText = all.map(o => `• [${o.ownerRaw}] ${o.kr} | Status: ${o.status} | This week: ${o.thisWeekPlan||'—'}`).join('\n');
  } catch {}

  const meetingText = meetings.map(m => [
    `=== ${m.title} (${m.date}) ===`,
    `Summary: ${m.summary}`,
    m.decisions?.length ? `Decisions: ${m.decisions.join(' | ')}` : '',
    m.blockers?.length  ? `Blockers: ${m.blockers.join(' | ')}`   : '',
    m.contextNuggets?.length ? `Context: ${m.contextNuggets.join(' | ')}` : '',
    Object.keys(m.actionItems||{}).length
      ? `Actions: ${Object.entries(m.actionItems).map(([p,a])=>`${p}: ${a.join(', ')}`).join(' | ')}`
      : '',
  ].filter(Boolean).join('\n')).join('\n\n');

  return `=== CURRENT OKR STATUS ===\n${okrText}\n\n=== RECENT MEETING INTELLIGENCE ===\n${meetingText}`;
}

// ── Identify user ──────────────────────────────────────────────────────────
function getMember(userId) {
  return TEAM.find(m => m.id === userId) || null;
}

// ── Ask Claude with brain context ──────────────────────────────────────────
async function askClaude(question, member) {
  const brainCtx = buildBrainContext();
  const memberCtx = member
    ? `The person asking is ${member.name} (${member.role}).`
    : 'The person asking is not a known team member — answer generically.';

  const system = `You are the Central Brand OKR Bot for Razorpay's Brand & Social team.
You have full context about the team's OKRs, recent meeting decisions, action items, and strategic context.
${memberCtx}

Your job: answer questions helpfully, surfacing relevant decisions, blockers, or context from meetings when relevant.
Keep answers concise and Slack-friendly (use bullet points, bold for emphasis, no markdown headers).
Do not make up information — only use what's in the context below.
If you don't know, say so and suggest who to ask.

${brainCtx}`;

  const response = await ai.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system,
    messages: [{ role: 'user', content: question }],
  });

  const textBlock = response.content.find(c => c.type === 'text');
  return textBlock?.text || 'Sorry, I couldn\'t generate a response.';
}

// ── Handle incoming DM message ─────────────────────────────────────────────
async function handleMessage(event) {
  const { user, text, channel, ts, bot_id } = event;

  // Ignore bot messages and empty messages
  if (bot_id || !text?.trim()) return;
  if (SEEN.has(ts)) return;
  SEEN.add(ts);
  if (SEEN.size > 500) { const first = SEEN.values().next().value; SEEN.delete(first); }

  const member = getMember(user);
  const name   = member?.name?.split(' ')[0] || 'there';
  const msg    = text.trim();

  console.log(`💬 Message from ${member?.name || user}: ${msg.slice(0, 80)}`);

  // ── Special commands ───────────────────────────────────────────────────
  if (/^(hi|hey|hello|sup|yo)$/i.test(msg)) {
    await slack.chat.postMessage({
      channel,
      text: `Hey ${name}! 👋 I'm the *Central Brand OKR Bot*.\n\nYou can ask me things like:\n• _"What's my status on Builder's Mark?"_\n• _"What did we decide about the social strategy?"_\n• _"What are the current blockers for the brand team?"_\n• _"What's Varun expecting from me this week?"_\n\nOr just ask anything about the team's OKRs and meeting context.`,
    });
    return;
  }

  if (/^(help|\?)$/i.test(msg)) {
    await slack.chat.postMessage({
      channel,
      text: `*What I can help with:*\n• Answer questions about team OKRs and status\n• Surface decisions made in past meetings\n• Share context on any project or KR\n• Tell you about blockers the team has flagged\n\nJust ask in plain English!`,
    });
    return;
  }

  // ── Send typing indicator (post a "thinking" message first) ───────────
  const thinkingRes = await slack.chat.postMessage({
    channel,
    text: `_Thinking…_ 🧠`,
  });

  try {
    const answer = await askClaude(msg, member);

    // Update the thinking message with the real answer
    await slack.chat.update({
      channel,
      ts: thinkingRes.ts,
      text: answer,
    });
  } catch (err) {
    console.error('Claude error:', err.message);
    await slack.chat.update({
      channel,
      ts: thinkingRes.ts,
      text: `⚠️ Couldn't get an answer right now. Try again in a moment.`,
    });
  }
}

// ── Express app ────────────────────────────────────────────────────────────
const app = express();

// Raw body for signature verification
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf.toString(); }
}));

app.post('/slack/events', async (req, res) => {
  if (!verifySlack(req)) return res.status(401).send('Unauthorized');

  const { type, challenge, event } = req.body;

  // URL verification handshake
  if (type === 'url_verification') return res.json({ challenge });

  // Ack immediately
  res.sendStatus(200);

  // Handle DM messages
  if (type === 'event_callback' && event?.type === 'message' && event?.channel_type === 'im') {
    handleMessage(event).catch(e => console.error('handleMessage error:', e.message));
  }
});

app.get('/health', (req, res) => res.json({ ok: true, bot: 'Central Brand OKR Bot' }));

app.listen(PORT, () => {
  console.log([
    `🤖 Central Brand OKR Bot listening on port ${PORT}`,
    `   POST /slack/events  — Slack event subscriptions`,
    `   GET  /health        — health check`,
    ``,
    SIGNING_SECRET
      ? `   ✅ Slack signature verification ON`
      : `   ⚠️  SLACK_SIGNING_SECRET not set — accepting all requests (dev mode)`,
    ``,
    `   Expose with: ngrok http ${PORT}`,
    `   Then set in Slack app: Event Subscriptions → https://<ngrok-url>/slack/events`,
    `   Subscribe to bot event: message.im`,
  ].join('\n'));
});
