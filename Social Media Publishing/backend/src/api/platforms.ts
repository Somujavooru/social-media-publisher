import { Hono } from 'hono';
import { HonoEnv } from '../types';

export const platformsRouter = new Hono<HonoEnv>();

// Added GET /me route to verify which accounts are actually stored in the D1 database
platformsRouter.get('/me', async (c) => {
  const userId = 'mock-user';
  // Use existing Platforms table structure per schema.sql
  const { results } = await c.env.DB.prepare(
    'SELECT id, name FROM Platforms WHERE user_id = ?'
  ).bind(userId).all();
  return c.json({ connectedPlatforms: results });
});

platformsRouter.get('/', async (c) => {
  const userId = 'mock-user';
  const { results } = await c.env.DB.prepare(
    'SELECT id, name, created_at FROM Platforms WHERE user_id = ?'
  ).bind(userId).all();
  return c.json({ platforms: results });
});

platformsRouter.post('/connect', async (c) => {
  const userId = 'mock-user';
  const { name, credentials } = await c.req.json();

  if (!name || !credentials) {
    return c.json({ error: 'Name and credentials required' }, 400);
  }

  // Ensure mock user exists to prevent D1 foreign key constraint failures
  await c.env.DB.prepare(
    'INSERT OR IGNORE INTO Users (id, email, password_hash) VALUES (?, ?, ?)'
  ).bind(userId, 'mock@example.com', 'hash').run();

  // Clean up any old duplicate mock connections for this platform
  const existing = await c.env.DB.prepare('SELECT id, credentials_ref FROM Platforms WHERE name = ? AND user_id = ?').bind(name, userId).first();
  if (existing) {
     await c.env.KV.delete(existing.credentials_ref as string);
     await c.env.DB.prepare('DELETE FROM Platforms WHERE id = ?').bind(existing.id).run();
  }

  const platformId = crypto.randomUUID();
  const credentialsRef = `creds_${platformId}`;

  // Store credentials in KV securely
  await c.env.KV.put(credentialsRef, JSON.stringify(credentials));

  // Store platform in D1 using the existing schema.sql Platforms table structure
  await c.env.DB.prepare(
    'INSERT INTO Platforms (id, user_id, name, credentials_ref) VALUES (?, ?, ?, ?)'
  ).bind(platformId, userId, name, credentialsRef).run();

  return c.json({ success: true, platformId });
});

platformsRouter.post('/x/connect', async (c) => {
  const userId = 'mock-user';
  
  // Ensure mock user exists
  await c.env.DB.prepare(
    'INSERT OR IGNORE INTO Users (id, email, password_hash) VALUES (?, ?, ?)'
  ).bind(userId, 'mock@example.com', 'hash').run();

  const name = 'X (Twitter)';
  
  // Clean up existing
  const existing = await c.env.DB.prepare('SELECT id, credentials_ref FROM Platforms WHERE name = ? AND user_id = ?').bind(name, userId).first();
  if (existing) {
     await c.env.KV.delete(existing.credentials_ref as string);
     await c.env.DB.prepare('DELETE FROM Platforms WHERE id = ?').bind(existing.id).run();
  }

  const platformId = crypto.randomUUID();
  const credentialsRef = `creds_${platformId}`;

  // Use keys from ENV
  const credentials = {
    apiKey: c.env.X_API_KEY,
    apiSecret: c.env.X_API_SECRET,
    accessToken: c.env.X_ACCESS_TOKEN,
    accessSecret: c.env.X_ACCESS_SECRET,
  };

  await c.env.KV.put(credentialsRef, JSON.stringify(credentials));

  await c.env.DB.prepare(
    'INSERT INTO Platforms (id, user_id, name, credentials_ref) VALUES (?, ?, ?, ?)'
  ).bind(platformId, userId, name, credentialsRef).run();

  return c.json({ success: true, platformId });
});

platformsRouter.delete('/:id', async (c) => {
  const userId = 'mock-user';
  const id = c.req.param('id');

  const platform = await c.env.DB.prepare(
    'SELECT credentials_ref FROM Platforms WHERE id = ? AND user_id = ?'
  ).bind(id, userId).first();

  if (platform) {
    await c.env.KV.delete(platform.credentials_ref as string);
    await c.env.DB.prepare('DELETE FROM Platforms WHERE id = ? AND user_id = ?').bind(id, userId).run();
    return c.json({ success: true });
  }

  return c.json({ error: 'Platform not found' }, 404);
});
