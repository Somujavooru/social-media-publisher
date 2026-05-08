export class PublishDurableObject {
  state: DurableObjectState;
  env: any;

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Called by /api/schedule to register a scheduled post
    if (url.pathname === '/schedule' && request.method === 'POST') {
      const body: any = await request.json();
      const { scheduledAt, postId, jobs } = body;

      if (!scheduledAt || !postId || !jobs) {
        return new Response('Missing required fields', { status: 400 });
      }

      await this.state.storage.put('postId', postId);
      await this.state.storage.put('jobs', jobs);
      await this.state.storage.setAlarm(scheduledAt);

      console.log(`[DO] Alarm set for postId=${postId} at ${new Date(scheduledAt).toISOString()}`);
      return new Response(JSON.stringify({ success: true, postId }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Legacy retry-tracking endpoint
    if (url.pathname === '/status') {
      const postId = url.searchParams.get('postId');
      if (!postId) return new Response('Missing postId', { status: 400 });
      const attempts = (await this.state.storage.get<number>(`attempts_${postId}`)) || 0;
      if (request.method === 'POST') {
        await this.state.storage.put(`attempts_${postId}`, attempts + 1);
        return new Response(JSON.stringify({ attempts: attempts + 1 }), { status: 200 });
      }
      return new Response(JSON.stringify({ attempts }), { status: 200 });
    }

    return new Response('Not found', { status: 404 });
  }

  // Fires when the alarm time is reached
  async alarm(): Promise<void> {
    console.log('[DO Alarm] Triggered — dispatching scheduled jobs to Queue');
    const jobs = await this.state.storage.get<any[]>('jobs');
    const postId = await this.state.storage.get<string>('postId');

    if (!jobs || jobs.length === 0) {
      console.warn('[DO Alarm] No jobs found in storage');
      return;
    }

    try {
      for (const job of jobs) {
        await this.env.PUBLISH_QUEUE.send(job);
        console.log(`[DO Alarm] Enqueued: ${job.platformName} / ${job.postPlatformId}`);
      }

      // Mark post as 'publishing' so UI can reflect it
      if (postId) {
        await this.env.DB.prepare('UPDATE Posts SET status = ?, updated_at = ? WHERE id = ?')
          .bind('publishing', new Date().toISOString(), postId).run();
      }
    } catch (e: any) {
      console.error('[DO Alarm] Failed to dispatch jobs:', e.message);
    } finally {
      await this.state.storage.delete('jobs');
      await this.state.storage.delete('postId');
    }
  }
}

export class SchedulerService {
  // Fallback: scan D1 for overdue scheduled posts and push them to Queue
  // Can be triggered by a Cloudflare Cron Trigger as a safety net
  static async processScheduledPosts(env: any): Promise<void> {
    const now = new Date().toISOString();
    const { results } = await env.DB.prepare(
      `SELECT pp.id as postPlatformId, pp.post_id as postId, pp.platform_id as platformId,
              p.user_id as userId, p.content, p.media_id as mediaId
       FROM PostPlatforms pp
       JOIN Posts p ON pp.post_id = p.id
       WHERE pp.status = 'scheduled' AND p.scheduled_at <= ?`
    ).bind(now).all();

    for (const job of results) {
      await env.DB.prepare('UPDATE PostPlatforms SET status = ? WHERE id = ?')
        .bind('pending', job.postPlatformId).run();
      await env.PUBLISH_QUEUE.send(job);
    }
  }

  static async getBestTimeToPost(_platform: string): Promise<Date> {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    t.setHours(10, 0, 0, 0);
    return t;
  }
}
