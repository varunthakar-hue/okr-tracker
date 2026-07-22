#!/usr/bin/env node
/**
 * tier3/seed-story.js
 *
 * Manually inject a story into approved_stories.json so you can test
 * the produce pipeline (writer → quality → designer → publish) without
 * running the full research + Slack approval flow.
 *
 * Usage:
 *   node tier3/seed-story.js --ip kyc_know_your_category
 *   node tier3/seed-story.js --ip memes
 *   node tier3/seed-story.js --ip all   ← seeds every IP with a generic test story
 *
 * After seeding, run:
 *   node tier3/index.js --mode produce --ip <ip_name> --dry-run
 */

import { writeFileSync, readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dir, 'data');

const args = process.argv.slice(2);
const ip = argValue(args, '--ip') || 'all';

const SEED_STORIES = {
  kyc_know_your_category: {
    story_id: 'kyc_seed_001',
    headline: 'Food & beverage payments peak at 11:47 PM — not midnight',
    source_url: 'https://razorpay.com/blog/business-banking/fintech-ecosystem-report/',
    source_name: 'Razorpay Ecosystem Report',
    hook: 'Food delivery peaks at 11:47 PM. Not midnight. Not 11:30. 11:47.',
    key_data_point: '23% more orders in the 11:45–12:00 window vs any other 15-minute slot',
    why_it_works: 'Tells operators exactly when to run last-mile discounts and surge pricing',
    scores: { relevance: 9, counterintuitive: 9, specificity: 8 },
    total_score: 648,
    notes: 'Illustrative seed story — verify against actual Razorpay data before publishing'
  },
  certified_cool: {
    story_id: 'cc_seed_001',
    headline: 'This Mumbai startup sells death insurance to Gen Z through memes',
    source_url: 'https://inc42.com/',
    source_name: 'Inc42',
    hook: 'They converted 28% of their first Instagram Stories campaign. On a ₹1Cr seed round.',
    key_data_point: '28% conversion rate on Instagram Stories, 0 cold calls',
    why_it_works: 'Meme-native GTM reduces CAC to near zero for a high-consideration product',
    scores: { relevance: 8, counterintuitive: 9, specificity: 8 },
    total_score: 576,
    notes: 'Seed story — replace with real company before publishing'
  },
  stuff_i_wish_i_knew: {
    story_id: 'siwik_seed_001',
    headline: 'The 72-Hour Rule for Co-Founder Conflict',
    source_url: 'https://x.com/',
    source_name: 'X/Twitter operator thread',
    hook: 'Every co-founder dispute that blew up a startup I know had one thing in common: it got addressed in the first 24 hours.',
    key_data_point: '72 hours is the window — before it becomes identity, after the emotion cools',
    why_it_works: 'Specific, falsifiable, and something most founders get backwards',
    scores: { relevance: 9, counterintuitive: 8, specificity: 9 },
    total_score: 648,
    notes: 'Seed story — source a real founder quote before publishing'
  },
  free_ka_gyan: {
    story_id: 'fkg_seed_001',
    headline: 'HBR studied 800 salary negotiations. One phrase got 23% more.',
    source_url: 'https://hbr.org/',
    source_name: 'Harvard Business Review',
    hook: 'The phrase: "I want to make sure we\'re both comfortable with this." It signals confidence, not desperation.',
    key_data_point: '23% higher outcome when this phrase was used in opening offer',
    why_it_works: 'Directly applicable to founder fundraising and vendor negotiations',
    scores: { relevance: 8, counterintuitive: 8, specificity: 9 },
    total_score: 576,
    notes: 'Seed story — verify HBR study citation before publishing'
  },
  ai_did_this: {
    story_id: 'adt_seed_001',
    headline: 'This D2C brand replaced their entire WhatsApp support queue with Claude',
    source_url: 'https://twitter.com/',
    source_name: 'X/Twitter founder thread',
    hook: 'Cut support cost by 80%. Response time: 8 minutes → 40 seconds.',
    key_data_point: '80% cost reduction, 40-second response time, 94% CSAT maintained',
    why_it_works: 'Step-by-step workflow any operator can replicate in a weekend',
    scores: { relevance: 9, counterintuitive: 7, specificity: 9 },
    total_score: 567,
    notes: 'Seed story — replace with verified company and real metrics'
  },
  plot_twist: {
    story_id: 'pt_seed_001',
    headline: "Zerodha's bootstrapped unicorn story almost ended over ₹8 lakh",
    source_url: 'https://nithinkamath.me/',
    source_name: "Nithin Kamath's blog",
    hook: "Everyone knows Zerodha as the startup that said no to VC. They don't know about the ₹8 lakh they almost didn't have.",
    key_data_point: '₹8 lakh working capital crisis in 2011, 2 years before profitability',
    why_it_works: 'Backstory that changes how founders think about the "bootstrapped by choice" narrative',
    scores: { relevance: 8, counterintuitive: 9, specificity: 8 },
    total_score: 576,
    notes: 'Seed story — verify exact figures against public sources'
  },
  bizarre_businesses: {
    story_id: 'bb_seed_001',
    headline: 'A startup that trains retired grandmothers to fix smartphones',
    source_url: 'https://yourstory.com/',
    source_name: 'YourStory',
    hook: 'It sounds absurd. They have 10,000 technicians across 47 Tier 2 cities. Average age: 58.',
    key_data_point: '10,000 technicians, ₹2Cr monthly GMV, average technician age 58',
    why_it_works: 'Unlocks an entirely untapped labour market. Trust signal no competitor can replicate.',
    scores: { relevance: 8, counterintuitive: 9, specificity: 8 },
    total_score: 576,
    notes: 'Seed story — find real company or verify before publishing'
  },
  startup_news: {
    story_id: 'sn_seed_001',
    headline: 'Fortnight in Indian startups: the 6 stories that actually matter',
    source_url: 'https://inc42.com/',
    source_name: 'Inc42 / Entrackr / The Ken',
    hook: "This week wasn't about the big rounds. It was about the quiet signals.",
    key_data_point: '6 curated stories scored by ecosystem significance',
    why_it_works: 'Saves founders 3 hours of news reading. Perspective, not just headlines.',
    scores: { relevance: 9, counterintuitive: 6, specificity: 7 },
    total_score: 378,
    notes: 'Seed story — research agent should surface real current stories'
  },
  memes: {
    story_id: 'meme_seed_001',
    headline: 'The investor who asks about moat at a pre-seed meeting',
    source_url: 'https://twitter.com/',
    source_name: 'X/Twitter',
    hook: 'Investor: "What\'s your moat?" Founder, 4 months in, 12 users: ...',
    key_data_point: 'Universal founder pain — 100% recognition rate in Tier 1 founders',
    why_it_works: 'Inside joke that every founder has lived. Screenshot-worthy.',
    scores: { relevance: 9, counterintuitive: 5, specificity: 8 },
    total_score: 360,
    notes: 'Meme brief: Drake pointing. Panel 1: "Having a detailed moat strategy". Panel 2: "Having 12 users"'
  }
};

const ALL_IPS = Object.keys(SEED_STORIES);
const targetIPs = ip === 'all' ? ALL_IPS : [ip];

// Validate
for (const targetIP of targetIPs) {
  if (!SEED_STORIES[targetIP]) {
    console.error(`Unknown IP: ${targetIP}`);
    console.error(`Valid IPs: ${ALL_IPS.join(', ')}`);
    process.exit(1);
  }
}

// Load existing approved stories
const approvedPath = join(DATA, 'approved_stories.json');
const approved = existsSync(approvedPath)
  ? JSON.parse(readFileSync(approvedPath, 'utf8'))
  : {};

// Seed
for (const targetIP of targetIPs) {
  approved[targetIP] = {
    ...SEED_STORIES[targetIP],
    approved_by: 'seed-script',
    approved_at: new Date().toISOString()
  };
  console.log(`✅ Seeded story for: ${targetIP} (${SEED_STORIES[targetIP].story_id})`);
}

writeFileSync(approvedPath, JSON.stringify(approved, null, 2));
console.log(`\nApproved stories saved → tier3/data/approved_stories.json`);
console.log('\nNext steps:');
for (const targetIP of targetIPs) {
  console.log(`  node tier3/index.js --mode produce --ip ${targetIP} --dry-run`);
}

function argValue(args, flag) {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
}
