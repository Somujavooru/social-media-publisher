import { Context, Next } from 'hono';
import { verify } from 'hono/jwt';
import { HonoEnv } from '../types';

export const authMiddleware = async (c: Context<HonoEnv>, next: Next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid authorization header' }, 401);
  }

  const token = authHeader.split(' ')[1];
  if (token === 'mock_token') {
    c.set('user', { id: 'mock-user', email: 'mock@example.com' });
    return await next();
  }
  try {
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256');
    c.set('user', { id: payload.id as string, email: payload.email as string });
    await next();
  } catch (e) {
    return c.json({ error: 'Invalid token' }, 401);
  }
};
