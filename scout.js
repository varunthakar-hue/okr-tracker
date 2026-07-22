import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const systemPrompt = readFileSync(join(__dir, '../prompts/scout.md'), 'utf8');

const client = new Anthropic();

export async function runScout(founders) {
  console.log(`[Scout] Searching for news on ${founders.length} companies…`);

  const companySummary = founders.map(f =>
    `${f.company} (${f.sector}, ${f.stage}) — founders: ${f.founders.join(', ')}`
  ).join('\n');

  const msg = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 4096,
    system: systemPrompt,
    tools: [
      {
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: founders.length * 3
      }
    ],
    messages: [
      {
        role: 'user',
        content: `Search for recent startup news (last 30 days) for these companies:\n\n${companySummary}\n\nReturn a JSON array of findings as specified.`
      }
    ]
  });

  return extractJson(msg);
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
  throw new Error('Scout returned no parseable JSON');
}
