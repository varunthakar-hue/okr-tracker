require('dotenv').config({ path: require('path').join(__dirname, '../../.env'), override: true });
const { TwitterApi } = require('twitter-api-v2');

let client;
function getClient() {
  if (!client) {
    client = new TwitterApi({
      appKey:       process.env.TWITTER_API_KEY,
      appSecret:    process.env.TWITTER_API_SECRET,
      accessToken:  process.env.TWITTER_ACCESS_TOKEN,
      accessSecret: process.env.TWITTER_ACCESS_SECRET,
    });
  }
  return client.readOnly;
}

async function getRazorpayMetrics() {
  try {
    const ro = getClient();

    // Get user profile + public metrics
    const user = await ro.v2.userByUsername('Razorpay', {
      'user.fields': ['public_metrics', 'description'],
    });

    const userId = user.data.id;
    const publicMetrics = user.data.public_metrics;

    // Get tweets from last 7 days
    const since = new Date();
    since.setDate(since.getDate() - 7);

    const tweets = await ro.v2.userTimeline(userId, {
      max_results: 100,
      'tweet.fields': ['public_metrics', 'created_at'],
      start_time: since.toISOString(),
      exclude: ['retweets', 'replies'],
    });

    const tweetList = tweets.data?.data || [];

    const totalImpressions = tweetList.reduce((s, t) => s + (t.public_metrics?.impression_count || 0), 0);
    const totalEngagements = tweetList.reduce((s, t) => s + (t.public_metrics?.like_count || 0) + (t.public_metrics?.retweet_count || 0) + (t.public_metrics?.reply_count || 0), 0);
    const avgEngagementRate = tweetList.length > 0
      ? ((totalEngagements / Math.max(totalImpressions, 1)) * 100).toFixed(2) + '%'
      : '—';

    return {
      followers: publicMetrics.followers_count?.toLocaleString('en-IN') || '—',
      following: publicMetrics.following_count || '—',
      tweetsLast7Days: tweetList.length,
      impressionsLast7Days: totalImpressions.toLocaleString('en-IN'),
      engagementsLast7Days: totalEngagements.toLocaleString('en-IN'),
      avgEngagementRate,
      topTweet: tweetList.sort((a, b) =>
        (b.public_metrics?.impression_count || 0) - (a.public_metrics?.impression_count || 0)
      )[0]?.text?.slice(0, 120) || '—',
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error('Twitter metrics error:', err.message);
    return { error: err.message, fetchedAt: new Date().toISOString() };
  }
}

module.exports = { getRazorpayMetrics };
