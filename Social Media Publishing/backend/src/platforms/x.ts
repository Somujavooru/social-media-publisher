import { PlatformAdapter, PublishParams } from './index';
import { buildOAuth1Header } from '../utils/oauth1';

// --- XAdapter ---

export class XAdapter implements PlatformAdapter {
  async authenticate(credentials: any): Promise<boolean> {
    return !!(
      credentials &&
      credentials.apiKey &&
      credentials.apiSecret &&
      credentials.accessToken &&
      credentials.accessSecret
    );
  }

  async publish(params: PublishParams): Promise<any> {
    const { content, mediaId, credentials } = params;

    console.log('Publishing to X (Twitter) via native fetch...');

    if (!(await this.authenticate(credentials))) {
      throw new Error(
        'Invalid X credentials. Ensure API Key, API Secret, Access Token, and Access Secret are provided.'
      );
    }

    try {
      const mediaIds: string[] = [];

      // Step 1: Upload image if provided
      if (mediaId && mediaId.startsWith('data:')) {
        console.log('Uploading media to X...');

        const mimeMatch = mediaId.match(/^data:([^;]+);base64,/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
        const base64Data = mediaId.split(',')[1];

        // Convert base64 to binary
        const binaryStr = atob(base64Data);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }

        // Build multipart/form-data body manually
        const boundary = '----XBoundary' + crypto.randomUUID().replace(/-/g, '');
        const preamble = new TextEncoder().encode(
          `--${boundary}\r\nContent-Disposition: form-data; name="media"\r\nContent-Type: ${mimeType}\r\n\r\n`
        );
        const epilogue = new TextEncoder().encode(`\r\n--${boundary}--`);
        const bodyBytes = new Uint8Array(preamble.length + bytes.length + epilogue.length);
        bodyBytes.set(preamble, 0);
        bodyBytes.set(bytes, preamble.length);
        bodyBytes.set(epilogue, preamble.length + bytes.length);

        const uploadUrl = 'https://upload.twitter.com/1.1/media/upload.json';
        const uploadAuthHeader = await buildOAuth1Header('POST', uploadUrl, {}, credentials.apiKey, credentials.apiSecret, credentials.accessToken, credentials.accessSecret);

        const uploadRes = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            Authorization: uploadAuthHeader,
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
          },
          body: bodyBytes,
        });

        if (!uploadRes.ok) {
          const errText = await uploadRes.text();
          console.error('X Media Upload Error:', errText);
          throw new Error(`X media upload failed (${uploadRes.status}): ${errText}`);
        }

        const uploadData: any = await uploadRes.json();
        mediaIds.push(uploadData.media_id_string);
        console.log('X media uploaded, ID:', uploadData.media_id_string);
      }

      // Step 2: Post the tweet via v2
      const tweetUrl = 'https://api.twitter.com/2/tweets';
      const tweetBody: any = { text: content };
      if (mediaIds.length > 0) {
        tweetBody.media = { media_ids: mediaIds };
      }

      const tweetAuthHeader = await buildOAuth1Header('POST', tweetUrl, {}, credentials.apiKey, credentials.apiSecret, credentials.accessToken, credentials.accessSecret);

      const tweetRes = await fetch(tweetUrl, {
        method: 'POST',
        headers: {
          Authorization: tweetAuthHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(tweetBody),
      });

      const tweetData: any = await tweetRes.json();

      if (!tweetRes.ok) {
        console.error('X API Tweet Error:', JSON.stringify(tweetData));
        
        // Specific error handling for credit depletion
        if (tweetRes.status === 402 || tweetData.title === 'CreditsDepleted') {
          throw new Error('X API Credits Depleted: Your X Developer account has run out of credits. Please check your billing/quota in the X Developer Portal.');
        }

        if (tweetRes.status === 403) {
          throw new Error(
            `X API Permission Error (403): Your app may have "Read-only" access or is restricted. ` +
            `Go to X Developer Portal → App Settings → User authentication → change to "Read and Write". ` +
            `API response: ${JSON.stringify(tweetData)}`
          );
        }
        throw new Error(`X tweet failed (${tweetRes.status}): ${tweetData.detail || JSON.stringify(tweetData)}`);
      }

      const tweetId = tweetData.data?.id;
      console.log('Tweet posted successfully:', tweetId);

      return {
        success: true,
        platform: 'X',
        externalId: tweetId,
        externalUrn: tweetId,
        url: `https://x.com/i/status/${tweetId}`,
        publishedAt: new Date().toISOString(),
      };
    } catch (error: any) {
      console.error('X Publishing Error:', error.message);
      throw error;
    }
  }

  async getStatus(externalId: string, credentials: any): Promise<any> {
    const tweetUrl = `https://api.twitter.com/2/tweets/${externalId}`;
    const authHeader = await buildOAuth1Header('GET', tweetUrl, {}, credentials.apiKey, credentials.apiSecret, credentials.accessToken, credentials.accessSecret);

    const response = await fetch(tweetUrl, {
      headers: {
        Authorization: authHeader,
      }
    });

    if (!response.ok) {
       return { status: 'unknown', error: 'Failed to fetch tweet' };
    }

    const data: any = await response.json();
    return {
      status: data.data ? 'published' : 'deleted',
      externalId,
      data
    };
  }
}


