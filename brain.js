require('dotenv').config({ path: require('path').join(__dirname, '../.env'), override: true });
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { TEAM } = require('./config');

// Supports both direct Anthropic and Azure-hosted Anthropic
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

const client = makeClient();
const MODEL = process.env.AZURE_MODEL_LARGE || process.env.AZURE_MODEL_FAST || 'claude-sonnet-4-6';

const BRAIN_DIR   = path.join(__dirname, '../brain/meetings');
const INDEX_PATH  = path.join(__dirname, '../data/brain-index.json');

const TEAM_NAMES = TEAM.map(m => m.name);

// ── Load / save index ─────────────────────────────────────────────────────────
function loadIndex() {
  try { return JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8')); } catch { return []; }
}
function saveIndex(idx) {
  fs.writeFileSync(INDEX_PATH, JSON.stringify(idx, null, 2));
}

// ── Process a single transcript file ─────────────────────────────────────────
async function processTranscript(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const filename = path.basename(filePath);

  console.log(`🧠 Processing: ${filename}`);

  const prompt = `You are analysing a meeting transcript or notes for the Razorpay Brand & Social team.

Team members: ${TEAM_NAMES.join(', ')}.

Extract the following from the transcript and return ONLY a raw JSON object — no markdown, no explanation, no preamble, just the JSON:

{
  "title": "meeting title or topic",
  "date": "date string (infer from content or filename, else Unknown)",
  "attendees": ["only names from the team member list above"],
  "decisions": ["key decision 1 (max 8, be specific and sharp)"],
  "actionItems": {
    "Person Name": ["specific action item"]
  },
  "blockers": ["blocker or escalation raised"],
  "contextNuggets": ["important background context, strategy shifts, priorities, feedback given — things that explain WHY decisions were made"],
  "summary": "one sharp sentence summarising the meeting"
}

Keep each string concise but informative. Include all significant action items and decisions. For actionItems, only include team members from the list above.

TRANSCRIPT:
---
${raw.slice(0, 20000)}
---`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  // Gateway may return thinking block first — find the text block
  const textBlock = response.content.find(c => c.type === 'text');
  const text = textBlock?.text;
  if (!text) throw new Error('No text block in response');
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found in response');

  const parsed = JSON.parse(jsonMatch[0]);
  parsed.filename = filename;
  parsed.processedAt = new Date().toISOString();
  parsed.rawLength = raw.length;

  return parsed;
}

// ── Scan brain/ folder and process new files ──────────────────────────────────
async function syncBrain() {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.AZURE_ANTHROPIC_API_KEY) {
    console.error('❌ No Anthropic API key set in .env');
    return { error: 'No Anthropic API key — set ANTHROPIC_API_KEY or AZURE_ANTHROPIC_API_KEY in .env' };
  }

  const files = fs.readdirSync(BRAIN_DIR).filter(f =>
    f.endsWith('.txt') || f.endsWith('.md') || f.endsWith('.doc') ||
    f.endsWith('.docx') || f.endsWith('.vtt') || f.endsWith('.srt')
  );

  const index = loadIndex();
  const processed = new Set(index.map(m => m.filename));

  const results = { added: [], skipped: [], failed: [] };

  for (const file of files) {
    if (processed.has(file)) {
      results.skipped.push(file);
      continue;
    }
    try {
      const meeting = await processTranscript(path.join(BRAIN_DIR, file));
      index.unshift(meeting); // newest first
      results.added.push(file);
      console.log(`✅ Indexed: ${file} — "${meeting.title}"`);
    } catch (err) {
      console.error(`❌ Failed: ${file} —`, err.message);
      results.failed.push(file);
    }
  }

  saveIndex(index);
  console.log(`\n🧠 Brain sync complete. Added: ${results.added.length}, Skipped: ${results.skipped.length}, Failed: ${results.failed.length}`);
  return { results, total: index.length };
}

// ── Get context for a specific person ────────────────────────────────────────
function getPersonContext(memberName) {
  const index = loadIndex();
  const relevant = [];

  for (const meeting of index) {
    const actions = meeting.actionItems?.[memberName] || [];
    const mentioned = meeting.attendees?.includes(memberName);
    if (!actions.length && !mentioned) continue;

    relevant.push({
      title: meeting.title,
      date: meeting.date,
      summary: meeting.summary,
      actions,
      decisions: meeting.decisions || [],
      blockers: meeting.blockers || [],
      contextNuggets: meeting.contextNuggets || [],
    });
  }

  return relevant;
}

// ── Get all context nuggets (global brain) ────────────────────────────────────
function getAllContext() {
  const index = loadIndex();
  return index.map(m => ({
    title: m.title,
    date: m.date,
    summary: m.summary,
    attendees: m.attendees,
    decisions: m.decisions,
    actionItems: m.actionItems,
    blockers: m.blockers,
    contextNuggets: m.contextNuggets,
    filename: m.filename,
    processedAt: m.processedAt,
  }));
}

// ── Drive folder sync ─────────────────────────────────────────────────────────
const DRIVE_FOLDER_ID = '1Ys2wyC5O6_f8H_e-42-LSCv3YN_2moUm';
const DRIVE_SEEN_PATH = path.join(__dirname, '../data/drive-seen.json');

function loadDriveSeen() {
  try { return JSON.parse(fs.readFileSync(DRIVE_SEEN_PATH, 'utf8')); } catch { return {}; }
}
function saveDriveSeen(seen) {
  fs.writeFileSync(DRIVE_SEEN_PATH, JSON.stringify(seen, null, 2));
}

async function getGoogleAccessToken() {
  const saPath = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || path.join(__dirname, '../service-account.json');
  const resolvedPath = saPath.startsWith('./') ? path.join(__dirname, '..', saPath.slice(2)) : saPath;
  if (!fs.existsSync(resolvedPath)) throw new Error(`Service account JSON not found at ${resolvedPath}`);
  const sa = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));

  const { GoogleAuth } = require('google-auth-library');
  const auth = new GoogleAuth({
    credentials: sa,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  return token.token;
}

async function driveGet(url, token) {
  return new Promise((resolve, reject) => {
    const opts = new URL(url);
    https.get({ hostname: opts.hostname, path: opts.pathname + opts.search, headers: { Authorization: `Bearer ${token}` } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve({ _raw: data }); }
      });
    }).on('error', reject);
  });
}

async function driveDownloadText(fileId, token) {
  return new Promise((resolve, reject) => {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    const opts = new URL(url);
    https.get({ hostname: opts.hostname, path: opts.pathname + opts.search, headers: { Authorization: `Bearer ${token}` } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function syncBrainFromDrive() {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.AZURE_ANTHROPIC_API_KEY) {
    return { error: 'No Anthropic API key set' };
  }

  let token;
  try {
    token = await getGoogleAccessToken();
  } catch (err) {
    return { error: `Drive auth failed: ${err.message}` };
  }

  const query = encodeURIComponent(`'${DRIVE_FOLDER_ID}' in parents and trashed=false`);
  const listUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType,modifiedTime)&pageSize=100`;
  const listRes = await driveGet(listUrl, token);
  const files = listRes.files || [];

  const textMimes = ['text/plain', 'text/vtt', 'application/x-subrip'];
  const textExts  = ['.txt', '.md', '.vtt', '.srt'];
  const eligible  = files.filter(f =>
    textMimes.includes(f.mimeType) || textExts.some(e => f.name.toLowerCase().endsWith(e))
  );

  const seen = loadDriveSeen();
  const index = loadIndex();
  const processedFiles = new Set(index.map(m => m.filename));
  const results = { added: [], skipped: [], failed: [] };

  for (const file of eligible) {
    if (seen[file.id]) { results.skipped.push(file.name); continue; }

    try {
      console.log(`🌐 Downloading from Drive: ${file.name}`);
      const content = await driveDownloadText(file.id, token);

      // Save locally then process
      const safeName = file.name.replace(/[^a-zA-Z0-9_\-. ]/g, '_');
      const localPath = path.join(BRAIN_DIR, safeName);
      fs.writeFileSync(localPath, content, 'utf8');

      if (!processedFiles.has(safeName)) {
        const meeting = await processTranscript(localPath);
        index.unshift(meeting);
        results.added.push(file.name);
        console.log(`✅ Indexed from Drive: ${file.name} — "${meeting.title}"`);
      } else {
        results.skipped.push(file.name);
      }

      seen[file.id] = { name: file.name, downloadedAt: new Date().toISOString() };
    } catch (err) {
      console.error(`❌ Drive file failed: ${file.name} —`, err.message);
      results.failed.push(file.name);
    }
  }

  saveIndex(index);
  saveDriveSeen(seen);
  console.log(`\n🧠 Drive sync complete. Added: ${results.added.length}, Skipped: ${results.skipped.length}, Failed: ${results.failed.length}`);
  return { results, total: index.length };
}

module.exports = { syncBrain, syncBrainFromDrive, getPersonContext, getAllContext, loadIndex };
