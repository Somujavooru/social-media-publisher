import { Bindings } from '../types';
import { PlatformIntegrationFactory } from '../platforms';

export const queueConsumer = async (batch: MessageBatch<any>, env: Bindings): Promise<void> => {
  const factory = new PlatformIntegrationFactory();

  for (const message of batch.messages) {
    const job = message.body;
    // job shape: { postPlatformId, postId, platformId, platformName, userId, content, mediaR2Key? }

    try {
      // Fetch platform credentials from KV
      const platform = await env.DB.prepare(
        'SELECT name, credentials_ref FROM Platforms WHERE id = ?'
      ).bind(job.platformId).first();

      if (!platform) throw new Error(`Platform ${job.platformId} not found`);

      const credsString = await env.KV.get(platform.credentials_ref as string);
      if (!credsString) throw new Error(`Credentials missing for platform ${platform.name}`);
      const credentials = JSON.parse(credsString);

      // Download image from R2 if a key was stored at schedule time
      let mediaDataUrl: string | null = null;
      if (job.mediaR2Key) {
        const r2Object = await env.STORAGE.get(job.mediaR2Key);
        if (r2Object) {
          const arrayBuffer = await r2Object.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          // Chunked conversion to avoid stack overflow on large images
          let binary = '';
          const chunk = 8192;
          for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
          }
          const mimeType = r2Object.httpMetadata?.contentType || 'image/jpeg';
          mediaDataUrl = `data:${mimeType};base64,${btoa(binary)}`;
          console.log(`[Consumer] Downloaded image from R2: ${job.mediaR2Key}`);
        }
      }

      // Dispatch to the right platform adapter
      const adapter = factory.getAdapter(platform.name as string);
      const response = await adapter.publish({
        content: job.content,
        mediaId: mediaDataUrl,
        credentials,
      });

      console.log(`[Consumer] Published to ${platform.name}:`, response.externalId || response.externalUrn);

      await env.DB.prepare('UPDATE PostPlatforms SET status = ?, response = ? WHERE id = ?')
        .bind('success', JSON.stringify(response), job.postPlatformId).run();

      // Check if all platforms for this post are done; if so mark Post as published
      const { results: remaining } = await env.DB.prepare(
        `SELECT id FROM PostPlatforms WHERE post_id = ? AND status NOT IN ('success', 'failed')`
      ).bind(job.postId).all();

      if (remaining.length === 0) {
        await env.DB.prepare('UPDATE Posts SET status = ?, updated_at = ? WHERE id = ?')
          .bind('published', new Date().toISOString(), job.postId).run();
        console.log(`[Consumer] Post ${job.postId} fully published.`);
      }

      message.ack();

    } catch (e: any) {
      console.error(`[Consumer] Failed for postPlatformId=${job?.postPlatformId}:`, e.message);

      if (job?.postPlatformId) {
        await env.DB.prepare('UPDATE PostPlatforms SET status = ?, response = ? WHERE id = ?')
          .bind('failed', JSON.stringify({ error: e.message }), job.postPlatformId).run();
      }
      // Don't ack — allow natural retry up to max_retries
    }
  }
};
