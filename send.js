require('dotenv').config();
const { WebClient } = require('@slack/web-api');
const fs = require('fs');
const path = require('path');
const { TEAM, VARUN_ID, MESSAGES, getWeekKey } = require('./config');

const DATA_PATH = path.join(__dirname, '../data/checkins.json');
const client = new WebClient(process.env.SLACK_BOT_TOKEN);

function loadData() {
  try { return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8')); } catch { return {}; }
}

function saveData(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

async function sendCheckins() {
  const data = loadData();
  const weekKey = getWeekKey();

  if (!data[weekKey]) {
    data[weekKey] = { sentAt: new Date().toISOString(), members: {} };
  }

  const sentNames = [];

  for (const member of TEAM) {
    const message = MESSAGES[member.id];
    if (!message) continue;

    try {
      const res = await client.chat.postMessage({ channel: member.id, text: message });
      data[weekKey].members[member.id] = {
        name: member.name,
        role: member.role,
        reportsTo: member.reportsTo,
        group: member.group,
        sentAt: new Date().toISOString(),
        dmChannelId: res.channel,
        botMsgTs: res.ts,
        replied: false,
        replyText: null,
        repliedAt: null,
      };
      sentNames.push(member.name.split(' ')[0]);
      console.log(`✅ Sent to ${member.name}`);
    } catch (err) {
      console.error(`❌ Failed to send to ${member.name}:`, err.message);
    }
  }

  saveData(data);

  const summary = `✅ Monday check-ins sent to: ${sentNames.join(', ')}. Responses expected by Wednesday.`;
  try {
    await client.chat.postMessage({ channel: VARUN_ID, text: summary });
    console.log('✅ Summary sent to Varun');
;
  } catch (err) {
    console.error('❌ Failed to DM Varun:', err.message);
  }
}

module.exports = { sendCheckins };
