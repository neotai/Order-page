import { OrderParticipant, GroupOrder } from '../types/order';
import { UserManager } from '../managers/UserManager';
import { GuestService } from './GuestService';

export interface ParticipantIdentity {
  id: string;
  type: 'registered' | 'guest';
  userId?: string;
  guestSessionId?: string;
  nickname: string;
  isVerified: boolean;
  joinedOrders: string[];
  createdAt: Date;
  lastActiveAt: Date;
}

export interface ParticipantValidationResult {
  isValid: boolean;
  canJoin: boolean;
  identity?: ParticipantIdentity;
  error?: string;
}

export interface ParticipantJoinRequest {
  orderCode: string;
  nickname: string;
  userId?: string;
  guestSessionId?: string;
}

export interface ParticipantService {
  // 身份驗證和管理
  validateParticipantIdentity(request: ParticipantJoinRequest): Promise<ParticipantValidationResult>;
  createParticipantIdentity(request: ParticipantJoinRequest): Promise<ParticipantIdentity>;
  getParticipantIdentity(participantId: string): Promise<ParticipantIdentity | null>;
  updateParticipantActivity(participantId: string): Promise<void>;
  
  // 參與者權限檢查
  canParticipantJoinOrder(participantId: string, order: GroupOrder): Promise<boolean>;
  canParticipantModifyOrder(participantId: string, order: GroupOrder): Promise<boolean>;
  isParticipantInOrder(participantId: string, orderId: string): Promise<boolean>;
  
  // 參與者統計和歷史
  getParticipantOrderHistory(participantId: string): Promise<GroupOrder[]>;
  getParticipantStatistics(participantId: string): Promise<ParticipantStatistics>;
  
  // 暱稱管理
  isNicknameAvailableInOrder(nickname: string, orderId: string): Promise<boolean>;
  suggestAlternativeNicknames(nickname: string, orderId: string): Promise<string[]>;
}

export interface ParticipantStatistics {
  totalOrders: number;
  totalSpent: number;
  averageOrderValue: number;
  favoriteItems: string[];
  joinDate: Date;
  lastOrderDate?: Date;
}

export class ParticipantServiceImpl implements ParticipantService {
  private participants: Map<string, ParticipantIdentity> = new Map();
  private userManager: UserManager;
  private guestService: GuestService;
  private orders: Map<string, GroupOrder> = new Map(); // Reference to orders

  constructor(userManager: UserManager, guestService: GuestService) {
    this.userManager = userManager;
    this.guestService = guestService;
  }

  // 設定訂單引用（由 OrderService 調用）
  setOrdersReference(orders: Map<string, GroupOrder>): void {
    this.orders = orders;
  }

  async validateParticipantIdentity(request: ParticipantJoinRequest): Promise<ParticipantValidationResult> {
    // 驗證暱稱格式
    if (!this.isValidNickname(request.nickname)) {
      return {
        isValid: false,
        canJoin: false,
        error: 'Invalid nickname format. Must be 2-20 characters, alphanumeric and Chinese characters only.'
      };
    }

    // 檢查是否為註冊用戶
    if (request.userId) {
      const user = await this.userManager.getUserById(request.userId);
      if (!user) {
        return {
          isValid: false,
          canJoin: false,
          error: 'Invalid user ID'
        };
      }

      // 檢查用戶是否已經有參與者身份
      const existingIdentity = await this.findParticipantByUserId(request.userId);
      if (existingIdentity) {
        return {
          isValid: true,
          canJoin: true,
          identity: existingIdentity
        };
      }
    }

    // 檢查訪客 session
    if (request.guestSessionId) {
      const guestSession = await this.guestService.getGuestSession(request.guestSessionId);
      if (!guestSession) {
        return {
          isValid: false,
          canJoin: false,
          error: 'Invalid guest session'
        };
      }

      // 檢查訪客是否已經有參與者身份
      const existingIdentity = await this.findParticipantByGuestSession(request.guestSessionId);
      if (existingIdentity) {
        return {
          isValid: true,
          canJoin: true,
          identity: existingIdentity
        };
      }
    }

    // 如果沒有現有身份，創建新的參與者身份
    const identity = await this.createParticipantIdentity(request);
    
    return {
      isValid: true,
      canJoin: true,
      identity
    };
  }

  async createParticipantIdentity(request: ParticipantJoinRequest): Promise<ParticipantIdentity> {
    const participantId = this.generateId();
    const now = new Date();

    const identity: ParticipantIdentity = {
      id: participantId,
      type: request.userId ? 'registered' : 'guest',
      userId: request.userId,
      guestSessionId: request.guestSessionId,
      nickname: request.nickname,
      isVerified: !!request.userId, // 註冊用戶自動驗證
      joinedOrders: [],
      createdAt: now,
      lastActiveAt: now
    };

    this.participants.set(participantId, identity);
    console.log(`Created participant identity: ${participantId} (${identity.type})`);
    
    return identity;
  }

  async getParticipantIdentity(participantId: string): Promise<ParticipantIdentity | null> {
    return this.participants.get(participantId) || null;
  }

  async updateParticipantActivity(participantId: string): Promise<void> {
    const identity = this.participants.get(participantId);
    if (identity) {
      identity.lastActiveAt = new Date();
      this.participants.set(participantId, identity);
    }
  }

  async canParticipantJoinOrder(participantId: string, order: GroupOrder): Promise<boolean> {
    const identity = await this.getParticipantIdentity(participantId);
    if (!identity) {
      return false;
    }

    // 檢查訂單狀態
    if (order.status !== 'active') {
      return false;
    }

    // 檢查截止時間
    if (order.deadline && order.deadline <= new Date()) {
      return false;
    }

    // 檢查參與人數限制
    if (order.settings.maxParticipants && 
        order.participants.length >= order.settings.maxParticipants) {
      return false;
    }

    // 檢查是否已經參與
    const isAlreadyParticipant = order.participants.some(p => 
      p.id === participantId ||
      (identity.userId && p.userId === identity.userId) ||
      (identity.guestSessionId && p.guestSessionId === identity.guestSessionId)
    );

    return !isAlreadyParticipant;
  }

  async canParticipantModifyOrder(participantId: string, order: GroupOrder): Promise<boolean> {
    // 檢查訂單狀態和設定
    if (order.status !== 'active' || !order.settings.allowModification) {
      return false;
    }

    // 檢查是否為參與者
    return await this.isParticipantInOrder(participantId, order.id);
  }

  async isParticipantInOrder(participantId: string, orderId: string): Promise<boolean> {
    const order = this.orders.get(orderId);
    if (!order) {
      return false;
    }

    const identity = await this.getParticipantIdentity(participantId);
    if (!identity) {
      return false;
    }

    return order.participants.some(p => 
      p.id === participantId ||
      (identity.userId && p.userId === identity.userId) ||
      (identity.guestSessionId && p.guestSessionId === identity.guestSessionId)
    );
  }

  async getParticipantOrderHistory(participantId: string): Promise<GroupOrder[]> {
    const identity = await this.getParticipantIdentity(participantId);
    if (!identity) {
      return [];
    }

    const participantOrders: GroupOrder[] = [];
    
    for (const order of this.orders.values()) {
      const isParticipant = order.participants.some(p => 
        p.id === participantId ||
        (identity.userId && p.userId === identity.userId) ||
        (identity.guestSessionId && p.guestSessionId === identity.guestSessionId)
      );
      
      if (isParticipant) {
        participantOrders.push(order);
      }
    }

    // 按時間排序，最新的在前
    return participantOrders.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getParticipantStatistics(participantId: string): Promise<ParticipantStatistics> {
    const orderHistory = await this.getParticipantOrderHistory(participantId);
    const identity = await this.getParticipantIdentity(participantId);

    if (!identity) {
      throw new Error('Participant not found');
    }

    let totalSpent = 0;
    const itemCounts = new Map<string, number>();
    let lastOrderDate: Date | undefined;

    for (const order of orderHistory) {
      const participant = order.participants.find(p => 
        p.id === participantId ||
        (identity.userId && p.userId === identity.userId) ||
        (identity.guestSessionId && p.guestSessionId === identity.guestSessionId)
      );

      if (participant) {
        totalSpent += participant.totalAmount;
        
        // 統計喜愛的項目
        for (const item of participant.items) {
          const count = itemCounts.get(item.menuItemName) || 0;
          itemCounts.set(item.menuItemName, count + item.quantity);
        }

        // 更新最後訂單日期
        if (!lastOrderDate || order.createdAt > lastOrderDate) {
          lastOrderDate = order.createdAt;
        }
      }
    }

    // 找出最喜愛的項目（前5名）
    const favoriteItems = Array.from(itemCounts.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([itemName]) => itemName);

    return {
      totalOrders: orderHistory.length,
      totalSpent,
      averageOrderValue: orderHistory.length > 0 ? totalSpent / orderHistory.length : 0,
      favoriteItems,
      joinDate: identity.createdAt,
      lastOrderDate
    };
  }

  async isNicknameAvailableInOrder(nickname: string, orderId: string): Promise<boolean> {
    const order = this.orders.get(orderId);
    if (!order) {
      return false;
    }

    return !order.participants.some(p => p.nickname === nickname);
  }

  async suggestAlternativeNicknames(nickname: string, orderId: string): Promise<string[]> {
    const suggestions: string[] = [];
    const baseNickname = nickname;

    // 生成數字後綴建議
    for (let i = 1; i <= 5; i++) {
      const suggestion = `${baseNickname}${i}`;
      const isAvailable = await this.isNicknameAvailableInOrder(suggestion, orderId);
      if (isAvailable) {
        suggestions.push(suggestion);
      }
    }

    // 生成其他變化
    const variations = [
      `${baseNickname}_`,
      `${baseNickname}2024`,
      `新${baseNickname}`,
      `${baseNickname}哥`,
      `${baseNickname}姐`
    ];

    for (const variation of variations) {
      if (suggestions.length >= 5) break;
      
      const isAvailable = await this.isNicknameAvailableInOrder(variation, orderId);
      if (isAvailable) {
        suggestions.push(variation);
      }
    }

    return suggestions.slice(0, 5);
  }

  // 私有輔助方法
  private async findParticipantByUserId(userId: string): Promise<ParticipantIdentity | null> {
    for (const identity of this.participants.values()) {
      if (identity.userId === userId) {
        return identity;
      }
    }
    return null;
  }

  private async findParticipantByGuestSession(guestSessionId: string): Promise<ParticipantIdentity | null> {
    for (const identity of this.participants.values()) {
      if (identity.guestSessionId === guestSessionId) {
        return identity;
      }
    }
    return null;
  }

  private isValidNickname(nickname: string): boolean {
    // 檢查長度：2-20 字符
    if (nickname.length < 2 || nickname.length > 20) {
      return false;
    }

    // 檢查字符：只允許中文、英文、數字和部分特殊字符
    const validPattern = /^[\u4e00-\u9fa5a-zA-Z0-9_\-\s]+$/;
    if (!validPattern.test(nickname)) {
      return false;
    }

    // 檢查是否包含不當內容（簡單版本）
    const forbiddenWords = ['admin', 'system', 'null', 'undefined', '管理員', '系統'];
    const lowerNickname = nickname.toLowerCase();
    
    for (const word of forbiddenWords) {
      if (lowerNickname.includes(word)) {
        return false;
      }
    }

    return true;
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
  }
}