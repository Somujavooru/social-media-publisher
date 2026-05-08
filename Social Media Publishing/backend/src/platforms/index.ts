import { XAdapter } from './x';
import { LinkedInAdapter } from './linkedin';
import { FacebookAdapter } from './facebook';
import { InstagramAdapter } from './instagram';
import { ThreadsAdapter } from './threads';

export interface PublishParams {
  content: string;
  mediaId?: string | null;
  credentials: any;
}

export interface PlatformAdapter {
  authenticate(credentials: any): Promise<boolean>;
  publish(params: PublishParams): Promise<any>;
  getStatus(externalId: string, credentials: any): Promise<any>;
}

export class PlatformIntegrationFactory {
  getAdapter(platformName: string): PlatformAdapter {
    switch (platformName.toLowerCase()) {
      case 'x':
      case 'twitter':
      case 'x (twitter)':
        return new XAdapter();
      case 'linkedin':
        return new LinkedInAdapter();
      case 'facebook':
        return new FacebookAdapter();
      case 'instagram':
        return new InstagramAdapter();
      case 'threads':
        return new ThreadsAdapter();
      default:
        throw new Error(`Platform ${platformName} is not supported`);
    }
  }
}
