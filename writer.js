import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const systemPrompt = readFileSync(join(__dir, '../prompts/writer.md'), 'utf8');

const client = new Anthropic();

export async function runWriter(ip, story) {
  console.log(`[Writer] Generating content for ${ip} — story: ${story.story_id}`);

  const msg = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Write the full content package for this IP and story.\n\nIP: ${ip}\n\nStory:\n${JSON.stringify(story, null, 2)}\n\nReturn the JSON content object as specified.`
      }
    ]
  });

  const content = extractJson(msg);

  // Hard-enforce tweet character limits
  if (content.x_thread) {
    content.x_thread = content.x_thread.map(t => ({
      ...t,
      text: t.text.length > 280 ? t.text.slice(0, 277) + '…' : t.text,
      char_count: Math.min(t.text.length, 280)
    }));
  }
  if (content.x_single_post && content.x_single_post.length > 280) {
    content.x_single_post = content.x_single_post.slice(0, 277) + '…';
  }

  // Hard-enforce slide word counts
  if (content.slides) {
    content.slides = content.slides.map(slide => {
      const words = (slide.body || '').split(/\s+/).filter(Boolean);
      if (words.length > 40) {
        slide.body = words.slice(0, 40).join(' ') + '…';
        slide.word_count = 40;
        slide.truncated = true;
      }
      return slide;
    });
  }

  return { ...content, ip, story_id: story.story_id };
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
  throw new Error('Writer agent returned no parseable JSON');
}
