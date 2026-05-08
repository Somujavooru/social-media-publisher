import { Hono } from 'hono';
import { HonoEnv } from '../types';
import { sign } from 'hono/jwt';

export const authRouter = new Hono<HonoEnv>();

// Basic utility to hash password using Web Crypto API
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

authRouter.post('/register', async (c) => {
  const { email, password } = await c.req.json();
  if (!email || !password) return c.json({ error: 'Email and password required' }, 400);

  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  
  try {
    await c.env.DB.prepare(
      'INSERT INTO Users (id, email, password_hash) VALUES (?, ?, ?)'
    ).bind(id, email, passwordHash).run();
    
    const token = await sign({ id, email, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 }, c.env.JWT_SECRET);
    return c.json({ token, user: { id, email } });
  } catch (e: any) {
    if (e.message.includes('UNIQUE constraint failed')) {
      return c.json({ error: 'Email already exists' }, 400);
    }
    return c.json({ error: 'Failed to register user' }, 500);
  }
});

authRouter.post('/login', async (c) => {
  const { email, password } = await c.req.json();
  if (!email || !password) return c.json({ error: 'Email and password required' }, 400);

  const passwordHash = await hashPassword(password);
  
  const user = await c.env.DB.prepare(
    'SELECT id, email FROM Users WHERE email = ? AND password_hash = ?'
  ).bind(email, passwordHash).first();
  
  if (!user) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }
  
  const token = await sign({ id: user.id, email: user.email, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 }, c.env.JWT_SECRET);
  return c.json({ token, user: { id: user.id, email: user.email } });
});
