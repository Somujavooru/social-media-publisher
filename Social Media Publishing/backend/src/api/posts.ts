import { Hono } from 'hono';
import { HonoEnv } from '../types';
import { authMiddleware } from '../middleware/auth';
import { PlatformIntegrationFactory } from '../platforms';

export const postsRouter = new Hono<HonoEnv>();

postsRouter.use('*', authMiddleware);

postsRouter.post('/', async (c) => {
  const user = c.get('user');
  const { content, platform_contents, media_id, scheduled_at, platforms } = await c.req.json();
  
  if ((!content && !platform_contents) || !platforms || platforms.length === 0) {
    return c.json({ error: 'Content and at least one platform are required' }, 400);
  }

  // --- Auto-Seed & Validate User ---
  let userRecord = await c.env.DB.prepare('SELECT id FROM Users WHERE id = ?').bind(user.id).first();
  if (!userRecord) {
    console.error(`Missing Foreign Key: User ID ${user.id} not found in Users table. Auto-seeding user...`);
    await c.env.DB.prepare(
      'INSERT INTO Users (id, email, password_hash) VALUES (?, ?, ?)'
    ).bind(user.id, user.email || 'mock@example.com', 'auto-seeded').run();
  }

  const validPlatforms = [];
  for (const p of platforms) {
    const dbNameMap: Record<string, string> = {
      'linkedin': 'LinkedIn',
      'x': 'X (Twitter)',
      'facebook': 'Facebook',
      'instagram': 'Instagram',
      'threads': 'Threads'
    };
    const dbName = dbNameMap[p.toLowerCase()] || p;
    const isX = p === 'x';

    // For X, try both the canonical name and the legacy 'X' name
    let platformRecord = await c.env.DB.prepare(
      'SELECT id, name, credentials_ref FROM Platforms WHERE name = ? AND user_id = ?'
    ).bind(dbName, user.id).first();

    if (!platformRecord && isX) {
      // Also try legacy name 'X' stored from previous sessions
      platformRecord = await c.env.DB.prepare(
        'SELECT id, name, credentials_ref FROM Platforms WHERE name = ? AND user_id = ?'
      ).bind('X', user.id).first();
    }

    // If we found an X record but it has stale mock credentials, delete it so we re-seed
    if (platformRecord && isX) {
      const existingCreds = await c.env.KV.get(platformRecord.credentials_ref as string);
      if (existingCreds) {
        const parsed = JSON.parse(existingCreds);
        if (!parsed.apiKey) {
          console.log('Deleting stale X platform record (no apiKey in credentials), will re-seed with env vars...');
          await c.env.KV.delete(platformRecord.credentials_ref as string);
          await c.env.DB.prepare('DELETE FROM Platforms WHERE id = ?').bind(platformRecord.id).run();
          platformRecord = null;
        }
      }
    }

    if (!platformRecord) {
      // For X, auto-seed using the env vars if available
      if (isX && c.env.X_API_KEY && c.env.X_ACCESS_TOKEN) {
        console.log(`Auto-seeding X (Twitter) credentials from environment for User ${user.id}...`);
        const platformId = crypto.randomUUID();
        const credentialsRef = `creds_${platformId}`;
        await c.env.DB.prepare(
          'INSERT INTO Platforms (id, user_id, name, credentials_ref) VALUES (?, ?, ?, ?)'
        ).bind(platformId, user.id, 'X (Twitter)', credentialsRef).run();
        await c.env.KV.put(credentialsRef, JSON.stringify({
          apiKey: c.env.X_API_KEY,
          apiSecret: c.env.X_API_SECRET,
          accessToken: c.env.X_ACCESS_TOKEN,
          accessSecret: c.env.X_ACCESS_SECRET,
        }));
        platformRecord = { id: platformId, name: 'X (Twitter)', credentials_ref: credentialsRef };
      } else {
        console.error(`Missing Foreign Key: Platform ${dbName} for User ${user.id} not found. Auto-seeding platform...`);
        const platformId = crypto.randomUUID();
        const credentialsRef = `creds_${platformId}`;
        await c.env.DB.prepare(
          'INSERT INTO Platforms (id, user_id, name, credentials_ref) VALUES (?, ?, ?, ?)'
        ).bind(platformId, user.id, dbName, credentialsRef).run();
        await c.env.KV.put(credentialsRef, JSON.stringify({ accessToken: 'mock_token_for_seeding' }));
        platformRecord = { id: platformId, name: dbName, credentials_ref: credentialsRef };
      }
    }

    const credsString = await c.env.KV.get(platformRecord.credentials_ref as string);
    console.log(`KV Token Check for ${dbName}:`, credsString ? "Exists" : "MISSING/NULL");
    
    if (!credsString) {
      return c.json({ error: "Token missing from database. Try reconnecting LinkedIn." }, 400);
    }
    
    validPlatforms.push({
      id: platformRecord.id,
      name: platformRecord.name || dbName,
      credentials: JSON.parse(credsString)
    });
  }

  const postId = crypto.randomUUID();
  const status = scheduled_at ? 'scheduled' : 'publishing';
  const now = new Date().toISOString();
  const scheduledTime = scheduled_at ? new Date(scheduled_at).toISOString() : now;

  // --- Final Foreign Key Validation Check ---
  const finalUserCheck = await c.env.DB.prepare('SELECT id FROM Users WHERE id = ?').bind(user.id).first();
  if (!finalUserCheck) {
    console.error(`Validation Error: User ID ${user.id} missing before INSERT into Posts.`);
    return c.json({ error: 'Database constraint error: User ID missing.' }, 500);
  }

  let dbMediaId = null;
  if (media_id && typeof media_id === 'string' && media_id.trim() !== '') {
    if (media_id.startsWith('data:')) {
      console.log("Inline Data URL detected. Post record will use media_id = NULL.");
      dbMediaId = null;
    } else {
      const mediaCheck = await c.env.DB.prepare('SELECT id FROM Media WHERE id = ?').bind(media_id).first();
      if (mediaCheck) {
        dbMediaId = media_id;
      } else {
        console.warn(`Media ID ${media_id} not found in DB. Skipping media reference for this post.`);
        dbMediaId = null;
      }
    }
  }

  try {
    const factory = new PlatformIntegrationFactory();
    const externalUrns: string[] = [];
    const prePublishedResponses = new Map();

    // Image Sequence: If an image is present, LinkedIn media upload/publish must happen first
    const linkedinPlatform = validPlatforms.find(p => p.name === 'LinkedIn');
    if (linkedinPlatform && media_id && status === 'publishing') {
      console.log("Image Sequence: Publishing to LinkedIn first...");
      try {
        const adapter = factory.getAdapter('LinkedIn');
        const specificContent = platform_contents?.['linkedin'] || content;
        const response = await adapter.publish({
          content: specificContent,
          mediaId: media_id,
          credentials: linkedinPlatform.credentials
        });
        prePublishedResponses.set(linkedinPlatform.id, response);
        if (response.externalUrn) {
          externalUrns.push(response.externalUrn);
        }
        console.log("LinkedIn pre-publish successful.");
      } catch (pubErr: any) {
        console.error("LinkedIn pre-publish failed:", pubErr);
        return c.json({ error: 'LinkedIn publishing failed', details: pubErr.message }, 500);
      }
    }

    // Insert Post record AFTER LinkedIn (if applicable)
    await c.env.DB.prepare(
      'INSERT INTO Posts (id, user_id, content, media_id, status, scheduled_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(postId, user.id, content, dbMediaId, status, scheduledTime, now, now).run();

    // Process all platforms (including remaining or recorded LinkedIn status)
    for (const platform of validPlatforms) {
      const postPlatformId = crypto.randomUUID();
      const isPrePublished = prePublishedResponses.has(platform.id);
      
      // Initially insert PostPlatforms record
      await c.env.DB.prepare(
        'INSERT INTO PostPlatforms (id, post_id, platform_id, status) VALUES (?, ?, ?, ?)'
      ).bind(
        postPlatformId, 
        postId, 
        platform.id, 
        isPrePublished ? 'success' : (status === 'publishing' ? 'pending' : 'scheduled')
      ).run();

      if (isPrePublished) {
        // Update with the response we already got
        await c.env.DB.prepare(
          'UPDATE PostPlatforms SET response = ? WHERE id = ?'
        ).bind(JSON.stringify(prePublishedResponses.get(platform.id)), postPlatformId).run();
      } else if (status === 'publishing') {
        try {
          const adapter = factory.getAdapter(platform.name as string);
          const specificContent = platform_contents?.[platform.name.toLowerCase()] || content;
          const response = await adapter.publish({
            content: specificContent,
            mediaId: media_id,
            credentials: platform.credentials
          });

          await c.env.DB.prepare(
            'UPDATE PostPlatforms SET status = ?, response = ? WHERE id = ?'
          ).bind('success', JSON.stringify(response), postPlatformId).run();
          
          if (response.externalUrn) {
            externalUrns.push(response.externalUrn);
          }
        } catch (pubErr: any) {
          console.error(`Publishing failed for ${platform.name}:`, pubErr);
          await c.env.DB.prepare(
            'UPDATE PostPlatforms SET status = ?, response = ? WHERE id = ?'
          ).bind('failed', JSON.stringify({ error: pubErr.message }), postPlatformId).run();
          throw pubErr;
        }
      }
    }

    return c.json({ success: true, postId, status, externalUrns });
  } catch (e: any) {
    console.error("API POST Error:", e);
    return c.json({ error: 'Failed to create post', details: e.message }, 500);
  }
});

postsRouter.get('/', async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM Posts WHERE user_id = ? ORDER BY created_at DESC'
  ).bind(user.id).all();
  return c.json({ posts: results });
});
