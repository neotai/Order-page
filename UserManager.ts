import { User, GuestSession, UserRegistration, LoginCredentials, AuthResult } from '../types/user';
import { AuthService, AuthServiceImpl } from '../services/AuthService';
import { GoogleAuthService, GoogleAuthServiceImpl } from '../services/GoogleAuthService';
import { NicknameService, NicknameServiceImpl } from '../services/NicknameService';
import { NicknameUpdateResult, UserNicknameInfo } from '../types/nickname';

export interface UserManager {
  // 用戶註冊與認證
  registerUser(userData: UserRegistration): Promise<User>;
  authenticateUser(credentials: LoginCredentials): Promise<AuthResult>;
  authenticateWithGoogle(token: string): Promise<AuthResult>;
  verifyToken(token: string): Promise<User | null>;
  
  // 暱稱管理
  setDefaultNickname(userId: string, nickname: string): Promise<NicknameUpdateResult>;
  setGroupNickname(userId: string, groupId: string, nickname: string): Promise<NicknameUpdateResult>;
  getUserNickname(userId: string, groupId?: string): Promise<string | null>;
  getUserNicknameInfo(userId: string): Promise<UserNicknameInfo | null>;
  validateNickname(nickname: string): Promise<{ isValid: boolean; error?: string; suggestions?: string[] }>;
  
  // 菜單儲存管理 (Task 5.5)
  addSavedMenu(userId: string, menuId: string): Promise<boolean>;
  removeSavedMenu(userId: string, menuId: string): Promise<boolean>;
  getUserSavedMenuIds(userId: string): Promise<string[]>;
  
  // 群族成員管理 (Task 10.1)
  addGroupMembership(userId: string, groupId: string): Promise<boolean>;
  removeGroupMembership(userId: string, groupId: string): Promise<boolean>;
  getUserGroupMemberships(userId: string): Promise<string[]>;
  
  // 訪客模式
  createGuestSession(): Promise<GuestSession>;
}

export class UserManagerImpl implements UserManager {
  private users: Map<string, User> = new Map();
  private guestSessions: Map<string, GuestSession> = new Map();
  private authService: AuthService;
  private googleAuthService: GoogleAuthService;
  private nicknameService: NicknameService;

  constructor(
    authService?: AuthService,
    googleAuthService?: GoogleAuthService,
    nicknameService?: NicknameService
  ) {
    this.authService = authService || new AuthServiceImpl();
    this.googleAuthService = googleAuthService || new GoogleAuthServiceImpl();
    this.nicknameService = nicknameService || new NicknameServiceImpl();
  }

  async registerUser(userData: UserRegistration): Promise<User> {
    // Check if user already exists
    const existingUser = Array.from(this.users.values()).find(u => u.email === userData.email);
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Hash the password
    const passwordHash = await this.authService.hashPassword(userData.password);

    const user: User = {
      id: this.generateId(),
      email: userData.email,
      passwordHash,
      defaultNickname: userData.defaultNickname,
      groupNicknames: new Map(),
      savedMenus: [],
      groupMemberships: [],
      createdAt: new Date(),
      lastLoginAt: new Date()
    };
    
    this.users.set(user.id, user);
    return user;
  }

  async authenticateUser(credentials: LoginCredentials): Promise<AuthResult> {
    // Find user by email
    const user = Array.from(this.users.values()).find(u => u.email === credentials.email);
    
    if (!user || !user.passwordHash) {
      return { success: false, error: 'Invalid email or password' };
    }

    // Verify password
    const isPasswordValid = await this.authService.verifyPassword(credentials.password, user.passwordHash);
    if (!isPasswordValid) {
      return { success: false, error: 'Invalid email or password' };
    }

    // Update last login time
    user.lastLoginAt = new Date();

    return {
      success: true,
      user,
      token: this.authService.generateToken(user.id)
    };
  }

  async authenticateWithGoogle(token: string): Promise<AuthResult> {
    try {
      // Verify Google token
      const googleUserInfo = await this.googleAuthService.verifyGoogleToken(token);
      if (!googleUserInfo) {
        return { success: false, error: 'Invalid Google token' };
      }

      // Check if user already exists
      let user = Array.from(this.users.values()).find(u => u.googleId === googleUserInfo.id);
      
      if (!user) {
        // Create new user from Google info
        user = {
          id: this.generateId(),
          email: googleUserInfo.email,
          googleId: googleUserInfo.id,
          defaultNickname: googleUserInfo.name,
          groupNicknames: new Map(),
          savedMenus: [],
          groupMemberships: [],
          createdAt: new Date(),
          lastLoginAt: new Date()
        };
        this.users.set(user.id, user);
      } else {
        // Update last login time
        user.lastLoginAt = new Date();
      }
      
      return {
        success: true,
        user,
        token: this.authService.generateToken(user.id)
      };
    } catch (error) {
      return { success: false, error: 'Google authentication failed' };
    }
  }

  async verifyToken(token: string): Promise<User | null> {
    const decoded = await this.authService.verifyToken(token);
    if (!decoded) {
      return null;
    }

    const user = this.users.get(decoded.userId);
    return user || null;
  }

  async setDefaultNickname(userId: string, nickname: string): Promise<NicknameUpdateResult> {
    return this.nicknameService.setDefaultNickname(userId, nickname, this.users);
  }

  async setGroupNickname(userId: string, groupId: string, nickname: string): Promise<NicknameUpdateResult> {
    return this.nicknameService.setGroupNickname(userId, groupId, nickname, this.users);
  }

  async getUserNickname(userId: string, groupId?: string): Promise<string | null> {
    return this.nicknameService.getUserNickname(userId, groupId, this.users);
  }

  async getUserNicknameInfo(userId: string): Promise<UserNicknameInfo | null> {
    const user = this.users.get(userId);
    if (!user) return null;

    return {
      userId,
      defaultNickname: user.defaultNickname,
      groupNicknames: Object.fromEntries(user.groupNicknames)
    };
  }

  async validateNickname(nickname: string): Promise<{ isValid: boolean; error?: string; suggestions?: string[] }> {
    const validation = this.nicknameService.validateNickname(nickname);
    if (!validation.isValid) {
      const suggestions = this.nicknameService.generateNicknameSuggestions(nickname, this.users);
      return {
        isValid: false,
        error: validation.error,
        suggestions
      };
    }
    return { isValid: true };
  }

  async createGuestSession(): Promise<GuestSession> {
    const session: GuestSession = {
      sessionId: this.generateId(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      createdAt: new Date(),
      lastAccessAt: new Date(),
      permissions: {
        canViewMenus: true,
        canJoinOrders: true,
        canCreateTempNickname: true,
        canAccessBasicFeatures: true
      }
    };
    
    this.guestSessions.set(session.sessionId, session);
    return session;
  }

  // 菜單儲存管理實作 (Task 5.5)
  
  async addSavedMenu(userId: string, menuId: string): Promise<boolean> {
    const user = this.users.get(userId);
    if (!user) return false;

    if (!user.savedMenus.includes(menuId)) {
      user.savedMenus.push(menuId);
      console.log(`Added menu ${menuId} to user ${userId} saved list`);
    }
    
    return true;
  }

  async removeSavedMenu(userId: string, menuId: string): Promise<boolean> {
    const user = this.users.get(userId);
    if (!user) return false;

    const index = user.savedMenus.indexOf(menuId);
    if (index > -1) {
      user.savedMenus.splice(index, 1);
      console.log(`Removed menu ${menuId} from user ${userId} saved list`);
      return true;
    }
    
    return false;
  }

  async getUserSavedMenuIds(userId: string): Promise<string[]> {
    const user = this.users.get(userId);
    return user ? [...user.savedMenus] : [];
  }

  // 群族成員管理實作 (Task 10.1)
  
  async addGroupMembership(userId: string, groupId: string): Promise<boolean> {
    const user = this.users.get(userId);
    if (!user) return false;

    if (!user.groupMemberships.includes(groupId)) {
      user.groupMemberships.push(groupId);
      console.log(`Added group membership ${groupId} to user ${userId}`);
    }
    
    return true;
  }

  async removeGroupMembership(userId: string, groupId: string): Promise<boolean> {
    const user = this.users.get(userId);
    if (!user) return false;

    const index = user.groupMemberships.indexOf(groupId);
    if (index > -1) {
      user.groupMemberships.splice(index, 1);
      // 同時移除群族專屬暱稱
      user.groupNicknames.delete(groupId);
      console.log(`Removed group membership ${groupId} from user ${userId}`);
      return true;
    }
    
    return false;
  }

  async getUserGroupMemberships(userId: string): Promise<string[]> {
    const user = this.users.get(userId);
    return user ? [...user.groupMemberships] : [];
  }

  // Helper methods
  private generateId(): string {
    return Math.random().toString(36).substring(2, 11);
  }

  // Methods for testing
  getUser(userId: string): User | undefined {
    return this.users.get(userId);
  }

  getGuestSession(sessionId: string): GuestSession | undefined {
    return this.guestSessions.get(sessionId);
  }

  // Check if guest can access basic functions
  canGuestAccessBasicFunctions(session: GuestSession): boolean {
    // Guest should be able to access basic functions if session is valid and not expired
    return session.expiresAt > new Date();
  }
}