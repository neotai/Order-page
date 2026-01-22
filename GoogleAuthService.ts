export interface GoogleUserInfo {
  id: string;
  email: string;
  name?: string;
  picture?: string;
}

export interface GoogleAuthService {
  verifyGoogleToken(token: string): Promise<GoogleUserInfo | null>;
  getGoogleAuthUrl(): string;
}

export class GoogleAuthServiceImpl implements GoogleAuthService {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;

  constructor(
    clientId: string = 'mock-google-client-id',
    clientSecret: string = 'mock-google-client-secret',
    redirectUri: string = 'http://localhost:3000/auth/google/callback'
  ) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectUri = redirectUri;
  }

  async verifyGoogleToken(token: string): Promise<GoogleUserInfo | null> {
    try {
      // In a real implementation, this would call Google's token verification API
      // For now, we'll simulate a successful verification
      if (token.startsWith('mock-google-token-')) {
        const userId = token.replace('mock-google-token-', '');
        return {
          id: userId,
          email: `user${userId}@gmail.com`,
          name: `Google User ${userId}`,
          picture: `https://example.com/avatar/${userId}.jpg`
        };
      }
      
      // Simulate token verification failure
      return null;
    } catch (error) {
      console.error('Google token verification failed:', error);
      return null;
    }
  }

  getGoogleAuthUrl(): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline'
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }
}