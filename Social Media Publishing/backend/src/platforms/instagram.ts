import { PlatformAdapter, PublishParams } from './index';

export class InstagramAdapter implements PlatformAdapter {
  async authenticate(credentials: any): Promise<boolean> {
    return !!(credentials && credentials.accessToken && credentials.instagramUserId);
  }

  async publish(params: PublishParams): Promise<any> {
    const { content, mediaId, credentials } = params;
    const { accessToken, instagramUserId } = credentials;

    if (!(await this.authenticate(credentials))) {
      throw new Error('Invalid Instagram credentials. Access Token and Instagram User ID are required.');
    }

    if (!mediaId) {
      throw new Error('Instagram requires an image or video. Text-only posts are not supported via the API.');
    }

    console.log(`Publishing to Instagram User ${instagramUserId}...`);

    try {
      // Step 1: Create Media Container
      // Instagram requires a public URL for the image. 
      // If we have a data URL, we assume it's already uploaded to R2 and we have a public URL.
      // For this implementation, we'll assume mediaId is the URL.
      const containerUrl = `https://graph.facebook.com/v19.0/${instagramUserId}/media`;
      const containerRes = await fetch(containerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: mediaId,
          caption: content,
          access_token: accessToken,
        }),
      });

      const containerData: any = await containerRes.json();

      if (!containerRes.ok) {
        console.error('Instagram Container Error:', containerData);
        throw new Error(`Instagram container creation failed: ${containerData.error?.message || containerRes.statusText}`);
      }

      const creationId = containerData.id;

      // Step 2: Publish Media
      const publishUrl = `https://graph.facebook.com/v19.0/${instagramUserId}/media_publish`;
      const publishRes = await fetch(publishUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: creationId,
          access_token: accessToken,
        }),
      });

      const publishData: any = await publishRes.json();

      if (!publishRes.ok) {
        console.error('Instagram Publish Error:', publishData);
        throw new Error(`Instagram publishing failed: ${publishData.error?.message || publishRes.statusText}`);
      }

      return {
        success: true,
        platform: 'Instagram',
        externalId: publishData.id,
        url: `https://instagram.com/p/mock_${publishData.id}`, // IG doesn't return permalink directly in publish
        publishedAt: new Date().toISOString(),
      };
    } catch (error: any) {
      console.error('Instagram Publishing Error:', error.message);
      throw error;
    }
  }

  async getStatus(externalId: string, credentials: any): Promise<any> {
    const { accessToken } = credentials;
    const url = `https://graph.facebook.com/v19.0/${externalId}?fields=permalink,timestamp&access_token=${accessToken}`;
    
    const response = await fetch(url);
    if (!response.ok) {
      return { status: 'unknown', error: 'Failed to fetch Instagram post status' };
    }
    
    const data: any = await response.json();
    return {
      status: 'published',
      externalId,
      url: data.permalink,
      data
    };
  }
}
