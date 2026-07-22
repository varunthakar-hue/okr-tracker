import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { renderDesign } from '../lib/canva.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const systemPrompt = readFileSync(join(__dir, '../prompts/designer.md'), 'utf8');

const client = new Anthropic();

export async function runDesigner(content) {
  console.log(`[Designer] Generating design brief for ${content.ip} — ${content.story_id}`);

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Generate the Canva design brief for this content.\n\nContent:\n${JSON.stringify(content, null, 2)}\n\nReturn the design brief JSON as specified.`
      }
    ]
  });

  const brief = extractJson(msg);
  console.log(`[Designer] Brief generated: ${brief.total_slides} slides, template: ${brief.template_id}`);

  // Attempt Canva render (stubbed until API key is configured)
  const renderResult = await renderDesign(brief);

  return { brief, renderResult };
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
  throw new Error('Designer agent returned no parseable JSON');
}
