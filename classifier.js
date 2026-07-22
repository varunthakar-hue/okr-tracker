import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createHash } from 'crypto';

const __dir = dirname(fileURLToPath(import.meta.url));
const systemPrompt = readFileSync(join(__dir, '../prompts/classifier.md'), 'utf8');

const client = new Anthropic();

export async function runClassifier(rawFindings) {
  if (!rawFindings.length) return [];
  console.log(`[Classifier] Processing ${rawFindings.length} raw findings…`);

  const msg = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Classify these raw findings into structured events:\n\n${JSON.stringify(rawFindings, null, 2)}\n\nReturn a JSON array of structured events.`
      }
    ]
  });

  const events = extractJson(msg);

  // Back-fill deterministic event_id if model didn't compute it
  return events.map(e => ({
    ...e,
    event_id: e.event_id || computeId(e)
  }));
}

function computeId(e) {
  return createHash('sha256')
    .update(`${e.company}_${e.event_type}_${e.event_date}`)
    .digest('hex');
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
  throw new Error('Classifier returned no parseable JSON');
}
