import { getPostAnalytics } from '../../lib/ayrshare.js';
import { postError } from '../lib/slack.js';

// KPI targets from the strategy doc
const TARGETS = {
  linkedin: {
    swipe_through_rate: 0.40,   // >40% reaching final slide
    comment_rate: 0.01,          // >1% of impressions
    save_rate: 0.005,            // >0.5% of impressions
    engagement_rate: 0.04        // >4%
  },
  twitter: {
    reply_rate: 0.02,            // >2% of impressions
    bookmark_rate: 0.01,         // >1% of impressions
    thread_completion_rate: 0.30 // >30% reaching final tweet
  }
};

// Check the published_log for posts that are 72h+ old with no analytics recorded.
// Pull analytics via Ayrshare and attach the performance snapshot.
export async function runPerformanceTracker(publishedLog) {
  const now = Date.now();
  const WINDOW_72H = 72 * 60 * 60 * 1000;
  const WINDOW_7D  =  7 * 24 * 60 * 60 * 1000;

  let updated = false;

  for (const entry of publishedLog) {
    if (entry.analytics_pulled) continue; // already done
    if (!entry.published_at) continue;
    if (!entry.publish_result?.platform_post_id) continue;

    const age = now - new Date(entry.published_at).getTime();
    if (age < WINDOW_72H) continue;  // too early
    if (age > WINDOW_7D)  continue;  // too old to bother

    try {
      const raw = await getPostAnalytics(entry.publish_result.platform_post_id);
      const snapshot = normalise(entry.platform, raw);
      const scored = score(entry.platform, snapshot);

      entry.analytics = snapshot;
      entry.performance_score = scored.score;
      entry.performance_flags = scored.flags;
      entry.analytics_pulled = new Date().toISOString();

      console.log(`[Performance] ${entry.ip} (${entry.platform}): score ${scored.score}/100`);
      if (scored.flags.length > 0) {
        console.log(`  Underperforming: ${scored.flags.join(', ')}`);
      }

      updated = true;
    } catch (err) {
      console.error(`[Performance] Failed for ${entry.ip} ${entry.publish_result.platform_post_id}: ${err.message}`);
    }
  }

  return { updated, log: publishedLog };
}

// Build a learning summary from the last 4 weeks of analytics.
// Used by the research agent to understand what's working.
export function buildLearningSummary(publishedLog) {
  const withAnalytics = publishedLog.filter(e => e.analytics && e.performance_score != null);
  if (withAnalytics.length === 0) return null;

  const byIP = {};
  for (const entry of withAnalytics) {
    if (!byIP[entry.ip]) byIP[entry.ip] = [];
    byIP[entry.ip].push(entry);
  }

  const summary = {};
  for (const [ip, entries] of Object.entries(byIP)) {
    const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
    summary[ip] = {
      posts_analysed: entries.length,
      avg_performance_score: Math.round(avg(entries.map(e => e.performance_score))),
      avg_algorithm_score: Math.round(avg(entries.map(e => e.algorithm_score || 0))),
      top_performing_story: entries.sort((a, b) => b.performance_score - a.performance_score)[0]?.story_id,
      common_flags: getMostCommonFlags(entries)
    };
  }

  return summary;
}

function normalise(platform, raw) {
  // Ayrshare analytics shape varies by platform — normalise to a common structure
  if (platform === 'linkedin') {
    return {
      impressions: raw.impressions || raw.views || 0,
      clicks: raw.clicks || 0,
      likes: raw.likes || raw.reactions || 0,
      comments: raw.comments || 0,
      saves: raw.saves || raw.bookmarks || 0,
      shares: raw.shares || raw.reposts || 0,
      engagement_rate: raw.engagementRate || 0
    };
  }
  if (platform === 'twitter') {
    return {
      impressions: raw.impressions || raw.views || 0,
      likes: raw.likes || raw.favoriteCount || 0,
      replies: raw.replies || raw.replyCount || 0,
      retweets: raw.retweets || raw.retweetCount || 0,
      bookmarks: raw.bookmarks || raw.bookmarkCount || 0,
      quotes: raw.quotes || raw.quoteCount || 0
    };
  }
  return raw;
}

function score(platform, analytics) {
  const flags = [];
  let points = 100;

  if (platform === 'linkedin') {
    const { impressions, comments, saves, likes, shares } = analytics;
    if (impressions === 0) return { score: 0, flags: ['no_impressions'] };

    const commentRate = comments / impressions;
    const saveRate = saves / impressions;
    const engRate = (likes + comments + saves + shares) / impressions;

    if (commentRate < TARGETS.linkedin.comment_rate) {
      points -= 25;
      flags.push(`low_comment_rate (${(commentRate * 100).toFixed(2)}% vs ${(TARGETS.linkedin.comment_rate * 100)}% target)`);
    }
    if (saveRate < TARGETS.linkedin.save_rate) {
      points -= 20;
      flags.push(`low_save_rate (${(saveRate * 100).toFixed(2)}% vs ${(TARGETS.linkedin.save_rate * 100)}% target)`);
    }
    if (engRate < TARGETS.linkedin.engagement_rate) {
      points -= 15;
      flags.push(`low_engagement_rate (${(engRate * 100).toFixed(2)}% vs ${(TARGETS.linkedin.engagement_rate * 100)}% target)`);
    }
  }

  if (platform === 'twitter') {
    const { impressions, replies, bookmarks } = analytics;
    if (impressions === 0) return { score: 0, flags: ['no_impressions'] };

    const replyRate = replies / impressions;
    const bookmarkRate = bookmarks / impressions;

    if (replyRate < TARGETS.twitter.reply_rate) {
      points -= 30;
      flags.push(`low_reply_rate (${(replyRate * 100).toFixed(2)}% vs ${(TARGETS.twitter.reply_rate * 100)}% target)`);
    }
    if (bookmarkRate < TARGETS.twitter.bookmark_rate) {
      points -= 25;
      flags.push(`low_bookmark_rate (${(bookmarkRate * 100).toFixed(2)}% vs ${(TARGETS.twitter.bookmark_rate * 100)}% target)`);
    }
  }

  return { score: Math.max(0, points), flags };
}

function getMostCommonFlags(entries) {
  const counts = {};
  for (const e of entries) {
    for (const f of (e.performance_flags || [])) {
      const key = f.split(' ')[0]; // normalise "low_comment_rate (0.3%...)" → "low_comment_rate"
      counts[key] = (counts[key] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([flag]) => flag);
}
