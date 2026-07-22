require('dotenv').config({ path: require('path').join(__dirname, '../.env'), override: true });
const { WebClient } = require('@slack/web-api');
const fs = require('fs');
const path = require('path');
const { TEAM, VARUN_ID, getWeekKey, weekLabel } = require('./config');

const client = new WebClient(process.env.SLACK_BOT_TOKEN);

const WEEKLY_TASKS_PATH = path.join(__dirname, '../data/weekly-tasks-cache.json');
const STATE_PATH = path.join(__dirname, '../data/weekly-state.json');

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); } catch { return {}; }
}
function saveState(s) { fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2)); }

async function sendWeeklyTaskMessages() {
  const weekKey = getWeekKey();
  const label = weekLabel(weekKey);
  const state = loadState();
  if (!state[weekKey]) state[weekKey] = { members: {} };

  const cache = JSON.parse(fs.readFileSync(WEEKLY_TASKS_PATH, 'utf8'));
  const tasksByMember = cache.members || {};

  const results = { sent: [], failed: [], skipped: [] };

  for (const member of TEAM) {
    const memberTasks = tasksByMember[member.id]?.tasks || [];
    const firstName = member.name.split(' ')[0];

    if (!memberTasks.length) {
      console.log(`⚠️  No tasks found for ${member.name} — skipping`);
      results.skipped.push(member.name);
      continue;
    }

    // Build numbered task list
    const taskLines = memberTasks
      .map((t, i) => `*${i + 1}.* ${t.task}\n   _(${t.okr})_`)
      .join('\n\n');

    // Reply format — numbered so they just reply "1. Done, 2. 80% blocked on X"
    const replyFormat = memberTasks
      .map((t, i) => `${i + 1}. [status / % done / blocker]`)
      .join('\n');

    const message = [
      `Hey ${firstName}! 👋 Here are your tasks for *${label}*:`,
      ``,
      taskLines,
      ``,
      `---`,
      `📝 *Please reply with a quick update on each:*`,
      `\`\`\``,
      replyFormat,
      `\`\`\``,
      `_Just reply to this message — one line per task is perfect. Use: Done ✅ / In Progress 🔄 / Blocked ⛔_`,
    ].join('\n');

    try {
      const res = await client.chat.postMessage({
        channel: member.id,
        text: message,
        unfurl_links: false,
      });

      if (!state[weekKey].members[member.id]) state[weekKey].members[member.id] = {};
      state[weekKey].members[member.id].mondayMsgTs = res.ts;
      state[weekKey].members[member.id].mondayDmChannel = res.channel;
      state[weekKey].members[member.id].mondaySentAt = new Date().toISOString();
      state[weekKey].members[member.id].name = member.name;
      state[weekKey].members[member.id].role = member.role;

      // ── CC Varun on every individual message ─────────────────────────────
      await client.chat.postMessage({
        channel: VARUN_ID,
        text: [
          `📋 *Sent to ${member.name}* (${member.role}):`,
          ``,
          message,
        ].join('\n'),
        unfurl_links: false,
      });

      console.log(`✅ Sent to ${member.name} + CC'd Varun`);
      results.sent.push(member.name);
    } catch (err) {
      console.error(`❌ Failed for ${member.name}:`, err.message);
      results.failed.push(member.name);
    }
  }

  saveState(state);

  // Final summary DM to Varun
  const summaryLines = [
    `✅ *All weekly task messages sent — ${label}*`,
    ``,
    `Sent (${results.sent.length}): ${results.sent.map(n => n.split(' ')[0]).join(', ')}`,
  ];
  if (results.skipped.length) summaryLines.push(`⚠️ Skipped (no tasks): ${results.skipped.join(', ')}`);
  if (results.failed.length) summaryLines.push(`❌ Failed: ${results.failed.join(', ')}`);
  summaryLines.push(``, `_You received a copy of each message above. Replies will appear on the dashboard._`);

  await client.chat.postMessage({
    channel: VARUN_ID,
    text: summaryLines.join('\n'),
  });

  console.log('\n📊 Summary:', results);
  return results;
}

sendWeeklyTaskMessages().catch(console.error);
