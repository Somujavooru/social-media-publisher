import { Hono } from 'hono';
import { HonoEnv } from '../types';
import { authMiddleware } from '../middleware/auth';

export const mediaRouter = new Hono<HonoEnv>();

mediaRouter.use('*', authMiddleware);

mediaRouter.post('/upload', async (c) => {
  const user = c.get('user');
  const body = await c.req.parseBody();
  const file = body['file'];

  if (!(file instanceof File)) {
    return c.json({ error: 'No valid file uploaded' }, 400);
  }

  const mediaId = crypto.randomUUID();
  const extension = file.name.split('.').pop();
  const objectKey = `${user.id}/${mediaId}.${extension}`;

  // Upload to R2
  await c.env.STORAGE.put(objectKey, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type }
  });

  const fileUrl = `/${objectKey}`;
  const type = file.type.startsWith('video') ? 'video' : 'image';

  // Save to DB
  await c.env.DB.prepare(
    'INSERT INTO Media (id, user_id, file_url, type) VALUES (?, ?, ?, ?)'
  ).bind(mediaId, user.id, fileUrl, type).run();

  return c.json({ success: true, media: { id: mediaId, url: fileUrl, type } });
});

// New endpoint to explicitly link media to a post
mediaRouter.put('/:id/link', async (c) => {
  const user = c.get('user');
  const mediaId = c.req.param('id');
  const { postId } = await c.req.json();
  
  // Verify media ownership
  const media = await c.env.DB.prepare('SELECT id FROM Media WHERE id = ? AND user_id = ?').bind(mediaId, user.id).first();
  if (!media) return c.json({ error: 'Media not found' }, 404);

  // Update Post to link this media
  await c.env.DB.prepare('UPDATE Posts SET media_id = ? WHERE id = ? AND user_id = ?').bind(mediaId, postId, user.id).run();
  
  return c.json({ success: true, message: 'Media linked to post successfully' });
});

mediaRouter.get('/', async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM Media WHERE user_id = ? ORDER BY created_at DESC'
  ).bind(user.id).all();
  return c.json({ media: results });
});
