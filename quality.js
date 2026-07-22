import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const systemPrompt = readFileSync(join(__dir, '../prompts/quality.md'), 'utf8');

const client = new Anthropic();

export async function runQuality(content, story) {
  console.log(`[Quality] Checking ${content.ip} — ${content.story_id}`);

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: systemPrompt,
    tools: [
      {
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 3
      }
    ],
    messages: [
      {
        role: 'user',
        content: `Run fact verification, algorithm scoring, and brand tone check on this content.\n\nOriginal story source: ${story.source_url}\n\nContent:\n${JSON.stringify(content, null, 2)}\n\nReturn the quality check JSON as specified.`
      }
    ]
  });

  const result = extractJson(msg);
  console.log(`[Quality] Verdict: ${result.verdict} (score: ${result.algorithm_score})`);
  return result;
}

export function applyAutoFixes(content, qualityResult) {
  if (!qualityResult.auto_fixable || qualityResult.required_changes.length === 0) {
    return content;
  }

  let fixedContent = { ...content };

  // Auto-fix: replace flagged tone words
  for (const flag of qualityResult.tone_flags || []) {
    if (flag.text && flag.issue.includes('leverage')) {
      if (fixedContent.linkedin_caption) {
        fixedContent.linkedin_caption = fixedContent.linkedin_caption.replace(
          /\bleverage\b/gi, 'use'
        );
      }
      if (fixedContent.slides) {
        fixedContent.slides = fixedContent.slides.map(s => ({
          ...s,
          body: s.body ? s.body.replace(/\bleverage\b/gi, 'use') : s.body
        }));
      }
    }
  }

  console.log(`[Quality] Applied ${qualityResult.required_changes.length} auto-fixes`);
  return fixedContent;
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
  throw new Error('Quality agent returned no parseable JSON');
}
