import { Hono } from 'hono';
import { HonoEnv } from '../types';
import { buildOAuth1Header } from '../utils/oauth1';

export const oauthRouter = new Hono<HonoEnv>();

oauthRouter.get('/:platform/connect', async (c) => {
  const platform = c.req.param('platform').toLowerCase();
  
  if (platform === 'linkedin') {
    const clientId = c.env.LINKEDIN_CLIENT_ID;
    const redirectUri = encodeURIComponent(`http://localhost:8787/api/oauth/linkedin/callback`);
    const scope = encodeURIComponent('openid profile w_member_social');
    const state = crypto.randomUUID(); 
    const force = c.req.query('force') === 'true';
    
    let url = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&state=${state}&scope=${scope}`;
    if (force) {
      url += '&prompt=login';
    }
    return c.redirect(url);
  }

  if (platform === 'x' || platform === 'twitter') {
    const apiKey = c.env.X_API_KEY.trim();
    const apiSecret = c.env.X_API_SECRET.trim();
    const callbackUrl = `http://localhost:8787/api/oauth/x/callback`;
    const requestTokenUrl = 'https://api.twitter.com/oauth/request_token';

    const authHeader = await buildOAuth1Header('POST', requestTokenUrl, { oauth_callback: callbackUrl }, apiKey, apiSecret);

    const response = await fetch(requestTokenUrl, {
      method: 'POST',
      headers: { Authorization: authHeader }
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('X Request Token Error:', err);
      return c.redirect(`${c.env.FRONTEND_URL || 'http://localhost:3000'}/platforms?error=x_auth_init_failed`);
    }

    const data = await response.text();
    const params = new URLSearchParams(data);
    const oauthToken = params.get('oauth_token');
    const oauthTokenSecret = params.get('oauth_token_secret');

    if (!oauthToken || !oauthTokenSecret) {
      return c.redirect(`${c.env.FRONTEND_URL || 'http://localhost:3000'}/platforms?error=x_auth_invalid_response`);
    }

    // Store secret in KV temporarily
    await c.env.KV.put(`x_temp_secret_${oauthToken}`, oauthTokenSecret, { expirationTtl: 600 });

    return c.redirect(`https://api.twitter.com/oauth/authenticate?oauth_token=${oauthToken}`);
  }

  if (platform === 'facebook' || platform === 'instagram') {
    const appId = c.env.FACEBOOK_APP_ID;
    console.log("FB APP ID (from c.env):", appId);
    const clientId = platform === 'facebook' ? appId : c.env.INSTAGRAM_CLIENT_ID;
    const redirectUri = encodeURIComponent(platform === 'facebook' ? (c.env.FACEBOOK_REDIRECT_URI || `http://localhost:8787/api/oauth/facebook/callback`) : `http://localhost:8787/api/oauth/${platform}/callback`);
    const scopes = [
      "public_profile",
      "pages_show_list",
      "pages_manage_posts",
      "pages_read_engagement"
    ];
    
    const scope = platform === 'facebook' 
      ? scopes.join(",")
      : encodeURIComponent('instagram_basic,instagram_content_publish,pages_read_engagement');
    
    const state = crypto.randomUUID();
    const url = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${clientId}&redirect_uri=${redirectUri}&state=${state}&scope=${scope}`;
    return c.redirect(url);
  }

  if (platform === 'threads') {
     // Mock Threads connection
     const frontendUrl = c.env.FRONTEND_URL || 'http://localhost:3000';
     const userId = 'mock-user';
     const platformId = crypto.randomUUID();
     const credentialsRef = `creds_${platformId}`;
     await c.env.KV.put(credentialsRef, JSON.stringify({ accessToken: 'mock_threads_token' }));
     await c.env.DB.prepare('INSERT INTO Platforms (id, user_id, name, credentials_ref) VALUES (?, ?, ?, ?)')
       .bind(platformId, userId, 'Threads', credentialsRef).run();
     return c.redirect(`${frontendUrl}/platforms?success=threads_connected`);
  }

  return c.json({ error: 'Platform not supported' }, 400);
});

oauthRouter.get('/:platform/callback', async (c) => {
  const platform = c.req.param('platform').toLowerCase();
  const code = c.req.query('code');
  const error = c.req.query('error');
  const frontendUrl = c.env.FRONTEND_URL || 'http://localhost:3000';

  if (error) {
    return c.redirect(`${frontendUrl}/platforms?error=${error}`);
  }

  if (platform === 'linkedin' || platform === 'facebook' || platform === 'instagram') {
    if (!code) {
      return c.json({ error: 'No code provided' }, 400);
    }
    try {
      if (platform === 'linkedin') {
        const clientId = c.env.LINKEDIN_CLIENT_ID;
        const clientSecret = c.env.LINKEDIN_CLIENT_SECRET;
        const redirectUri = `http://localhost:8787/api/oauth/linkedin/callback`;

        const tokenResponse = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
          }),
        });

        const tokenData = await tokenResponse.json() as any;

        if (!tokenResponse.ok) {
          console.error('LinkedIn token error:', tokenData);
          return c.redirect(`${frontendUrl}/platforms?error=token_exchange_failed`);
        }

        const userId = 'mock-user'; 

        await c.env.DB.prepare(
          'INSERT OR IGNORE INTO Users (id, email, password_hash) VALUES (?, ?, ?)'
        ).bind(userId, 'mock@example.com', 'hash').run();

        const platformId = crypto.randomUUID();
        const credentialsRef = `creds_${platformId}`;

        await c.env.KV.put(credentialsRef, JSON.stringify({
          accessToken: tokenData.access_token,
          expiresIn: tokenData.expires_in,
          refreshToken: tokenData.refresh_token
        }));

        const existing = await c.env.DB.prepare('SELECT id, credentials_ref FROM Platforms WHERE name = ? AND user_id = ?').bind('LinkedIn', userId).first();
        if (existing) {
           await c.env.KV.delete(existing.credentials_ref as string);
           await c.env.DB.prepare('DELETE FROM Platforms WHERE id = ?').bind(existing.id).run();
        }

        await c.env.DB.prepare(
          'INSERT INTO Platforms (id, user_id, name, credentials_ref) VALUES (?, ?, ?, ?)'
        ).bind(platformId, userId, 'LinkedIn', credentialsRef).run();

        return c.redirect(`${frontendUrl}/platforms?success=linkedin_connected`);
      }

      if (platform === 'facebook' || platform === 'instagram') {
        const clientId = platform === 'facebook' ? c.env.FACEBOOK_APP_ID : c.env.INSTAGRAM_CLIENT_ID;
        const clientSecret = platform === 'facebook' ? c.env.FACEBOOK_APP_SECRET : c.env.INSTAGRAM_CLIENT_SECRET;
        const redirectUri = platform === 'facebook' ? (c.env.FACEBOOK_REDIRECT_URI || `http://localhost:8787/api/oauth/facebook/callback`) : `http://localhost:8787/api/oauth/${platform}/callback`;

        const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${clientId}&client_secret=${clientSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${encodeURIComponent(code)}`;
        const tokenResponse = await fetch(tokenUrl);
        
        const raw = await tokenResponse.text();
        console.log("RAW FACEBOOK RESPONSE:", raw);
        
        let data: any;
        try {
          data = JSON.parse(raw);
        } catch (e) {
          console.error("JSON PARSE ERROR:", raw);
          return new Response("Invalid token response", { status: 500 });
        }

        if (!data.access_token) {
          console.error("NO ACCESS TOKEN:", data);
          return new Response("Token missing", { status: 500 });
        }

        console.log("REAL FACEBOOK TOKEN:", data.access_token);
        
        const userId = 'mock-user';
        const platformName = platform === 'facebook' ? 'Facebook' : 'Instagram';
        
        let credentials: any = { accessToken: data.access_token };

        if (platform === 'facebook') {
           console.log("=== FACEBOOK DEBUG LOGS ===");
           console.log("USER_ACCESS_TOKEN:", data.access_token);

           // Fetch pages
           const pagesRes = await fetch(`https://graph.facebook.com/v19.0/me/accounts?access_token=${data.access_token}`);
           const pagesData: any = await pagesRes.json();
           
           console.log("PAGES RESPONSE:", JSON.stringify(pagesData, null, 2));

           if (pagesData.data && pagesData.data.length > 0) {
              const selectedPage = pagesData.data[0];
              console.log("SELECTED PAGE ID:", selectedPage.id);
              console.log("SELECTED PAGE NAME:", selectedPage.name);
              
              credentials.pageId = selectedPage.id;
              credentials.accessToken = selectedPage.access_token; // Page Access Token
           } else {
              console.warn("No Facebook Pages found for user.");
              return new Response("No Facebook Page connected. Please create/select a Facebook Page and reconnect.", { status: 400 });
           }
        } else {
           // Fetch Instagram account
           const igRes = await fetch(`https://graph.facebook.com/v19.0/me/accounts?fields=instagram_business_account&access_token=${data.access_token}`);
           const igData: any = await igRes.json();
           if (igData.data && igData.data.length > 0 && igData.data[0].instagram_business_account) {
              credentials.instagramUserId = igData.data[0].instagram_business_account.id;
           }
        }

        const platformId = crypto.randomUUID();
        const credentialsRef = `creds_${platformId}`;
        await c.env.KV.put(credentialsRef, JSON.stringify(credentials));

        const existing = await c.env.DB.prepare('SELECT id, credentials_ref FROM Platforms WHERE name = ? AND user_id = ?').bind(platformName, userId).first();
        if (existing) {
           await c.env.KV.delete(existing.credentials_ref as string);
           await c.env.DB.prepare('DELETE FROM Platforms WHERE id = ?').bind(existing.id).run();
        }

        await c.env.DB.prepare(
          'INSERT INTO Platforms (id, user_id, name, credentials_ref) VALUES (?, ?, ?, ?)'
        ).bind(platformId, userId, platformName, credentialsRef).run();

        return c.redirect(`${frontendUrl}/platforms?success=${platform}_connected`);
      }
    } catch (e) {
      console.error(`${platform} Callback error:`, e);
      return c.redirect(`${frontendUrl}/platforms?error=internal_error`);
    }
  }

  if (platform === 'x' || platform === 'twitter') {
    const oauthToken = c.req.query('oauth_token');
    const oauthVerifier = c.req.query('oauth_verifier');

    if (!oauthToken || !oauthVerifier) {
      return c.redirect(`${frontendUrl}/platforms?error=x_auth_cancelled`);
    }

    try {
      const apiKey = c.env.X_API_KEY;
      const apiSecret = c.env.X_API_SECRET;
      const tokenSecret = await c.env.KV.get(`x_temp_secret_${oauthToken}`);

      if (!tokenSecret) {
        return c.redirect(`${frontendUrl}/platforms?error=x_session_expired`);
      }

      const accessTokenUrl = 'https://api.twitter.com/oauth/access_token';
      const authHeader = await buildOAuth1Header('POST', accessTokenUrl, { oauth_verifier: oauthVerifier }, apiKey, apiSecret, oauthToken, tokenSecret);

      const response = await fetch(accessTokenUrl, {
        method: 'POST',
        headers: { Authorization: authHeader }
      });

      if (!response.ok) {
        const err = await response.text();
        console.error('X Access Token Error:', err);
        return c.redirect(`${frontendUrl}/platforms?error=x_token_exchange_failed`);
      }

      const data = await response.text();
      const params = new URLSearchParams(data);
      const finalToken = params.get('oauth_token');
      const finalSecret = params.get('oauth_token_secret');
      const screenName = params.get('screen_name');

      if (!finalToken || !finalSecret) {
        return c.redirect(`${frontendUrl}/platforms?error=x_auth_final_failed`);
      }

      const userId = 'mock-user';
      const platformId = crypto.randomUUID();
      const credentialsRef = `creds_${platformId}`;

      await c.env.KV.put(credentialsRef, JSON.stringify({
        apiKey,
        apiSecret,
        accessToken: finalToken,
        accessSecret: finalSecret,
        screenName
      }));

      // Cleanup existing
      const existing = await c.env.DB.prepare('SELECT id, credentials_ref FROM Platforms WHERE name = ? AND user_id = ?').bind('X (Twitter)', userId).first();
      if (existing) {
         await c.env.KV.delete(existing.credentials_ref as string);
         await c.env.DB.prepare('DELETE FROM Platforms WHERE id = ?').bind(existing.id).run();
      }

      await c.env.DB.prepare(
        'INSERT INTO Platforms (id, user_id, name, credentials_ref) VALUES (?, ?, ?, ?)'
      ).bind(platformId, userId, 'X (Twitter)', credentialsRef).run();

      await c.env.KV.delete(`x_temp_secret_${oauthToken}`);

      return c.redirect(`${frontendUrl}/platforms?success=x_connected`);
    } catch (e) {
      console.error('X Callback error:', e);
      return c.redirect(`${frontendUrl}/platforms?error=x_internal_error`);
    }
  }

  return c.json({ error: 'Platform not supported' }, 400);
});
