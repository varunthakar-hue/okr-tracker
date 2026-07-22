const {
  Document, Packer, Paragraph, Table, TableRow, TableCell,
  TextRun, HeadingLevel, AlignmentType, WidthType, BorderStyle,
  ShadingType, convertInchesToTwip, PageOrientation,
} = require('docx');
const fs = require('fs');
const path = require('path');
const { TEAM, getWeekKey, weekLabel } = require('./config');

const STATE_PATH = path.join(__dirname, '../data/weekly-state.json');
const METRICS_PATH = path.join(__dirname, '../data/metrics-cache.json');
const REPORTS_DIR = path.join(__dirname, '../reports');

function loadState() { try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); } catch { return {}; } }
function loadMetrics() { try { return JSON.parse(fs.readFileSync(METRICS_PATH, 'utf8')); } catch { return {}; } }

// ── Colour palette ────────────────────────────────────────────────────────────
const C = {
  blue:   '1a56db',
  green:  '057a55',
  amber:  'b45309',
  red:    'c81e1e',
  grey:   '6b7280',
  white:  'ffffff',
  lightBlue: 'eff6ff',
  lightGreen:'f0fdf4',
  lightAmber:'fffbeb',
  lightRed:  'fef2f2',
  lightGrey: 'f9fafb',
};

function statusColor(status = '') {
  const s = status.toLowerCase();
  if (s.includes('on track') || s.includes('done') || s.includes('green')) return { bg: C.lightGreen, text: C.green };
  if (s.includes('code red') || s.includes('off track') || s.includes('red')) return { bg: C.lightRed,   text: C.red };
  if (s.includes('at risk') || s.includes('delayed') || s.includes('amber')) return { bg: C.lightAmber, text: C.amber };
  return { bg: C.lightGrey, text: C.grey };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function bold(text, size = 20) {
  return new TextRun({ text: String(text || ''), bold: true, size, font: 'Calibri' });
}
function normal(text, size = 20) {
  return new TextRun({ text: String(text || ''), size, font: 'Calibri' });
}
function colored(text, color, size = 20, isBold = false) {
  return new TextRun({ text: String(text || ''), color, bold: isBold, size, font: 'Calibri' });
}

function headerCell(text, bg = C.blue) {
  return new TableCell({
    shading: { type: ShadingType.SOLID, color: bg },
    children: [new Paragraph({ children: [bold(text, 18)], alignment: AlignmentType.CENTER })],
  });
}

function dataCell(children, bg) {
  const opts = { children: [new Paragraph({ children: Array.isArray(children) ? children : [children] })] };
  if (bg) opts.shading = { type: ShadingType.SOLID, color: bg };
  return new TableCell(opts);
}

function sectionHeading(text) {
  return new Paragraph({
    children: [bold(text, 24)],
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 100 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C.blue } },
  });
}

function spacer() { return new Paragraph({ text: '', spacing: { after: 100 } }); }

// ── Section 1: OKR Snapshot ───────────────────────────────────────────────────
function buildOKRSnapshot(okrSnapshot) {
  const allTasks = okrSnapshot
    ? [...(okrSnapshot.brand || []), ...(okrSnapshot.social || []), ...(okrSnapshot.engage || [])]
    : [];

  const rows = [
    new TableRow({
      tableHeader: true,
      children: ['OKR / Key Result', 'Owner', 'Target', 'Current', 'Status'].map(h => headerCell(h)),
    }),
    ...allTasks.slice(0, 20).map(t => {
      const sc = statusColor(t.status);
      return new TableRow({ children: [
        dataCell([normal(t.kr.split('\n')[0].slice(0, 100))]),
        dataCell([normal((Array.isArray(t.owner) ? t.owner.join(', ') : t.owner) || t.ownerRaw || '—')]),
        dataCell([normal(t.target)]),
        dataCell([normal(t.current || '—')]),
        dataCell([colored(t.status || '—', sc.text, 18, true)], sc.bg),
      ]});
    }),
  ];

  if (allTasks.length === 0) {
    rows.push(new TableRow({ children: [
      new TableCell({ columnSpan: 5, children: [new Paragraph({ children: [normal('No OKR data available — check Drive connection.')] })] }),
    ]}));
  }

  return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } });
}

// ── Section 2: Last Week Goals vs Actuals ─────────────────────────────────────
function buildGoalsVsActuals(weekMembers) {
  const rows = [
    new TableRow({
      tableHeader: true,
      children: ['Team Member', 'Committed Goal (Monday)', 'What Actually Happened (Friday)'].map(h => headerCell(h)),
    }),
  ];

  for (const member of TEAM) {
    const ms = weekMembers?.[member.id] || {};
    const goal = ms.mondayReply || '—';
    const actual = ms.fridayReply || '— (no Friday reply)';
    rows.push(new TableRow({ children: [
      dataCell([bold(member.name, 18)]),
      dataCell([normal(goal.slice(0, 300))]),
      dataCell([normal(actual.slice(0, 300))]),
    ]}));
  }

  return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } });
}

// ── Section 3: Input Metrics ──────────────────────────────────────────────────
function buildInputMetrics(okrSnapshot, twitterMetrics) {
  const tw = twitterMetrics || {};

  const metrics = [
    { metric: 'X / Twitter — Followers',           target: '300K by FY end',    actual: tw.followers || '—',                    status: '—' },
    { metric: 'X / Twitter — Posts (last 7 days)', target: '80 pieces/month',   actual: tw.tweetsLast7Days ? `${tw.tweetsLast7Days} posts` : '—', status: '—' },
    { metric: 'X / Twitter — Impressions (7d)',    target: '—',                  actual: tw.impressionsLast7Days || '—',          status: '—' },
    { metric: 'X / Twitter — Avg Engagement Rate', target: '—',                  actual: tw.avgEngagementRate || '—',             status: '—' },
    { metric: 'LinkedIn — Pieces published',        target: '20/month',           actual: '▶ See Social Metrics tab',             status: 'Manual' },
    { metric: 'Instagram — Reach (monthly)',         target: '—',                  actual: '▶ See Social Metrics tab',             status: 'Manual' },
    { metric: 'Talkwalker — Brand mentions',         target: '—',                  actual: '▶ See Social Metrics tab',             status: 'Manual' },
    { metric: 'NBT founders spotlighted',            target: '100/year',           actual: '—',                                    status: '—' },
    { metric: "Builder's Mark — deliveries",         target: '100 batch 1',        actual: '—',                                    status: '—' },
    { metric: 'Brand campaigns live',                target: '9 campaigns Q2',     actual: '—',                                    status: '—' },
    { metric: 'Founder content pieces',              target: '20/month',           actual: '—',                                    status: '—' },
  ];

  const rows = [
    new TableRow({
      tableHeader: true,
      children: ['Metric', 'Target', 'Actual (MTD)', 'Status'].map(h => headerCell(h)),
    }),
    ...metrics.map(m => {
      const sc = statusColor(m.status);
      return new TableRow({ children: [
        dataCell([normal(m.metric)]),
        dataCell([normal(m.target)]),
        dataCell([normal(m.actual)]),
        dataCell([colored(m.status, sc.text, 18, true)], m.status === 'Manual' ? C.lightAmber : undefined),
      ]});
    }),
  ];

  return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } });
}

// ── Section 4: Actions This Week ──────────────────────────────────────────────
function buildActionsTable(weekMembers, okrSnapshot) {
  const allTasks = okrSnapshot
    ? [...(okrSnapshot.brand || []), ...(okrSnapshot.social || []), ...(okrSnapshot.engage || [])]
    : [];

  const rows = [
    new TableRow({
      tableHeader: true,
      children: ['Action / Task', 'Owner', 'This Week Plan', 'Status'].map(h => headerCell(h)),
    }),
    ...allTasks.slice(0, 25).map(t => {
      const sc = statusColor(t.status);
      return new TableRow({ children: [
        dataCell([normal(t.kr.split('\n')[0].slice(0, 80))]),
        dataCell([normal((Array.isArray(t.owner) ? t.owner.join(', ') : t.owner) || t.ownerRaw || '—')]),
        dataCell([normal((t.nextWeekPlan || t.thisWeekPlan || '—').slice(0, 200))]),
        dataCell([colored(t.status || '—', sc.text, 18, true)], sc.bg),
      ]});
    }),
  ];

  return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } });
}

// ── Section 5: Blockers ───────────────────────────────────────────────────────
function buildBlockers(weekMembers) {
  const blockers = [];

  for (const member of TEAM) {
    const ms = weekMembers?.[member.id] || {};
    // Pull from Wednesday and Friday replies - look for blocker signals
    const wednesdayReply = ms.wednesdayReply || '';
    const fridayReply = ms.fridayReply || '';

    if (wednesdayReply || fridayReply) {
      blockers.push({ name: member.name, role: member.role, blocker: wednesdayReply || fridayReply });
    }
  }

  if (blockers.length === 0) {
    blockers.push({ name: '—', role: '—', blocker: 'No blockers reported this week.' });
  }

  const rows = [
    new TableRow({
      tableHeader: true,
      children: ['Team Member', 'Role', 'Blocker / Risk'].map(h => headerCell(h)),
    }),
    ...blockers.map(b => new TableRow({ children: [
      dataCell([bold(b.name, 18)]),
      dataCell([normal(b.role)]),
      dataCell([normal(b.blocker.slice(0, 300))]),
    ]})),
  ];

  return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } });
}

// ── Section 6: Social Metrics Tab ────────────────────────────────────────────
function buildSocialMetricsSection(twitterMetrics) {
  const tw = twitterMetrics || {};

  // Twitter (auto-filled)
  const twitterRows = [
    new TableRow({ tableHeader: true, children: ['X / Twitter Metric', 'Value', 'Source'].map(h => headerCell(h, '1d9bf0')) }),
    ...['Followers', 'Tweets (last 7 days)', 'Impressions (last 7 days)', 'Engagements (last 7 days)', 'Avg Engagement Rate', 'Top Tweet'].map((label, i) => {
      const values = [tw.followers, tw.tweetsLast7Days, tw.impressionsLast7Days, tw.engagementsLast7Days, tw.avgEngagementRate, tw.topTweet];
      return new TableRow({ children: [
        dataCell([normal(label)]),
        dataCell([normal(String(values[i] || '—'))]),
        dataCell([colored('Auto — Twitter API', C.green, 18)]),
      ]});
    }),
  ];

  // Instagram / LinkedIn / Talkwalker (manual)
  const manualHeaders = ['Platform', 'Metric', 'Value (paste here)', 'Notes'];
  const manualData = [
    ['Instagram', 'Reach (monthly)', '', ''],
    ['Instagram', 'Impressions (monthly)', '', ''],
    ['Instagram', 'Reel views (top post)', '', ''],
    ['Instagram', 'Follower count', '', ''],
    ['Instagram', 'Engagement rate', '', ''],
    ['LinkedIn', 'Page impressions', '', ''],
    ['LinkedIn', 'Posts published', '', ''],
    ['LinkedIn', 'Follower count', '', ''],
    ['LinkedIn', 'Top post reach', '', ''],
    ['Talkwalker', 'Brand mentions (weekly)', '', ''],
    ['Talkwalker', 'Sentiment (positive %)', '', ''],
    ['Talkwalker', 'Share of Voice', '', ''],
    ['Talkwalker', 'Top story / spike', '', ''],
  ];

  const manualRows = [
    new TableRow({ tableHeader: true, children: manualHeaders.map(h => headerCell(h, C.grey)) }),
    ...manualData.map(([platform, metric, value, notes]) => new TableRow({ children: [
      dataCell([colored(platform, C.blue, 18, true)]),
      dataCell([normal(metric)]),
      dataCell([normal(value || '')], C.lightAmber),
      dataCell([normal(notes || '')]),
    ]})),
  ];

  return [
    new Table({ rows: twitterRows, width: { size: 100, type: WidthType.PERCENTAGE } }),
    spacer(),
    new Paragraph({ children: [bold('Instagram · LinkedIn · Talkwalker — Fill in from dashboards', 20)], spacing: { before: 200, after: 100 } }),
    new Paragraph({ children: [colored('⚠ Paste values from Instagram Insights, LinkedIn Analytics, and Talkwalker below.', C.amber, 18)], spacing: { after: 100 } }),
    new Table({ rows: manualRows, width: { size: 100, type: WidthType.PERCENTAGE } }),
  ];
}

// ── Section 7: Big Wins ───────────────────────────────────────────────────────
function buildWins(weekMembers) {
  const wins = TEAM
    .map(m => ({ name: m.name, win: weekMembers?.[m.id]?.fridayReply || null }))
    .filter(w => w.win);

  if (wins.length === 0) return new Paragraph({ children: [normal('No wins reported yet — check back after Friday check-ins.')] });

  return new Table({
    rows: [
      new TableRow({ tableHeader: true, children: ['Team Member', 'Win / Highlight'].map(h => headerCell(h, C.green)) }),
      ...wins.map(w => new TableRow({ children: [
        dataCell([bold(w.name, 18)]),
        dataCell([normal(w.win.slice(0, 300))]),
      ]})),
    ],
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

// ── Main: generate full doc ───────────────────────────────────────────────────
async function generateWeeklyReview(weekKey) {
  weekKey = weekKey || getWeekKey();
  const state = loadState();
  const metrics = loadMetrics();
  const week = state[weekKey] || {};
  const weekMembers = week.members || {};
  const okrSnapshot = week.okrSnapshot;
  const twitterMetrics = metrics[weekKey]?.twitter;

  const wLabel = weekLabel(weekKey);
  const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 20 } },
      },
    },
    sections: [{
      properties: {},
      children: [
        // Cover block
        new Paragraph({ children: [bold('Individual Weekly Review', 36)], alignment: AlignmentType.CENTER, spacing: { after: 200 } }),
        new Paragraph({ children: [bold('Central Brand & Social', 28)], alignment: AlignmentType.CENTER, spacing: { after: 400 } }),

        new Table({
          rows: [
            new TableRow({ children: [headerCell('Field', C.blue), headerCell('Value', C.blue)] }),
            ...['Name|Varun Thakar', 'Team / Segment|Brand & Social', `Review Week|${wLabel}`, `Submitted On|${today}`, 'Manager|Dushyant'].map(s => {
              const [k, v] = s.split('|');
              return new TableRow({ children: [dataCell([bold(k, 18)]), dataCell([normal(v)])] });
            }),
          ],
          width: { size: 60, type: WidthType.PERCENTAGE },
        }),

        spacer(), spacer(),

        // 1. OKR Snapshot
        sectionHeading('1 · OKR Snapshot'),
        new Paragraph({ children: [colored(`Week of ${wLabel}. Data from OKR tracker. Targets are FY27 annual targets.`, C.grey, 18)], spacing: { after: 100 } }),
        buildOKRSnapshot(okrSnapshot),
        spacer(),

        // 2. Last Week Goals vs Actuals
        sectionHeading('2 · Last Week\'s Goals vs Actuals'),
        buildGoalsVsActuals(weekMembers),
        spacer(),

        // 3. Input Metrics
        sectionHeading('3 · Input Metrics'),
        buildInputMetrics(okrSnapshot, twitterMetrics),
        spacer(),

        // 4. Actions This Week
        sectionHeading('4 · Actions This Week'),
        buildActionsTable(weekMembers, okrSnapshot),
        spacer(),

        // 5. Blockers
        sectionHeading('5 · Blockers & Asks'),
        buildBlockers(weekMembers),
        spacer(),

        // 6. Wins
        sectionHeading('6 · Big Wins This Week'),
        buildWins(weekMembers),
        spacer(),

        // 7. Social Metrics
        sectionHeading('7 · Social Metrics'),
        new Paragraph({ children: [colored('Twitter/X data is auto-pulled via API. Instagram, LinkedIn, and Talkwalker require manual paste from your dashboards.', C.grey, 18)], spacing: { after: 100 } }),
        ...buildSocialMetricsSection(twitterMetrics),
        spacer(),

        // 8. Flag for Manager
        sectionHeading('8 · Flags for Dushyant'),
        new Paragraph({ children: [colored('Auto-flagged: items with "Code Red" or "Off Track" status, plus team-reported blockers.', C.grey, 18)], spacing: { after: 100 } }),
        ...buildManagerFlags(weekMembers, okrSnapshot),
      ],
    }],
  });

  // Save locally + flag for Claude to upload
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const filename = `Weekly_Review_${weekKey}.docx`;
  const filepath = path.join(REPORTS_DIR, filename);
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(filepath, buffer);
  const { markReportReady } = require('./drive-upload');
  markReportReady({ filepath, filename, weekKey });
  return { filepath, filename, buffer };
}

function buildManagerFlags(weekMembers, okrSnapshot) {
  const flags = [];
  const allTasks = okrSnapshot
    ? [...(okrSnapshot.brand || []), ...(okrSnapshot.social || []), ...(okrSnapshot.engage || [])]
    : [];

  const codeRed = allTasks.filter(t => t.status?.toLowerCase().includes('code red') || t.status?.toLowerCase().includes('off track'));
  codeRed.forEach((t, i) => {
    flags.push(`${i + 1} | 🔴 *${t.status?.toUpperCase()}* — ${t.kr.split('\n')[0].slice(0, 80)} (Owner: ${(Array.isArray(t.owner) ? t.owner.join(', ') : t.owner) || t.ownerRaw || '—'})`);
  });

  if (flags.length === 0) flags.push('No critical flags this week — all items on track or in progress.');

  return flags.map(f => new Paragraph({
    children: [normal(f)],
    bullet: { level: 0 },
    spacing: { after: 80 },
  }));
}

module.exports = { generateWeeklyReview };
