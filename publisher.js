import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { publishPost } from '../lib/ayrshare.js';
import { sendWhatsApp, sendEmail } from '../lib/moengage.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const systemPrompt = readFileSync(join(__dir, '../prompts/publisher.md'), 'utf8');

const client = new Anthropic();
const SOCIAL_CHANNELS = new Set(['linkedin', 'twitter', 'instagram']);

export async function runPublisher(event, content, approval, founderMeta) {
  console.log(`[Publisher] Building publish plan for ${event.company}…`);

  // Use LLM to build the publish action list
  const msg = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 2048,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: JSON.stringify({ event, content, approval }, null, 2)
      }
    ]
  });

  const actions = extractJson(msg);
  const results = [];

  for (const action of actions) {
    try {
      let result;
      if (SOCIAL_CHANNELS.has(action.channel)) {
        result = await publishPost({ channel: action.channel, content });
      } else if (action.channel === 'whatsapp_dm') {
        result = await sendWhatsApp({
          to: founderMeta.whatsapp,
          message: content.whatsapp_dm,
          founderName: founderMeta.founders[0]
        });
      } else if (action.channel === 'email') {
        result = await sendEmail({
          to: founderMeta.email,
          subject: content.email_subject,
          body: content.email_body,
          founderName: founderMeta.founders[0]
        });
      } else if (action.channel === 'card') {
        console.log(`[Publisher] MANUAL TRIGGER — Card message for ${event.company}:\n${content.card_message}`);
        result = { channel: 'card', status: 'manual_trigger_logged' };
      }
      results.push({ ...action, status: 'done', result });
      console.log(`[Publisher] ✅ ${action.channel}`);
    } catch (err) {
      console.error(`[Publisher] ❌ ${action.channel}: ${err.message}`);
      results.push({ ...action, status: 'error', error: err.message });
    }
  }

  return results;
}

function extractJson(msg) {
  for (const block of msg.content) {
    if (block.type === 'text') {
      const match = block.text.match(/```json\n?([\s\S]*?)\n?```/) ||
                    block.text.match(/(\[[\s\S]*\])/);
      if (match) {
        try { return JSON.parse(match[1]); } catch { /* continue */ }
      }
    }
  }
  throw new Error('Publisher agent returned no parseable JSON');
}
