import fetch from 'node-fetch';

const AYRSHARE_API_KEY = process.env.AYRSHARE_API_KEY;
const BASE = 'https://app.ayrshare.com/api';

const PLATFORM_MAP = {
  linkedin: 'linkedin',
  twitter: 'twitter',
  instagram: 'instagram'
};

// Standard single-post publish (used by the main Community OS)
export async function publishPost({ channel, content }) {
  const platform = PLATFORM_MAP[channel];
  if (!platform) throw new Error(`Unknown Ayrshare channel: ${channel}`);

  const textMap = {
    linkedin: content.linkedin_post,
    twitter: content.tweet,
    instagram: content.instagram_caption
  };

  const body = {
    post: textMap[channel],
    platforms: [platform]
  };

  const res = await fetch(`${BASE}/post`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${AYRSHARE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const json = await res.json();
  if (json.status === 'error') throw new Error(`Ayrshare error: ${json.message}`);
  return { channel, platform_post_id: json.id, status: 'published' };
}

// Publish a full X/Twitter thread.
// tweets: array of strings (each ≤280 chars). First tweet is the hook.
// linkReply: optional URL to post as reply #1 after the thread (keeps links out of main body).
export async function publishThread({ tweets, linkReply = null, scheduleDate = null }) {
  if (!tweets || tweets.length === 0) throw new Error('publishThread: no tweets provided');

  const body = {
    post: tweets[0],
    platforms: ['twitter'],
    twitterOptions: {
      thread: tweets.slice(1).map(t => ({ post: t }))
    }
  };

  if (scheduleDate) body.scheduleDate = scheduleDate;

  const res = await fetch(`${BASE}/post`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${AYRSHARE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const json = await res.json();
  if (json.status === 'error') throw new Error(`Ayrshare thread error: ${json.message}`);

  const threadPostId = json.postIds?.find(p => p.platform === 'twitter')?.id || json.id;

  // Post the link reply after the thread if provided
  if (linkReply && threadPostId) {
    await publishReply({ replyToId: threadPostId, text: linkReply });
  }

  return {
    channel: 'twitter',
    platform_post_id: threadPostId,
    tweet_count: tweets.length,
    status: 'published'
  };
}

// Post a reply tweet — used to attach source links after a thread
export async function publishReply({ replyToId, text }) {
  const body = {
    post: text,
    platforms: ['twitter'],
    twitterOptions: { replyToId }
  };

  const res = await fetch(`${BASE}/post`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${AYRSHARE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const json = await res.json();
  if (json.status === 'error') throw new Error(`Ayrshare reply error: ${json.message}`);
  return { status: 'replied', reply_id: json.id };
}

// Publish a LinkedIn document carousel.
// pdfUrl: publicly accessible URL to the carousel PDF exported from Canva.
export async function publishLinkedInCarousel({ pdfUrl, caption, scheduleDate = null }) {
  const body = {
    post: caption,
    platforms: ['linkedin'],
    mediaUrls: [pdfUrl],
    linkedinOptions: { documentPost: true }
  };

  if (scheduleDate) body.scheduleDate = scheduleDate;

  const res = await fetch(`${BASE}/post`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${AYRSHARE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const json = await res.json();
  if (json.status === 'error') throw new Error(`Ayrshare LinkedIn carousel error: ${json.message}`);
  return {
    channel: 'linkedin',
    platform_post_id: json.postIds?.find(p => p.platform === 'linkedin')?.id || json.id,
    status: 'published'
  };
}

// Fetch post analytics by Ayrshare post ID (called 72h post-publish by the performance tracker)
export async function getPostAnalytics(postId) {
  const res = await fetch(`${BASE}/analytics/post?id=${postId}`, {
    headers: { Authorization: `Bearer ${AYRSHARE_API_KEY}` }
  });
  const json = await res.json();
  if (json.status === 'error') throw new Error(`Ayrshare analytics error: ${json.message}`);
  return json;
}
