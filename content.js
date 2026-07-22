import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const systemPrompt = readFileSync(join(__dir, '../prompts/content.md'), 'utf8');

const client = new Anthropic();

export async function runContent(event, founderMeta) {
  console.log(`[Content] Generating content suite for ${event.company} — ${event.event_type}…`);

  const msg = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Generate the full content suite for this event:\n\n${JSON.stringify(event, null, 2)}\n\nFounder info:\n${JSON.stringify(founderMeta, null, 2)}\n\nReturn a single JSON object with all content pieces.`
      }
    ]
  });

  const content = extractJson(msg);
  // Enforce hard limits
  if (content.tweet && content.tweet.length > 280) {
    content.tweet = content.tweet.slice(0, 277) + '…';
  }
  if (content.whatsapp_dm && content.whatsapp_dm.length > 200) {
    content.whatsapp_dm = content.whatsapp_dm.slice(0, 197) + '…';
  }
  return { ...content, event_id: event.event_id };
}

function extractJson(msg) {
  for (const block of msg.content) {
    if (block.type === 'text') {
      const match = block.text.match(/```json\n?([\s\S]*?)\n?```/) ||
                    block.text.match(/(\{[\s\S]*\})/);
      if (match) {
        try { return JSON.parse(match[1]); } catch { /* continue */ }
      }
    }
  }
  throw new Error('Content agent returned no parseable JSON');
}
