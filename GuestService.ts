export interface GuestSession {
  id: string;
  createdAt: Date;
  lastActiveAt: Date;
  expiresAt: Date;
  isActive: boolean;
  metadata?: {
    userAgent?: string;
    ipAddress?: string;
  };
}

export interface GuestService {
  createGuestSession(metadata?: GuestSession['metadata']): Promise<GuestSession>;
  getGuestSession(sessionId: string): Promise<GuestSession | null>;
  updateGuestActivity(sessionId: string): Promise<void>;
  expireGuestSession(sessionId: string): Promise<void>;
  cleanupExpiredSessions(): Promise<number>; // 返回清理的 session 數量
}

export class GuestServiceImpl implements GuestService {
  private sessions: Map<string, GuestSession> = new Map();
  private readonly SESSION_DURATION = 24 * 60 * 60 * 1000; // 24小時

  constructor() {
    // 啟動定期清理過期 session 的任務
    this.startCleanupTask();
  }

  async createGuestSession(metadata?: GuestSession['metadata']): Promise<GuestSession> {
    const sessionId = this.generateSessionId();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.SESSION_DURATION);

    const session: GuestSession = {
      id: sessionId,
      createdAt: now,
      lastActiveAt: now,
      expiresAt,
      isActive: true,
      metadata
    };

    this.sessions.set(sessionId, session);
    console.log(`Created guest session: ${sessionId}`);
    
    return session;
  }

  async getGuestSession(sessionId: string): Promise<GuestSession | null> {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      return null;
    }

    // 檢查是否過期
    if (session.expiresAt <= new Date()) {
      await this.expireGuestSession(sessionId);
      return null;
    }

    return session;
  }

  async updateGuestActivity(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    
    if (session && session.isActive) {
      session.lastActiveAt = new Date();
      // 延長過期時間
      session.expiresAt = new Date(Date.now() + this.SESSION_DURATION);
      this.sessions.set(sessionId, session);
    }
  }

  async expireGuestSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    
    if (session) {
      session.isActive = false;
      this.sessions.set(sessionId, session);
      console.log(`Expired guest session: ${sessionId}`);
    }
  }

  async cleanupExpiredSessions(): Promise<number> {
    const now = new Date();
    let cleanedCount = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.expiresAt <= now || !session.isActive) {
        this.sessions.delete(sessionId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} expired guest sessions`);
    }

    return cleanedCount;
  }

  private generateSessionId(): string {
    return 'guest_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
  }

  private startCleanupTask(): void {
    // 每小時清理一次過期 session
    setInterval(async () => {
      try {
        await this.cleanupExpiredSessions();
      } catch (error) {
        console.error('Error cleaning up guest sessions:', error);
      }
    }, 60 * 60 * 1000); // 1小時
  }
}

// 導出默認實例
export const GuestService = GuestServiceImpl;