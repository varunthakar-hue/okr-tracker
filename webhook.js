import 'dotenv/config';
import { createServer } from 'http';
import { createHmac, timingSafeEqual } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { handleInteractivePayload } from './lib/slack.js';
import { handleTier3Payload } from './tier3/lib/slack.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const TIER3_DATA = join(__dir, 'tier3/data');

function loadJson(file, fallback) {
  const path = join(TIER3_DATA, file);
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8'));
}
function saveJson(file, data) {
  writeFileSync(join(TIER3_DATA, file), JSON.stringify(data, null, 2));
}

// Saves the story selected by the CM into approved_stories.json
function saveApprovedStory(ip, storyIndex, storyId, userId) {
  const queue = loadJson('story_queue.json', { stories: {} });
  const stories = queue.stories?.[ip] || [];
  const story = stories[storyIndex];
  if (!story) {
    console.warn(`[Webhook] Story not found: ${ip}[${storyIndex}]`);
    return;
  }
  const approved = loadJson('approved_stories.json', {});
  approved[ip] = { ...story, approved_by: userId, approved_at: new Date().toISOString() };
  saveJson('approved_stories.json', approved);
  console.log(`[Webhook] Story approved for ${ip}: ${storyId}`);
}

// Records the final content decision (approve/reject/edit)
function saveApprovedContent(storyId, decision, userId) {
  const log = loadJson('published_log.json', []);
  const entry = log.find(p => p.story_id === storyId);
  if (entry) {
    entry.content_decision = decision;
    entry.decided_by = userId;
    entry.decided_at = new Date().toISOString();
    saveJson('published_log.json', log);
  }
  console.log(`[Webhook] Content ${decision} for story ${storyId} by ${userId}`);
}

const PORT = process.env.WEBHOOK_PORT || 3001;
const SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;

createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200);
    res.end('ok');
    return;
  }

  if (req.method !== 'POST' || req.url !== '/slack/actions') {
    res.writeHead(404);
    res.end();
    return;
  }

  const rawBody = await readBody(req);

  if (!verifySignature(req.headers, rawBody)) {
    console.warn('[Webhook] ⚠️  Signature verification failed — request rejected');
    res.writeHead(401);
    res.end('Unauthorized');
    return;
  }

  // Slack sends interactive payloads as application/x-www-form-urlencoded with a `payload` field
  let payload;
  try {
    const params = new URLSearchParams(rawBody);
    payload = JSON.parse(params.get('payload'));
  } catch (err) {
    console.error('[Webhook] Failed to parse payload:', err.message);
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }

  // Acknowledge immediately — Slack requires a 200 within 3 seconds
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ response_action: 'clear' }));

  // Process async after ack
  try {
    const action = payload.actions?.[0];
    const isTier3 = action?.action_id?.startsWith('tier3_');
    if (isTier3) {
      await handleTier3Payload(payload, saveApprovedStory, saveApprovedContent);
    } else {
      await handleInteractivePayload(payload);
    }
  } catch (err) {
    console.error('[Webhook] handleInteractivePayload error:', err.message);
  }
}).listen(PORT, () => {
  console.log(`[Webhook] Listening on http://localhost:${PORT}/slack/actions`);
  console.log(`[Webhook] Health check: http://localhost:${PORT}/health`);
  if (!SIGNING_SECRET) {
    console.warn('[Webhook] ⚠️  SLACK_SIGNING_SECRET not set — all requests will be accepted (dev only)');
  }
});

function verifySignature(headers, rawBody) {
  if (!SIGNING_SECRET) return true; // dev fallback

  const timestamp = headers['x-slack-request-timestamp'];
  const slackSig = headers['x-slack-signature'];

  if (!timestamp || !slackSig) return false;

  // Reject requests older than 5 minutes (replay attack protection)
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  const sigBase = `v0:${timestamp}:${rawBody}`;
  const computed = 'v0=' + createHmac('sha256', SIGNING_SECRET).update(sigBase).digest('hex');

  try {
    return timingSafeEqual(Buffer.from(computed), Buffer.from(slackSig));
  } catch {
    return false;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}
