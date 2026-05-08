import { Hono } from 'hono';
import { HonoEnv } from '../types';
import { authMiddleware } from '../middleware/auth';

export const scheduleRouter = new Hono<HonoEnv>();
scheduleRouter.use('*', authMiddleware);

scheduleRouter.post('/', async (c) => {
  const user = c.get('user');
  const { content, platform_contents, platforms, scheduled_at, media_id } = await c.req.json();

  if ((!content && !platform_contents) || !platforms || platforms.length === 0) {
    return c.json({ error: 'Content and at least one platform are required' }, 400);
  }
  if (!scheduled_at) {
    return c.json({ error: 'scheduled_at is required' }, 400);
  }

  const scheduledTime = new Date(scheduled_at);
  if (scheduledTime <= new Date()) {
    return c.json({ error: 'Scheduled time must be in the future' }, 400);
  }

  // Auto-seed user
  const userRecord = await c.env.DB.prepare('SELECT id FROM Users WHERE id = ?').bind(user.id).first();
  if (!userRecord) {
    await c.env.DB.prepare('INSERT INTO Users (id, email, password_hash) VALUES (?, ?, ?)')
      .bind(user.id, user.email || 'mock@example.com', 'auto-seeded').run();
  }

  // Platform lookup (mirrors posts.ts logic)
  const validPlatforms: Array<{ id: string; name: string }> = [];
  for (const p of platforms) {
    const dbNameMap: Record<string, string> = {
      'linkedin': 'LinkedIn',
      'x': 'X (Twitter)',
      'facebook': 'Facebook',
      'instagram': 'Instagram',
      'threads': 'Threads'
    };
    const dbName = dbNameMap[p] || p;
    const isX = p === 'x';

    let rec = await c.env.DB.prepare(
      'SELECT id, name, credentials_ref FROM Platforms WHERE name = ? AND user_id = ?'
    ).bind(dbName, user.id).first();

    if (!rec && isX) {
      rec = await c.env.DB.prepare(
        'SELECT id, name, credentials_ref FROM Platforms WHERE name = ? AND user_id = ?'
      ).bind('X', user.id).first();
    }

    // Replace stale X mock record
    if (rec && isX) {
      const cStr = await c.env.KV.get(rec.credentials_ref as string);
      if (cStr && !JSON.parse(cStr).apiKey) {
        await c.env.KV.delete(rec.credentials_ref as string);
        await c.env.DB.prepare('DELETE FROM Platforms WHERE id = ?').bind(rec.id).run();
        rec = null;
      }
    }

    if (!rec) {
      if (isX && c.env.X_API_KEY) {
        const pid = crypto.randomUUID();
        const ref = `creds_${pid}`;
        await c.env.DB.prepare('INSERT INTO Platforms (id, user_id, name, credentials_ref) VALUES (?, ?, ?, ?)')
          .bind(pid, user.id, 'X (Twitter)', ref).run();
        await c.env.KV.put(ref, JSON.stringify({
          apiKey: c.env.X_API_KEY, apiSecret: c.env.X_API_SECRET,
          accessToken: c.env.X_ACCESS_TOKEN, accessSecret: c.env.X_ACCESS_SECRET,
        }));
        rec = { id: pid, name: 'X (Twitter)', credentials_ref: ref };
      } else {
        return c.json({ error: `Platform ${dbName} not connected.` }, 400);
      }
    }

    const creds = await c.env.KV.get(rec.credentials_ref as string);
    if (!creds) return c.json({ error: `Credentials missing for ${dbName}.` }, 400);
    validPlatforms.push({ id: rec.id as string, name: (rec.name || dbName) as string });
  }

  // Upload image to R2
  let mediaR2Key: string | null = null;
  let dbMediaId: string | null = null;
  if (media_id && typeof media_id === 'string' && media_id.startsWith('data:')) {
    const mimeMatch = media_id.match(/^data:([^;]+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const ext = mimeType.split('/')[1] || 'jpg';
    const base64Data = media_id.split(',')[1];
    const binaryStr = atob(base64Data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
    const mediaUUID = crypto.randomUUID();
    mediaR2Key = `${user.id}/${mediaUUID}.${ext}`;
    await c.env.STORAGE.put(mediaR2Key, bytes.buffer, { httpMetadata: { contentType: mimeType } });
    await c.env.DB.prepare('INSERT INTO Media (id, user_id, file_url, type) VALUES (?, ?, ?, ?)')
      .bind(mediaUUID, user.id, mediaR2Key, 'image').run();
    dbMediaId = mediaUUID;
  }

  // Insert Post row
  const postId = crypto.randomUUID();
  const now = new Date().toISOString();
  const baseContent = content || JSON.stringify(platform_contents);
  await c.env.DB.prepare(
    'INSERT INTO Posts (id, user_id, content, media_id, status, scheduled_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(postId, user.id, baseContent, dbMediaId, 'scheduled', scheduledTime.toISOString(), now, now).run();

  // Build queue jobs + PostPlatforms rows
  const jobs: any[] = [];
  for (const platform of validPlatforms) {
    const postPlatformId = crypto.randomUUID();
    const key = platform.name === 'LinkedIn' ? 'linkedin' : platform.name === 'X (Twitter)' ? 'x' : platform.name.toLowerCase();
    const specificContent = platform_contents?.[key] || content || '';
    await c.env.DB.prepare('INSERT INTO PostPlatforms (id, post_id, platform_id, status) VALUES (?, ?, ?, ?)')
      .bind(postPlatformId, postId, platform.id, 'scheduled').run();
    jobs.push({ postPlatformId, postId, platformId: platform.id, platformName: platform.name, userId: user.id, content: specificContent, mediaR2Key });
  }

  // Set Durable Object Alarm
  try {
    const doId = c.env.PUBLISH_DO.idFromName(postId);
    const stub = c.env.PUBLISH_DO.get(doId);
    await stub.fetch('http://do-internal/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduledAt: scheduledTime.getTime(), postId, jobs }),
    });
    console.log(`[Schedule] DO alarm set for postId ${postId} at ${scheduledTime.toISOString()}`);
  } catch (doErr: any) {
    console.error('[Schedule] DO alarm failed (post still saved):', doErr.message);
  }

  return c.json({ success: true, postId, scheduledAt: scheduledTime.toISOString() });
});
