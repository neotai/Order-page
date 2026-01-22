export interface User {
  id: string;
  email?: string;
  passwordHash?: string;
  googleId?: string;
  defaultNickname?: string;
  groupNicknames: Map<string, string>; // groupId -> nickname
  savedMenus: string[]; // menuId[]
  groupMemberships: string[]; // groupId[] - 用戶所屬的群族列表
  createdAt: Date;
  lastLoginAt: Date;
}

export interface GuestSession {
  sessionId: string;
  tempNickname?: string;
  expiresAt: Date;
  createdAt: Date;
  lastAccessAt: Date;
  permissions: GuestPermissions;
}

export interface GuestPermissions {
  canViewMenus: boolean;
  canJoinOrders: boolean;
  canCreateTempNickname: boolean;
  canAccessBasicFeatures: boolean;
}

export interface UserRegistration {
  email: string;
  password: string;
  defaultNickname?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthResult {
  success: boolean;
  user?: User | GuestSession;
  token?: string;
  error?: string;
}