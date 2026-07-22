import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createHash } from 'crypto';

import { runScout } from './agents/scout.js';
import { runClassifier } from './agents/classifier.js';
import { runContent } from './agents/content.js';
import { runApproval } from './agents/approval.js';
import { runPublisher } from './agents/publisher.js';
import { postError } from './lib/slack.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dir, 'data');

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const WATCH_MODE = args.includes('--watch');
const MANUAL_COMPANY = argValue(args, '--company');
const MANUAL_EVENT = argValue(args, '--event');
const POLL_INTERVAL_MS = 30 * 60 * 1000;

// ── Data helpers ──────────────────────────────────────────────────────────────
function loadJson(file, fallback) {
  const path = join(DATA, file);
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function saveJson(file, data) {
  writeFileSync(join(DATA, file), JSON.stringify(data, null, 2));
}

function eventHash(event) {
  return createHash('sha256')
    .update(`${event.company}_${event.event_type}_${event.event_date}`)
    .digest('hex');
}

// ── Main run ──────────────────────────────────────────────────────────────────
async function run() {
  console.log('\n=== Founders Community OS — run started', new Date().toISOString(), '===\n');

  const founders = loadJson('founders.json', []);
  const seenEvents = loadJson('seen_events.json', {});
  const eventLog = loadJson('event_log.json', []);
  const rejected = loadJson('rejected.json', []);

  if (!founders.length) {
    console.error('No founders in data/founders.json — add entries first.');
    process.exit(1);
  }

  // Manual override mode
  let watchlist = founders;
  if (MANUAL_COMPANY) {
    const existing = founders.find(f => f.company.toLowerCase() === MANUAL_COMPANY.toLowerCase());
    const entry = existing || {
      company: MANUAL_COMPANY,
      founders: [],
      sector: 'unknown',
      stage: 'unknown',
      cohort: 'manual'
    };
    watchlist = [entry];
    console.log(`[Orchestrator] Manual mode: ${MANUAL_COMPANY}${MANUAL_EVENT ? ` / ${MANUAL_EVENT}` : ''}`);
  }

  // ── Step 1: Scout ────────────────────────────────────────────────────────
  let rawFindings;
  try {
    if (MANUAL_COMPANY && MANUAL_EVENT) {
      rawFindings = [{
        company: MANUAL_COMPANY,
        headline: MANUAL_EVENT,
        source_url: 'manual',
        published_date: new Date().toISOString().slice(0, 10),
        snippet: MANUAL_EVENT,
        likely_event_type: 'UNKNOWN'
      }];
    } else {
      rawFindings = await runScout(watchlist);
    }
    console.log(`[Orchestrator] Scout found ${rawFindings.length} raw findings.`);
  } catch (err) {
    await notifyError('Scout agent failed', err);
    return;
  }

  if (!rawFindings.length) {
    console.log('[Orchestrator] No findings — done.');
    return;
  }

  // ── Step 2: Classify ─────────────────────────────────────────────────────
  let events;
  try {
    events = await runClassifier(rawFindings);
    console.log(`[Orchestrator] Classifier produced ${events.length} structured events.`);
  } catch (err) {
    await notifyError('Classifier agent failed', err);
    return;
  }

  // ── Step 3: Deduplicate ──────────────────────────────────────────────────
  const newEvents = events.filter(e => {
    const id = e.event_id || eventHash(e);
    return !seenEvents[id];
  });
  console.log(`[Orchestrator] ${newEvents.length} new events after dedup (${events.length - newEvents.length} already seen).`);

  for (const event of newEvents) {
    const founderMeta = founders.find(f => f.company === event.company) || {};

    try {
      // ── Step 4: Content ────────────────────────────────────────────────
      const content = await runContent(event, founderMeta);

      // ── Step 5: Approval ───────────────────────────────────────────────
      const approval = await runApproval(event, content);

      // Mark seen before publish so a crash doesn't cause duplicate posts
      seenEvents[event.event_id] = { seen_at: new Date().toISOString() };
      saveJson('seen_events.json', seenEvents);

      if (approval.decision === 'approve') {
        // ── Step 6: Publish ──────────────────────────────────────────────
        const publishResults = await runPublisher(event, content, approval, founderMeta);

        const logEntry = {
          event_id: event.event_id,
          company: event.company,
          event_type: event.event_type,
          approved_by: approval.approved_by,
          approved_at: approval.approved_at,
          publish_results: publishResults,
          logged_at: new Date().toISOString()
        };
        eventLog.push(logEntry);
        saveJson('event_log.json', eventLog);
        console.log(`[Orchestrator] ✅ ${event.company} published.`);
      } else {
        rejected.push({
          event_id: event.event_id,
          company: event.company,
          event_type: event.event_type,
          rejected_by: approval.approved_by,
          rejected_at: approval.approved_at,
          cm_notes: approval.cm_notes
        });
        saveJson('rejected.json', rejected);
        console.log(`[Orchestrator] ❌ ${event.company} rejected by CM.`);
      }
    } catch (err) {
      console.error(`[Orchestrator] Error processing ${event.company}:`, err.message);
      await notifyError(`Error processing ${event.company} (${event.event_type})`, err);
    }
  }

  console.log('\n=== Run complete', new Date().toISOString(), '===\n');
}

async function notifyError(msg, err) {
  console.error(`[Error] ${msg}:`, err.message);
  try {
    await postError(msg, err.stack || err.message);
  } catch (slackErr) {
    console.error('[Error] Could not post to Slack:', slackErr.message);
  }
}

// ── Entrypoint ────────────────────────────────────────────────────────────────
if (WATCH_MODE) {
  console.log(`[Orchestrator] Watch mode: polling every ${POLL_INTERVAL_MS / 60000} minutes.`);
  await run();
  setInterval(run, POLL_INTERVAL_MS);
} else {
  await run();
}

function argValue(args, flag) {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
}
