import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HonoEnv } from './types';
import { authRouter } from './api/auth';
import { postsRouter } from './api/posts';
import { platformsRouter } from './api/platforms';
import { mediaRouter } from './api/media';
import { oauthRouter } from './api/oauth';
import { aiRouter } from './api/ai';
import { publishRouter } from './api/publish';
import { scheduleRouter } from './api/schedule';
import { statusRouter } from './api/status';
import { queueConsumer } from './queue/consumer';

const app = new Hono<HonoEnv>();

app.use('*', cors());

app.route('/api/auth', authRouter);
app.route('/api/oauth', oauthRouter);
app.route('/api/posts', postsRouter);
app.route('/api/platforms', platformsRouter);
app.route('/api/media', mediaRouter);
app.route('/api/ai', aiRouter);
app.route('/api/publish', publishRouter);
app.route('/api/schedule', scheduleRouter);
app.route('/api/status', statusRouter);

export default {
  fetch: app.fetch,
  queue: queueConsumer
};

export { PublishDurableObject } from './services/scheduler';
