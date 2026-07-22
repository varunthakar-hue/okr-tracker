import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const systemPrompt = readFileSync(join(__dir, '../prompts/research.md'), 'utf8');

const client = new Anthropic();

// IP slugs in the order we want to research them
const IP_SLUGS = [
  'kyc_know_your_category',
  'certified_cool',
  'stuff_i_wish_i_knew',
  'free_ka_gyan',
  'ai_did_this',
  'plot_twist',
  'bizarre_businesses',
  'startup_news',
  'memes'
];

export async function runResearch(targetIPs = IP_SLUGS) {
  console.log(`[Research] Hunting stories for ${targetIPs.length} IPs: ${targetIPs.join(', ')}`);

  const ipList = targetIPs.map(ip => `- ${ip.replace(/_/g, ' ')}`).join('\n');

  const msg = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 8192,
    system: systemPrompt,
    tools: [
      {
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: targetIPs.length * 4
      }
    ],
    messages: [
      {
        role: 'user',
        content: `Find 2–3 strong story candidates for each of the following Tier 3 content IPs. Today's date: ${new Date().toISOString().slice(0, 10)}.\n\nIPs to research:\n${ipList}\n\nFor Startup News, find 6–8 significant Indian startup stories from the last 14 days.\n\nReturn the full JSON story queue as specified.`
      }
    ]
  });

  const queue = extractJson(msg);
  console.log(`[Research] Story queue generated. IPs covered: ${Object.keys(queue).join(', ')}`);
  return queue;
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
  throw new Error('Research agent returned no parseable JSON');
}
