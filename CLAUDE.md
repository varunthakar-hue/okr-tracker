# Razorpay Founders Community OS

Multi-agent system that detects startup milestones, generates congratulatory content, routes through Slack approval, and publishes to social/messaging channels.

## Architecture
- **index.js** — Orchestrator. Run with `node index.js` or `node index.js --watch`.
- **agents/** — Five specialist agents: scout, classifier, content, approval, publisher.
- **lib/** — API helpers: Slack (approval), Ayrshare (social), MoEngage (WhatsApp + email stub).
- **prompts/** — System prompts for each LLM agent.
- **data/** — Local state: `founders.json`, `seen_events.json`, `event_log.json`, `rejected.json`.

## Setup
1. Copy `.env.example` to `.env` and fill in all keys.
2. `npm install`
3. Add founders to `data/founders.json`.
4. Run `node index.js`.

## Slack Interactivity
The approval flow uses Slack Block Kit buttons + multi-select. The webhook server (`webhook.js`) receives CM clicks.

**Dev setup (two terminals):**
```bash
# Terminal 1 — webhook server
node webhook.js

# Terminal 2 — expose it
ngrok http 3001
```
Copy the ngrok HTTPS URL and set it in your Slack app:
*Interactivity & Shortcuts → Request URL* → `https://<ngrok-id>.ngrok.io/slack/actions`

**Production:** deploy `webhook.js` to any Node host (Railway, Fly, etc.) and point the Slack app at the stable URL.

`SLACK_SIGNING_SECRET` must be set in `.env` for signature verification. Without it, the server accepts all requests (dev only — warns on startup).

## Key Rules
- Never publish without Slack approval.
- MoEngage is stubbed until `MOENGAGE_API_KEY` + `MOENGAGE_APP_ID` are set.
- All state is local JSON in `/data` — no external DB required.
