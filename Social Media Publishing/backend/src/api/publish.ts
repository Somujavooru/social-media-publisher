import { Hono } from 'hono';
import { HonoEnv } from '../types';
import { PlatformIntegrationFactory } from '../platforms';
import { authMiddleware } from '../middleware/auth';

export const publishRouter = new Hono<HonoEnv>();

publishRouter.use('*', authMiddleware);

// Generic instant publish route
publishRouter.post('/', async (c) => {
  const user = c.get('user');
  const { content, platforms, media_id, platform_contents } = await c.req.json();

  if (!content || !platforms || platforms.length === 0) {
    return c.json({ error: 'Content and at least one platform are required' }, 400);
  }

  // 1. Save to D1 History first
  const postId = crypto.randomUUID();
  const now = new Date().toISOString();
  
  await c.env.DB.prepare(
    'INSERT INTO Posts (id, user_id, content, media_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(postId, user.id, content, media_id || null, 'publishing', now, now).run();

  const factory = new PlatformIntegrationFactory();
  const results = [];

  for (const pName of platforms) {
    const postPlatformId = crypto.randomUUID();
    try {
      const dbNameMap: Record<string, string> = {
        'linkedin': 'LinkedIn',
        'x': 'X (Twitter)',
        'facebook': 'Facebook',
        'instagram': 'Instagram',
        'threads': 'Threads'
      };
      const dbName = dbNameMap[pName] || pName;
      
      // Insert pending status
      await c.env.DB.prepare(
        'INSERT INTO PostPlatforms (id, post_id, platform_id, status) SELECT ?, ?, id, ? FROM Platforms WHERE name = ? AND user_id = ?'
      ).bind(postPlatformId, postId, 'pending', dbName, user.id).run();

      // Fetch platform credentials
      const platformRecord = await c.env.DB.prepare(
        'SELECT id, credentials_ref FROM Platforms WHERE name = ? AND user_id = ?'
      ).bind(dbName, user.id).first();

      if (!platformRecord) {
        throw new Error('Platform not connected');
      }

      const credsString = await c.env.KV.get(platformRecord.credentials_ref as string);
      if (!credsString) {
        throw new Error('Credentials missing');
      }

      const adapter = factory.getAdapter(dbName);
      const specificContent = platform_contents?.[pName] || content;
      
      const response = await adapter.publish({
        content: specificContent,
        mediaId: media_id,
        credentials: JSON.parse(credsString)
      });

      // Update success
      await c.env.DB.prepare('UPDATE PostPlatforms SET status = ?, response = ? WHERE id = ?')
        .bind('success', JSON.stringify(response), postPlatformId).run();

      results.push({ platform: pName, status: 'success', response });
    } catch (e: any) {
      await c.env.DB.prepare('UPDATE PostPlatforms SET status = ?, response = ? WHERE id = ?')
        .bind('failed', JSON.stringify({ error: e.message }), postPlatformId).run();
      results.push({ platform: pName, status: 'error', message: e.message });
    }
  }

  // Update overall post status
  const { results: remaining } = await c.env.DB.prepare(
    "SELECT id FROM PostPlatforms WHERE post_id = ? AND status != 'success'"
  ).bind(postId).all();

  const finalStatus = remaining.length === 0 ? 'published' : 'failed';
  await c.env.DB.prepare('UPDATE Posts SET status = ? WHERE id = ?').bind(finalStatus, postId).run();

  return c.json({ postId, status: finalStatus, results });
});

// Legacy X-specific route
publishRouter.post('/x', async (c) => {
  const { content, media_id } = await c.req.json();
  const credentials = {
    apiKey: c.env.X_API_KEY,
    apiSecret: c.env.X_API_SECRET,
    accessToken: c.env.X_ACCESS_TOKEN,
    accessSecret: c.env.X_ACCESS_SECRET,
  };
  const factory = new PlatformIntegrationFactory();
  const adapter = factory.getAdapter('X (Twitter)');
  try {
    const response = await adapter.publish({ content, mediaId: media_id, credentials });
    return c.json(response);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});
