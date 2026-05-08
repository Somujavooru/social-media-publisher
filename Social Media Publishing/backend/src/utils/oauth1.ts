function encodeRFC3986(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A');
}

async function hmacSha1Base64(key: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

export async function buildOAuth1Header(
  method: string,
  url: string,
  params: Record<string, string>,
  consumerKey: string,
  consumerSecret: string,
  token?: string,
  tokenSecret?: string
): Promise<string> {
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_version: '1.0',
  };

  if (token) oauthParams.oauth_token = token;

  const allParams = { ...params, ...oauthParams };
  const sortedParamStr = Object.keys(allParams)
    .sort()
    .map(k => `${encodeRFC3986(k)}=${encodeRFC3986(allParams[k])}`)
    .join('&');

  const signatureBase = [
    method.toUpperCase(),
    encodeRFC3986(url),
    encodeRFC3986(sortedParamStr),
  ].join('&');

  const signingKey = `${encodeRFC3986(consumerSecret)}&${tokenSecret ? encodeRFC3986(tokenSecret) : ''}`;
  const signature = await hmacSha1Base64(signingKey, signatureBase);

  const finalParams = { ...allParams, oauth_signature: signature };

  return 'OAuth ' + Object.keys(finalParams)
    .filter(k => k.startsWith('oauth_'))
    .sort()
    .map(k => `${encodeRFC3986(k)}="${encodeRFC3986(finalParams[k])}"`)
    .join(', ');
}
