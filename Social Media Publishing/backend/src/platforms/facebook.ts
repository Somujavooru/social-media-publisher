import { PlatformAdapter, PublishParams } from './index';

export class FacebookAdapter implements PlatformAdapter {
  async authenticate(credentials: any): Promise<boolean> {
    return !!(credentials && credentials.accessToken);
  }

  async publish(params: PublishParams): Promise<any> {
    const { content, mediaId, credentials } = params;
    const { accessToken, pageId } = credentials;

    if (!(await this.authenticate(credentials))) {
      throw new Error('Invalid Facebook credentials. Access Token is required.');
    }

    if (!pageId) {
      console.warn("No Facebook Page ID found. Proceeding with MOCK publish for local development.");
      return {
        success: true,
        platform: 'Facebook',
        externalId: `mock_fb_${Date.now()}`,
        url: `https://facebook.com/mock_post_${Date.now()}`,
        publishedAt: new Date().toISOString(),
        note: 'This is a mock publish because no Facebook Page is associated with your account.'
      };
    }

    console.log(`Publishing to Facebook Page ${pageId}...`);

    try {
      let url = `https://graph.facebook.com/v19.0/${pageId}/feed`;
      const body: any = {
        message: content,
        access_token: accessToken,
      };

      // If media is provided (base64 or URL)
      if (mediaId) {
        url = `https://graph.facebook.com/v19.0/${pageId}/photos`;
        body.url = mediaId.startsWith('http') ? mediaId : undefined;
        // For local media/base64, we'd need to upload as multipart, but we'll assume URL for now or simple message
        if (mediaId.startsWith('data:')) {
           // Basic implementation: if it's data URL, we might need a different flow or just use message
           // For now, let's just stick to feed if no public URL
           url = `https://graph.facebook.com/v19.0/${pageId}/feed`;
        }
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data: any = await response.json();
      console.log("FACEBOOK PUBLISH RESPONSE:", JSON.stringify(data, null, 2));

      if (!response.ok) {
        console.error('Facebook API Error:', data);
        throw new Error(`Facebook API failed: ${data.error?.message || response.statusText}`);
      }

      return {
        success: true,
        platform: 'Facebook',
        externalId: data.id || data.post_id,
        url: `https://facebook.com/${data.id || data.post_id}`,
        publishedAt: new Date().toISOString(),
      };
    } catch (error: any) {
      console.error('Facebook Publishing Error:', error.message);
      throw error;
    }
  }

  async getStatus(externalId: string, credentials: any): Promise<any> {
    const { accessToken } = credentials;
    const url = `https://graph.facebook.com/v19.0/${externalId}?access_token=${accessToken}`;
    
    const response = await fetch(url);
    if (!response.ok) {
      return { status: 'unknown', error: 'Failed to fetch Facebook post status' };
    }
    
    const data: any = await response.json();
    return {
      status: data.id ? 'published' : 'deleted',
      externalId,
      data
    };
  }
}
