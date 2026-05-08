import { PlatformAdapter, PublishParams } from './index';

export class LinkedInAdapter implements PlatformAdapter {
  async authenticate(credentials: any): Promise<boolean> {
    return !!(credentials && credentials.accessToken);
  }

  async publish(params: PublishParams): Promise<any> {
    console.log('Publishing to LinkedIn...', params.content);

    if (!(await this.authenticate(params.credentials))) {
       throw new Error('Invalid LinkedIn credentials');
    }

    const accessToken = params.credentials.accessToken;

    // First, fetch the user profile using the OpenID Connect endpoint
    const profileResponse = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: {
        'Authorization': 'Bearer ' + accessToken
      }
    });

    if (!profileResponse.ok) {
      const errorText = await profileResponse.text();
      console.log('LinkedIn API Error (UserInfo):', errorText);
      throw new Error(`Invalid token or userinfo fetch failed: ${errorText}`);
    }

    const profileData: any = await profileResponse.json();
    // In OpenID Connect, the user unique ID is in the 'sub' field
    const personUrn = `urn:li:person:${profileData.sub || profileData.id}`;

    let assetUrn: string | null = null;

    // If an image was provided, upload it via the 3-step process
    if (params.mediaId) {
      console.log('Registering image upload with LinkedIn...');
      
      // Step 1: Register Upload
      const registerPayload = {
        registerUploadRequest: {
          recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
          owner: personUrn,
          serviceRelationships: [
            {
              relationshipType: "OWNER",
              identifier: "urn:li:userGeneratedContent"
            }
          ]
        }
      };

      const registerRes = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + accessToken,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0'
        },
        body: JSON.stringify(registerPayload)
      });

      if (!registerRes.ok) {
        const errText = await registerRes.text();
        throw new Error(`Failed to register upload: ${errText}`);
      }

      const registerData: any = await registerRes.json();
      const uploadUrl = registerData.value.uploadMechanism["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"].uploadUrl;
      assetUrn = registerData.value.asset;

      // Step 2: Upload Raw Binary
      console.log('Uploading raw image binary...');
      const base64Data = params.mediaId.replace(/^data:image\/\w+;base64,/, '');
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Authorization': 'Bearer ' + accessToken,
          'Content-Type': 'application/octet-stream'
        },
        body: bytes.buffer
      });

      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        throw new Error(`Failed to upload image binary: ${errText}`);
      }
      console.log('Image upload successful.');
    }

    // Now construct the UGC Post request
    let shareContent: any = {
      shareCommentary: {
        text: params.content
      },
      shareMediaCategory: "NONE"
    };

    if (assetUrn) {
      shareContent.shareMediaCategory = "IMAGE";
      shareContent.media = [
        {
          status: "READY",
          description: { text: "Uploaded Image" },
          media: assetUrn,
          title: { text: "Uploaded Image" }
        }
      ];
    }

    const postBody = {
      author: personUrn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": shareContent
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
      }
    };

    const response = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0'
      },
      body: JSON.stringify(postBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log("LinkedIn API Error:", errorText);
      
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.code === 'DUPLICATE_POST' || errorText.includes('duplicate')) {
          throw new Error('LinkedIn rejected this post because it is a duplicate of a recently published post. Try changing the text slightly before publishing again.');
        }
        if (errorJson.message) {
          throw new Error(`LinkedIn API Error: ${errorJson.message}`);
        }
      } catch (e: any) {
        if (e.message.includes('LinkedIn rejected')) throw e;
        // Parsing failed, throw original text
        throw new Error(`Failed to publish to LinkedIn: ${errorText}`);
      }
      
      throw new Error(`Failed to publish to LinkedIn: ${errorText}`);
    }

    const responseData: any = await response.json();

    return {
      success: true,
      platform: 'LinkedIn',
      externalUrn: responseData.id,
      publishedAt: new Date().toISOString()
    };
  }

  async getStatus(externalId: string, credentials: any): Promise<any> {
    // For LinkedIn, we can fetch the ugcPost status
    const accessToken = credentials.accessToken;
    const response = await fetch(`https://api.linkedin.com/v2/ugcPosts/${externalId}`, {
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'X-Restli-Protocol-Version': '2.0.0'
      }
    });

    if (!response.ok) {
       return { status: 'unknown', error: 'Failed to fetch status' };
    }

    const data: any = await response.json();
    return {
      status: data.lifecycleState === 'PUBLISHED' ? 'published' : 'pending',
      externalId,
      data
    };
  }
}
