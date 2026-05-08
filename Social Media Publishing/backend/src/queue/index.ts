import { Bindings } from '../types';
import { PlatformIntegrationFactory } from '../platforms';

export const queueHandler = async (batch: MessageBatch<any>, env: Bindings): Promise<void> => {
  const factory = new PlatformIntegrationFactory();

  for (const message of batch.messages) {
    const job = message.body;
    // job shape: { postPlatformId, postId, platformId, userId, content, mediaId }
    
    try {
      // Fetch platform details from D1
      const platform = await env.DB.prepare(
        'SELECT name, credentials_ref FROM Platforms WHERE id = ?'
      ).bind(job.platformId).first();

      if (!platform) {
        throw new Error(`Platform ${job.platformId} not found`);
      }

      // Fetch credentials from KV
      const credsString = await env.KV.get(platform.credentials_ref as string);
      if (!credsString) {
        throw new Error(`Credentials for platform ${platform.name} missing`);
      }
      const credentials = JSON.parse(credsString);

      // Initialize the specific platform adapter
      const adapter = factory.getAdapter(platform.name as string);

      // Execute the publish action
      const response = await adapter.publish({
        content: job.content,
        mediaId: job.mediaId,
        credentials
      });

      // Update D1 to success
      await env.DB.prepare(
        'UPDATE PostPlatforms SET status = ?, response = ? WHERE id = ?'
      ).bind('success', JSON.stringify(response), job.postPlatformId).run();

      // Acknowledge the message to remove it from the queue
      message.ack();

    } catch (e: any) {
      console.error('Queue processing failed for job:', job, e);
      
      await env.DB.prepare(
        'UPDATE PostPlatforms SET status = ?, response = ? WHERE id = ?'
      ).bind('failed', JSON.stringify({ error: e.message }), job.postPlatformId).run();
      
      // Let it retry automatically based on max_retries configured in wrangler.toml
    }
  }
};
