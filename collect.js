require('dotenv').config();
const { WebClient } = require('@slack/web-api');
const fs = require('fs');
const path = require('path');
const { getWeekKey } = require('./config');

const DATA_PATH = path.join(__dirname, '../data/checkins.json');
const client = new WebClient(process.env.SLACK_BOT_TOKEN);

function loadData() {
  try { return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8')); } catch { return {}; }
}

function saveData(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

async function collectReplies() {
  const data = loadData();
  const weekKey = getWeekKey();
  const week = data[weekKey];

  if (!week || !week.members) {
    console.log('No check-ins sent this week yet.');
    return data;
  }

  for (const [userId, member] of Object.entries(week.members)) {
    if (!member.dmChannelId || !member.sentAt) continue;

    try {
      const oldest = String(new Date(member.sentAt).getTime() / 1000);
      const res = await client.conversations.history({
        channel: member.dmChannelId,
        oldest,
        limit: 100,
      });

      const replies = (res.messages || [])
        .filter(m => m.user === userId)
        .sort((a, b) => parseFloat(b.ts) - parseFloat(a.ts));

      if (replies.length > 0) {
        const latest = replies[0];
        week.members[userId].replied = true;
        week.members[userId].replyText = latest.text;
        week.members[userId].repliedAt = new Date(parseFloat(latest.ts) * 1000).toISOString();
        console.log(`📥 Got reply from ${member.name}`);
      }
    } catch (err) {
      console.error(`❌ Failed to collect from ${member.name}:`, err.message);
    }
  }

  saveData(data);
  return data;
}

module.exports = { collectReplies };
