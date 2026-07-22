require('dotenv').config({ path: require('path').join(__dirname, '../.env'), override: true });
const { WebClient } = require('@slack/web-api');
const fs = require('fs');
const path = require('path');
const { TEAM, VARUN_ID, DUSHYANT_ID, DRIVE, getWeekKey, weekLabel } = require('./config');
const { parseOKRBuffer, tasksByMember } = require('./okr-parser');

const STATE_PATH = path.join(__dirname, '../data/weekly-state.json');
const client = new WebClient(process.env.SLACK_BOT_TOKEN);

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); } catch { return {}; }
}
function saveState(s) { fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2)); }

// Read OKR data from local cache (populated by Claude via Drive MCP)
async function fetchOKRTasks() {
  try {
    const cachePath = require('path').join(__dirname, '../data/okr-cache.json');
    if (!require('fs').existsSync(cachePath)) {
      console.warn('⚠️  OKR cache not found — Claude will sync it from Drive shortly.');
      return null;
    }
    return JSON.parse(require('fs').readFileSync(cachePath, 'utf8'));
  } catch (err) {
    console.error('OKR cache read error:', err.message);
    return null;
  }
}

// ── MONDAY: Week kickoff ──────────────────────────────────────────────────────
async function sendMondayCheckin() {
  const weekKey = getWeekKey();
  const state = loadState();
  if (!state[weekKey]) state[weekKey] = { members: {}, okrSnapshot: null };

  console.log(`📋 Fetching OKR tasks for ${weekKey}...`);
  const okrTasks = await fetchOKRTasks();
  if (okrTasks) state[weekKey].okrSnapshot = okrTasks;

  const byMember = okrTasks ? tasksByMember(okrTasks) : {};

  for (const member of TEAM) {
    const memberTasks = byMember[member.id]?.tasks || [];
    const taskLines = memberTasks.length > 0
      ? memberTasks.map((t, i) => `${i + 1}. *${t.kr.split('\n')[0].slice(0, 80)}*\n   _Status: ${t.status || '—'} | This week: ${t.thisWeekPlan?.slice(0, 100) || 'See tracker'}_`).join('\n')
      : '_No tasks found against your name in the OKR tracker this week._';

    const msg = [
      `Hey ${member.name.split(' ')[0]}! 👋 *Week of ${weekLabel(weekKey)} — Monday kickoff*`,
      '',
      `Here are your committed tasks this week from the OKR tracker:`,
      taskLines,
      '',
      `Please reply with:`,
      `*1.* CONFIRM tasks above OR list any changes`,
      `*2.* Last week's achievement on your KRs (1-2 lines)`,
      `*3.* This week's biggest risk or blocker`,
      '',
      `_Plain text is fine — your reply gets auto-compiled into the weekly review for Dushyant._`,
    ].join('\n');

    try {
      const res = await client.chat.postMessage({ channel: member.id, text: msg });
      if (!state[weekKey].members[member.id]) state[weekKey].members[member.id] = {};
      state[weekKey].members[member.id].mondayMsgTs = res.ts;
      state[weekKey].members[member.id].mondayDmChannel = res.channel;
      state[weekKey].members[member.id].mondaySentAt = new Date().toISOString();
      console.log(`✅ Monday check-in → ${member.name}`);
    } catch (err) {
      console.error(`❌ Monday DM failed for ${member.name}:`, err.message);
    }
  }

  saveState(state);
  await client.chat.postMessage({
    channel: VARUN_ID,
    text: `✅ Monday kickoff check-ins sent to all 10 team members for *${weekLabel(weekKey)}*. Replies will be compiled by EOD.`,
  });
}

// ── WEDNESDAY: Mid-week pulse ─────────────────────────────────────────────────
async function sendWednesdayCheckin() {
  const weekKey = getWeekKey();
  const state = loadState();

  for (const member of TEAM) {
    const msg = [
      `Hey ${member.name.split(' ')[0]}! 👋 *Mid-week check-in — Wednesday*`,
      '',
      `Quick pulse on where things stand:`,
      `*1.* What's shipped / done so far this week?`,
      `*2.* What's at risk or blocked?`,
      `*3.* Anything you need from Varun before Friday?`,
      '',
      `_One line per answer is perfect._`,
    ].join('\n');

    try {
      const res = await client.chat.postMessage({ channel: member.id, text: msg });
      if (!state[weekKey]) state[weekKey] = { members: {} };
      if (!state[weekKey].members[member.id]) state[weekKey].members[member.id] = {};
      state[weekKey].members[member.id].wednesdayMsgTs = res.ts;
      state[weekKey].members[member.id].wednesdayDmChannel = res.channel;
      state[weekKey].members[member.id].wednesdaySentAt = new Date().toISOString();
      console.log(`✅ Wednesday check-in → ${member.name}`);
    } catch (err) {
      console.error(`❌ Wednesday DM failed for ${member.name}:`, err.message);
    }
  }

  saveState(state);
}

// ── FRIDAY: End-of-week wrap ──────────────────────────────────────────────────
async function sendFridayCheckin() {
  const weekKey = getWeekKey();
  const state = loadState();

  for (const member of TEAM) {
    const msg = [
      `Hey ${member.name.split(' ')[0]}! 👋 *Friday wrap — end of week*`,
      '',
      `Last one for the week — this goes straight into the review doc:`,
      `*1.* What got done this week? (vs your committed tasks)`,
      `*2.* What's carrying over to next week + why?`,
      `*3.* One win to flag for the weekly review`,
      `*4.* Any blockers Varun should escalate?`,
      '',
      `_Your reply auto-populates the weekly review for Dushyant. Plain text is fine._`,
    ].join('\n');

    try {
      const res = await client.chat.postMessage({ channel: member.id, text: msg });
      if (!state[weekKey]) state[weekKey] = { members: {} };
      if (!state[weekKey].members[member.id]) state[weekKey].members[member.id] = {};
      state[weekKey].members[member.id].fridayMsgTs = res.ts;
      state[weekKey].members[member.id].fridayDmChannel = res.channel;
      state[weekKey].members[member.id].fridaySentAt = new Date().toISOString();
      console.log(`✅ Friday check-in → ${member.name}`);
    } catch (err) {
      console.error(`❌ Friday DM failed for ${member.name}:`, err.message);
    }
  }

  saveState(state);
}

// ── Collect replies for a check-in type ──────────────────────────────────────
async function collectReplies(type) {
  // type: 'monday' | 'wednesday' | 'friday'
  const weekKey = getWeekKey();
  const state = loadState();
  const week = state[weekKey];
  if (!week?.members) return state;

  for (const member of TEAM) {
    const memberState = week.members[member.id];
    if (!memberState) continue;

    const channelKey = `${type}DmChannel`;
    const tsKey = `${type}MsgTs`;
    const replyKey = `${type}Reply`;

    if (!memberState[channelKey] || !memberState[tsKey]) continue;

    try {
      const oldest = memberState[`${type}SentAt`]
        ? String(new Date(memberState[`${type}SentAt`]).getTime() / 1000)
        : memberState[tsKey];

      const res = await client.conversations.history({
        channel: memberState[channelKey],
        oldest,
        limit: 20,
      });

      const replies = (res.messages || [])
        .filter(m => m.user === member.id)
        .sort((a, b) => parseFloat(b.ts) - parseFloat(a.ts));

      if (replies.length > 0) {
        memberState[replyKey] = replies[0].text;
        memberState[`${replyKey}At`] = new Date(parseFloat(replies[0].ts) * 1000).toISOString();
        console.log(`📥 ${type} reply from ${member.name}`);
      }
    } catch (err) {
      console.error(`❌ Collect ${type} reply for ${member.name}:`, err.message);
    }
  }

  saveState(state);
  return state;
}

// ── DUSHYANT: End-of-week summary ────────────────────────────────────────────
async function sendDushyantSummary() {
  const weekKey = getWeekKey();
  const state = loadState();
  const week = state[weekKey] || {};
  const members = week.members || {};
  const okr = week.okrSnapshot || null;

  // Group team by group
  const groups = { social: [], brand: [], engage: [] };
  for (const member of TEAM) {
    if (groups[member.group]) groups[member.group].push(member);
  }

  const groupEmoji = { social: '📱', brand: '🎨', engage: '🤝' };
  const groupLabel = { social: 'Social Team', brand: 'Brand Team', engage: 'Engage / PMM' };

  const lines = [
    `👋 Hi Dushyant! Here's your *Brand & Social weekly summary* for *${weekLabel(weekKey)}*`,
    '',
    `Varun's team runs automated check-ins Mon/Wed/Fri. Here's the compiled view:`,
    '',
  ];

  // OKR progress snapshot
  if (okr) {
    lines.push(`*📊 OKR Progress Snapshot*`);
    const allOkrs = [...(okr.brand || []), ...(okr.social || []), ...(okr.engage || [])];
    const atRisk = allOkrs.filter(o => o.status === 'At Risk' || o.pct < 30);
    const onTrack = allOkrs.filter(o => o.status === 'On Track' || o.pct >= 60);
    lines.push(`• ✅ On Track: ${onTrack.length} KRs   ⚠️ At Risk: ${atRisk.length} KRs   📋 Total: ${allOkrs.length} KRs`);
    if (atRisk.length > 0) {
      lines.push(`• *At-risk KRs to watch:*`);
      atRisk.slice(0, 3).forEach(o => lines.push(`  – ${o.kr.slice(0, 80)} (${o.pct}%)`));
    }
    lines.push('');
  }

  // Per-team summary
  for (const [groupKey, groupMembers] of Object.entries(groups)) {
    if (groupMembers.length === 0) continue;
    lines.push(`*${groupEmoji[groupKey]} ${groupLabel[groupKey]}*`);

    for (const member of groupMembers) {
      const m = members[member.id] || {};
      const firstName = member.name.split(' ')[0];
      const fridayReply = m.fridayReply || m.wednesdayReply || null;
      const mondayReply = m.mondayReply || null;

      const replied = !!(m.fridayReply || m.wednesdayReply || m.mondayReply);
      const status = replied ? '✅' : '⏳';

      lines.push(`${status} *${member.name}* — ${member.role}`);
      if (fridayReply) {
        lines.push(`   _"${fridayReply.slice(0, 200)}${fridayReply.length > 200 ? '…' : ''}"_`);
      } else if (mondayReply) {
        lines.push(`   _Monday update: "${mondayReply.slice(0, 150)}${mondayReply.length > 150 ? '…' : ''}"_`);
      } else {
        lines.push(`   _No update received this week_`);
      }
    }
    lines.push('');
  }

  lines.push(`---`);
  lines.push(`*📋 Full weekly review doc* is being prepared and will be uploaded to Drive shortly.`);
  lines.push(`Ping Varun for any deep-dives. Have a great weekend! 🙌`);

  const text = lines.join('\n');

  try {
    await client.chat.postMessage({ channel: DUSHYANT_ID, text });
    console.log('✅ Dushyant summary sent');
    // Also notify Varun
    await client.chat.postMessage({
      channel: VARUN_ID,
      text: `✅ Weekly summary sent to Dushyant Panda for *${weekLabel(weekKey)}*. Review doc generating next.`,
    });
  } catch (err) {
    console.error('❌ Dushyant summary failed:', err.message);
    throw err;
  }
}

module.exports = { sendMondayCheckin, sendWednesdayCheckin, sendFridayCheckin, collectReplies, sendDushyantSummary };
