import { Hono } from 'hono';
import { HonoEnv } from '../types';
import { authMiddleware } from '../middleware/auth';

export const statusRouter = new Hono<HonoEnv>();

statusRouter.use('*', authMiddleware);

statusRouter.get('/', async (c) => {
  const user = c.get('user');
  
  // Fetch posts with their platform statuses
  const { results: posts } = await c.env.DB.prepare(`
    SELECT 
      p.id as postId,
      p.content,
      p.status as postStatus,
      p.scheduled_at as scheduledAt,
      p.created_at as createdAt,
      m.file_url as mediaUrl,
      m.type as mediaType
    FROM Posts p
    LEFT JOIN Media m ON p.media_id = m.id
    WHERE p.user_id = ?
    ORDER BY p.created_at DESC
  `).bind(user.id).all();

  const postsWithPlatforms = await Promise.all(posts.map(async (post: any) => {
    const { results: platforms } = await c.env.DB.prepare(`
      SELECT 
        pp.id as postPlatformId,
        pp.status,
        pp.response,
        pl.name as platformName
      FROM PostPlatforms pp
      JOIN Platforms pl ON pp.platform_id = pl.id
      WHERE pp.post_id = ?
    `).bind(post.postId).all();

    return {
      ...post,
      platforms: platforms.map((p: any) => ({
        ...p,
        response: p.response ? JSON.parse(p.response) : null
      }))
    };
  }));

  return c.json({ posts: postsWithPlatforms });
});

// Retry a specific failed platform job
statusRouter.post('/retry/:postPlatformId', async (c) => {
  const user = c.get('user');
  const postPlatformId = c.req.param('postPlatformId');

  const job = await c.env.DB.prepare(`
    SELECT 
      pp.id as postPlatformId,
      pp.post_id as postId,
      pp.platform_id as platformId,
      p.content,
      m.file_url as mediaUrl,
      pl.name as platformName
    FROM PostPlatforms pp
    JOIN Posts p ON pp.post_id = p.id
    JOIN Platforms pl ON pp.platform_id = pl.id
    LEFT JOIN Media m ON p.media_id = m.id
    WHERE pp.id = ? AND p.user_id = ?
  `).bind(postPlatformId, user.id).first();

  if (!job) {
    return c.json({ error: 'Job not found' }, 404);
  }

  // Push back to queue for retry
  await c.env.PUBLISH_QUEUE.send({
    postPlatformId: job.postPlatformId,
    postId: job.postId,
    platformId: job.platformId,
    platformName: job.platformName,
    userId: user.id,
    content: job.content,
    mediaR2Key: job.mediaUrl ? job.mediaUrl.replace(/^\//, '') : null
  });

  await c.env.DB.prepare('UPDATE PostPlatforms SET status = ? WHERE id = ?')
    .bind('pending', postPlatformId).run();

  return c.json({ success: true, message: 'Retry initiated' });
});
