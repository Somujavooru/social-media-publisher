export type Bindings = {
  DB: D1Database;
  KV: KVNamespace;
  STORAGE: R2Bucket;
  PUBLISH_QUEUE: Queue<any>;
  PUBLISH_DO: DurableObjectNamespace;
  AI: any; // Cloudflare AI binding type
  JWT_SECRET: string;
  LINKEDIN_CLIENT_ID: string;
  LINKEDIN_CLIENT_SECRET: string;
  FRONTEND_URL: string;
  X_API_KEY: string;
  X_API_SECRET: string;
  X_ACCESS_TOKEN: string;
  X_ACCESS_SECRET: string;
  FACEBOOK_APP_ID: string;
  FACEBOOK_APP_SECRET: string;
  FACEBOOK_REDIRECT_URI: string;
};

export type Variables = {
  user: {
    id: string;
    email: string;
  };
};

export type HonoEnv = {
  Bindings: Bindings;
  Variables: Variables;
};
