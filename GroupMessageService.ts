import {
  GroupMessage,
  GroupNotification,
  SendMessageRequest,
  UpdateMessageRequest,
  MessageSearchQuery,
  MessageSearchResult,
  MessageStatistics,
  NotificationSettings,
  MessageBatchOperation,
  GroupOrderShare,
  ShareOrderToGroupRequest,
  ShareOrderResult,
  RealtimeEvent,
  RealtimeEventType,
  UserOnlineStatus,
  MessageMention,
  MessageDraft,
  MessageType,
  NotificationType,
  SystemEventType
} from '../types/message';
import { GroupService } from './GroupService';
import { OrderService } from './OrderService';
import { UserManager } from '../managers/UserManager';
import { WebSocketService } from './WebSocketService';

export interface GroupMessageService {
  // 訊息 CRUD 操作
  sendMessage(userId: string, request: SendMessageRequest): Promise<GroupMessage | null>;
  getMessage(messageId: string): Promise<GroupMessage | null>;
  updateMessage(messageId: string, userId: string, request: UpdateMessageRequest): Promise<GroupMessage | null>;
  deleteMessage(messageId: string, userId: string): Promise<boolean>;
  
  // 訊息搜尋和列表
  getGroupMessages(groupId: string, userId: string, page?: number, limit?: number): Promise<MessageSearchResult>;
  searchMessages(query: MessageSearchQuery, userId: string, page?: number, limit?: number): Promise<MessageSearchResult>;
  
  // 訊息反應
  addReaction(messageId: string, userId: string, emoji: string): Promise<boolean>;
  removeReaction(messageId: string, userId: string, emoji: string): Promise<boolean>;
  
  // 批次操作
  batchOperateMessages(userId: string, operation: MessageBatchOperation): Promise<{ success: string[]; failed: string[] }>;
  
  // 訂單分享功能
  shareOrderToGroup(userId: string, request: ShareOrderToGroupRequest): Promise<ShareOrderResult>;
  getGroupOrderShares(groupId: string, userId: string): Promise<GroupOrderShare[]>;
  
  // 通知管理
  createNotification(notification: Omit<GroupNotification, 'id' | 'createdAt'>): Promise<GroupNotification>;
  getUserNotifications(userId: string, page?: number, limit?: number): Promise<GroupNotification[]>;
  markNotificationAsRead(notificationId: string, userId: string): Promise<boolean>;
  markAllNotificationsAsRead(userId: string, groupId?: string): Promise<number>;
  
  // 通知設定
  getNotificationSettings(userId: string, groupId: string): Promise<NotificationSettings | null>;
  updateNotificationSettings(userId: string, groupId: string, settings: Partial<NotificationSettings>): Promise<NotificationSettings | null>;
  
  // 系統訊息
  sendSystemMessage(groupId: string, eventType: SystemEventType, eventData: any): Promise<GroupMessage | null>;
  
  // 統計和分析
  getMessageStatistics(groupId: string, userId: string): Promise<MessageStatistics | null>;
  
  // 即時功能
  emitRealtimeEvent(event: RealtimeEvent): Promise<void>;
  getUserOnlineStatus(groupId: string): Promise<UserOnlineStatus[]>;
  setUserOnlineStatus(userId: string, groupId: string, isOnline: boolean): Promise<void>;
  setUserTypingStatus(userId: string, groupId: string, isTyping: boolean): Promise<void>;
  
  // 提及功能
  extractMentions(content: string): Promise<MessageMention[]>;
  notifyMentionedUsers(messageId: string, mentions: MessageMention[]): Promise<void>;
  
  // 草稿功能
  saveDraft(userId: string, groupId: string, content: string, replyTo?: string): Promise<void>;
  getDraft(userId: string, groupId: string): Promise<MessageDraft | null>;
  clearDraft(userId: string, groupId: string): Promise<void>;
}

export class GroupMessageServiceImpl implements GroupMessageService {
  private messages: Map<string, GroupMessage> = new Map();
  private notifications: Map<string, GroupNotification> = new Map();
  private notificationSettings: Map<string, NotificationSettings> = new Map(); // userId:groupId -> settings
  private orderShares: Map<string, GroupOrderShare> = new Map();
  private onlineStatus: Map<string, UserOnlineStatus> = new Map(); // userId:groupId -> status
  private drafts: Map<string, MessageDraft> = new Map(); // userId:groupId -> draft
  
  private groupService?: GroupService;
  private orderService?: OrderService;
  private userManager?: UserManager;
  private webSocketService?: WebSocketService;
  
  // 即時事件監聽器
  private realtimeListeners: ((event: RealtimeEvent) => void)[] = [];

  constructor(
    groupService?: GroupService, 
    orderService?: OrderService, 
    userManager?: UserManager,
    webSocketService?: WebSocketService
  ) {
    this.groupService = groupService;
    this.orderService = orderService;
    this.userManager = userManager;
    this.webSocketService = webSocketService;
  }

  async sendMessage(userId: string, request: SendMessageRequest): Promise<GroupMessage | null> {
    // 檢查群族權限
    if (this.groupService) {
      const permission = await this.groupService.canUserViewGroup(request.groupId, userId);
      if (!permission.hasPermission) {
        return null;
      }
    }

    // 獲取發送者暱稱
    const senderNickname = await this.getUserDisplayName(userId, request.groupId);

    const messageId = this.generateId();
    const now = new Date();

    const message: GroupMessage = {
      id: messageId,
      groupId: request.groupId,
      senderId: userId,
      senderNickname,
      type: request.type,
      content: request.content,
      metadata: request.metadata,
      createdAt: now,
      updatedAt: now,
      isEdited: false,
      isDeleted: false,
      reactions: [],
      replyTo: request.replyTo
    };

    this.messages.set(messageId, message);

    // 處理提及
    if (request.type === 'text' && request.content.includes('@')) {
      const mentions = await this.extractMentions(request.content);
      if (mentions.length > 0) {
        await this.notifyMentionedUsers(messageId, mentions);
      }
    }

    // 發送即時事件
    await this.emitRealtimeEvent({
      type: 'message_sent',
      groupId: request.groupId,
      data: message,
      timestamp: now
    });

    // 創建通知給其他成員
    await this.notifyGroupMembers(request.groupId, userId, 'new_message', {
      messageId,
      senderId: userId,
      senderNickname
    });

    console.log(`Message sent to group ${request.groupId} by user ${userId}`);
    return message;
  }

  async getMessage(messageId: string): Promise<GroupMessage | null> {
    const message = this.messages.get(messageId);
    return message && !message.isDeleted ? message : null;
  }

  async updateMessage(messageId: string, userId: string, request: UpdateMessageRequest): Promise<GroupMessage | null> {
    const message = this.messages.get(messageId);
    if (!message || message.senderId !== userId || message.isDeleted) {
      return null;
    }

    // 系統訊息不能編輯
    if (message.type === 'system') {
      return null;
    }

    const updatedMessage: GroupMessage = {
      ...message,
      ...request,
      id: messageId, // 確保 ID 不被覆蓋
      senderId: message.senderId, // 確保發送者不被覆蓋
      createdAt: message.createdAt, // 確保創建時間不被覆蓋
      updatedAt: new Date(),
      isEdited: true,
      metadata: request.metadata ? 
        { ...message.metadata, ...request.metadata } : 
        message.metadata
    };

    this.messages.set(messageId, updatedMessage);

    // 發送即時事件
    await this.emitRealtimeEvent({
      type: 'message_updated',
      groupId: message.groupId,
      data: updatedMessage,
      timestamp: new Date()
    });

    return updatedMessage;
  }

  async deleteMessage(messageId: string, userId: string): Promise<boolean> {
    const message = this.messages.get(messageId);
    if (!message || message.isDeleted) {
      return false;
    }

    // 檢查權限：只有發送者或群族管理員可以刪除
    let canDelete = message.senderId === userId;
    
    if (!canDelete && this.groupService) {
      const permission = await this.groupService.canUserManageGroup(message.groupId, userId);
      canDelete = permission.hasPermission;
    }

    if (!canDelete) {
      return false;
    }

    const deletedMessage: GroupMessage = {
      ...message,
      isDeleted: true,
      content: '[訊息已刪除]',
      updatedAt: new Date()
    };

    this.messages.set(messageId, deletedMessage);

    // 發送即時事件
    await this.emitRealtimeEvent({
      type: 'message_deleted',
      groupId: message.groupId,
      data: { messageId, deletedBy: userId },
      timestamp: new Date()
    });

    return true;
  }

  async getGroupMessages(groupId: string, userId: string, page: number = 1, limit: number = 50): Promise<MessageSearchResult> {
    // 檢查群族權限
    if (this.groupService) {
      const permission = await this.groupService.canUserViewGroup(groupId, userId);
      if (!permission.hasPermission) {
        return { messages: [], total: 0, page, limit };
      }
    }

    const allMessages = Array.from(this.messages.values())
      .filter(message => message.groupId === groupId && !message.isDeleted)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // 分頁
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedMessages = allMessages.slice(startIndex, endIndex);

    return {
      messages: paginatedMessages,
      total: allMessages.length,
      page,
      limit
    };
  }

  async searchMessages(query: MessageSearchQuery, userId: string, page: number = 1, limit: number = 20): Promise<MessageSearchResult> {
    // 檢查群族權限
    if (this.groupService) {
      const permission = await this.groupService.canUserViewGroup(query.groupId, userId);
      if (!permission.hasPermission) {
        return { messages: [], total: 0, page, limit };
      }
    }

    let filteredMessages = Array.from(this.messages.values())
      .filter(message => {
        // 基本篩選
        if (message.groupId !== query.groupId) return false;
        if (query.isDeleted !== undefined && message.isDeleted !== query.isDeleted) return false;
        if (query.senderId && message.senderId !== query.senderId) return false;
        if (query.type && message.type !== query.type) return false;

        // 關鍵字搜尋
        if (query.keyword) {
          const keyword = query.keyword.toLowerCase();
          const matchesContent = message.content.toLowerCase().includes(keyword);
          const matchesSender = message.senderNickname.toLowerCase().includes(keyword);
          
          if (!matchesContent && !matchesSender) {
            return false;
          }
        }

        // 日期範圍篩選
        if (query.dateRange) {
          const messageDate = message.createdAt;
          if (messageDate < query.dateRange.start || messageDate > query.dateRange.end) {
            return false;
          }
        }

        // 附件篩選
        if (query.hasAttachment !== undefined) {
          const hasAttachment = message.type === 'image' || message.type === 'file';
          if (hasAttachment !== query.hasAttachment) {
            return false;
          }
        }

        return true;
      });

    // 排序：最新的在前面
    filteredMessages.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // 分頁
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedMessages = filteredMessages.slice(startIndex, endIndex);

    return {
      messages: paginatedMessages,
      total: filteredMessages.length,
      page,
      limit
    };
  }

  async addReaction(messageId: string, userId: string, emoji: string): Promise<boolean> {
    const message = this.messages.get(messageId);
    if (!message || message.isDeleted) {
      return false;
    }

    // 檢查是否已經有相同的反應
    const existingReaction = message.reactions.find(r => r.userId === userId && r.emoji === emoji);
    if (existingReaction) {
      return false;
    }

    const userNickname = await this.getUserDisplayName(userId, message.groupId);
    
    const updatedMessage: GroupMessage = {
      ...message,
      reactions: [
        ...message.reactions,
        {
          emoji,
          userId,
          userNickname,
          createdAt: new Date()
        }
      ],
      updatedAt: new Date()
    };

    this.messages.set(messageId, updatedMessage);

    // 發送即時事件
    await this.emitRealtimeEvent({
      type: 'message_reaction_added',
      groupId: message.groupId,
      data: { messageId, userId, emoji, userNickname },
      timestamp: new Date()
    });

    return true;
  }

  async removeReaction(messageId: string, userId: string, emoji: string): Promise<boolean> {
    const message = this.messages.get(messageId);
    if (!message || message.isDeleted) {
      return false;
    }

    const reactionIndex = message.reactions.findIndex(r => r.userId === userId && r.emoji === emoji);
    if (reactionIndex === -1) {
      return false;
    }

    const updatedReactions = [...message.reactions];
    updatedReactions.splice(reactionIndex, 1);

    const updatedMessage: GroupMessage = {
      ...message,
      reactions: updatedReactions,
      updatedAt: new Date()
    };

    this.messages.set(messageId, updatedMessage);

    // 發送即時事件
    await this.emitRealtimeEvent({
      type: 'message_reaction_removed',
      groupId: message.groupId,
      data: { messageId, userId, emoji },
      timestamp: new Date()
    });

    return true;
  }

  async batchOperateMessages(userId: string, operation: MessageBatchOperation): Promise<{ success: string[]; failed: string[] }> {
    const success: string[] = [];
    const failed: string[] = [];

    for (const messageId of operation.messageIds) {
      try {
        let result = false;

        switch (operation.operation) {
          case 'delete':
            result = await this.deleteMessage(messageId, userId);
            break;
          // mark_read 和 mark_unread 需要在通知系統中實現
          default:
            result = false;
        }

        if (result) {
          success.push(messageId);
        } else {
          failed.push(messageId);
        }
      } catch (error) {
        console.error(`Error processing message ${messageId}:`, error);
        failed.push(messageId);
      }
    }

    return { success, failed };
  }

  async shareOrderToGroup(userId: string, request: ShareOrderToGroupRequest): Promise<ShareOrderResult> {
    // 檢查群族權限
    if (this.groupService) {
      const permission = await this.groupService.canUserViewGroup(request.groupId, userId);
      if (!permission.hasPermission) {
        return { success: false, error: 'No permission to access group' };
      }
    }

    // 檢查訂單是否存在
    if (this.orderService) {
      const order = await this.orderService.getOrderById(request.orderId);
      if (!order) {
        return { success: false, error: 'Order not found' };
      }

      // 檢查用戶是否有權限分享此訂單
      const canModify = await this.orderService.canUserModifyOrder(request.orderId, userId);
      if (!canModify) {
        return { success: false, error: 'No permission to share this order' };
      }
    }

    // 創建訂單分享記錄
    const shareId = this.generateId();
    const now = new Date();

    const orderShare: GroupOrderShare = {
      id: shareId,
      groupId: request.groupId,
      orderId: request.orderId,
      sharedBy: userId,
      sharedAt: now,
      message: request.message,
      isActive: true,
      statistics: {
        viewCount: 0,
        joinCount: 0
      }
    };

    this.orderShares.set(shareId, orderShare);

    // 發送訂單分享訊息
    const messageRequest: SendMessageRequest = {
      groupId: request.groupId,
      type: 'order_share',
      content: request.message || '分享了一個團購訂單',
      metadata: {
        orderId: request.orderId,
        orderCode: '', // 需要從訂單服務獲取
        orderTitle: '' // 需要從訂單服務獲取
      }
    };

    // 如果有訂單服務，獲取訂單詳情
    if (this.orderService) {
      const order = await this.orderService.getOrderById(request.orderId);
      if (order) {
        messageRequest.metadata!.orderCode = order.orderCode;
        messageRequest.metadata!.orderTitle = order.title;
      }
    }

    const message = await this.sendMessage(userId, messageRequest);

    // 記錄群族活動
    if (this.groupService) {
      await this.groupService.recordActivity({
        groupId: request.groupId,
        userId,
        userNickname: await this.getUserDisplayName(userId, request.groupId),
        type: 'order_shared',
        description: `分享了訂單: ${messageRequest.metadata?.orderTitle || request.orderId}`,
        metadata: { orderId: request.orderId, shareId }
      });
    }

    // 發送即時事件
    await this.emitRealtimeEvent({
      type: 'order_shared',
      groupId: request.groupId,
      data: { orderShare, message },
      timestamp: now
    });

    return {
      success: true,
      shareId,
      messageId: message?.id
    };
  }

  async getGroupOrderShares(groupId: string, userId: string): Promise<GroupOrderShare[]> {
    // 檢查群族權限
    if (this.groupService) {
      const permission = await this.groupService.canUserViewGroup(groupId, userId);
      if (!permission.hasPermission) {
        return [];
      }
    }

    return Array.from(this.orderShares.values())
      .filter(share => share.groupId === groupId && share.isActive)
      .sort((a, b) => b.sharedAt.getTime() - a.sharedAt.getTime());
  }

  async createNotification(notification: Omit<GroupNotification, 'id' | 'createdAt'>): Promise<GroupNotification> {
    const notificationId = this.generateId();
    const fullNotification: GroupNotification = {
      ...notification,
      id: notificationId,
      createdAt: new Date()
    };

    this.notifications.set(notificationId, fullNotification);
    return fullNotification;
  }

  async getUserNotifications(userId: string, page: number = 1, limit: number = 20): Promise<GroupNotification[]> {
    const userNotifications = Array.from(this.notifications.values())
      .filter(notification => notification.recipientId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // 分頁
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    
    return userNotifications.slice(startIndex, endIndex);
  }

  async markNotificationAsRead(notificationId: string, userId: string): Promise<boolean> {
    const notification = this.notifications.get(notificationId);
    if (!notification || notification.recipientId !== userId) {
      return false;
    }

    const updatedNotification: GroupNotification = {
      ...notification,
      isRead: true,
      readAt: new Date()
    };

    this.notifications.set(notificationId, updatedNotification);
    return true;
  }

  async markAllNotificationsAsRead(userId: string, groupId?: string): Promise<number> {
    let count = 0;
    const now = new Date();

    for (const [notificationId, notification] of this.notifications.entries()) {
      if (notification.recipientId === userId && 
          !notification.isRead &&
          (!groupId || notification.groupId === groupId)) {
        
        const updatedNotification: GroupNotification = {
          ...notification,
          isRead: true,
          readAt: now
        };

        this.notifications.set(notificationId, updatedNotification);
        count++;
      }
    }

    return count;
  }

  async getNotificationSettings(userId: string, groupId: string): Promise<NotificationSettings | null> {
    const key = `${userId}:${groupId}`;
    return this.notificationSettings.get(key) || null;
  }

  async updateNotificationSettings(userId: string, groupId: string, settings: Partial<NotificationSettings>): Promise<NotificationSettings | null> {
    const key = `${userId}:${groupId}`;
    const existing = this.notificationSettings.get(key);

    const updatedSettings: NotificationSettings = {
      userId,
      groupId,
      enableNewMessages: true,
      enableOrderUpdates: true,
      enableMemberActivity: true,
      enableMentions: true,
      enableAnnouncements: true,
      ...existing,
      ...settings
    };

    this.notificationSettings.set(key, updatedSettings);
    return updatedSettings;
  }

  async sendSystemMessage(groupId: string, eventType: SystemEventType, eventData: any): Promise<GroupMessage | null> {
    let content = '';
    
    switch (eventType) {
      case 'member_joined':
        content = `${eventData.memberNickname} 加入了群族`;
        break;
      case 'member_left':
        content = `${eventData.memberNickname} 離開了群族`;
        break;
      case 'member_role_changed':
        content = `${eventData.memberNickname} 的角色已變更為 ${eventData.newRole}`;
        break;
      case 'group_settings_updated':
        content = '群族設定已更新';
        break;
      case 'order_created':
        content = `新的團購訂單已建立: ${eventData.orderTitle}`;
        break;
      case 'order_closed':
        content = `團購訂單已結束: ${eventData.orderTitle}`;
        break;
      case 'order_expired':
        content = `團購訂單已過期: ${eventData.orderTitle}`;
        break;
      default:
        content = '系統事件';
    }

    const messageRequest: SendMessageRequest = {
      groupId,
      type: 'system',
      content,
      metadata: {
        systemEventType: eventType,
        eventData
      }
    };

    // 使用系統用戶ID發送訊息
    return await this.sendMessage('system', messageRequest);
  }

  async getMessageStatistics(groupId: string, userId: string): Promise<MessageStatistics | null> {
    // 檢查群族權限
    if (this.groupService) {
      const permission = await this.groupService.canUserViewGroup(groupId, userId);
      if (!permission.hasPermission) {
        return null;
      }
    }

    const groupMessages = Array.from(this.messages.values())
      .filter(message => message.groupId === groupId && !message.isDeleted);

    const totalMessages = groupMessages.length;
    
    // 按類型統計
    const messagesByType: { [key in MessageType]?: number } = {};
    for (const message of groupMessages) {
      messagesByType[message.type] = (messagesByType[message.type] || 0) + 1;
    }

    // 活躍用戶統計
    const userMessageCounts = new Map<string, { nickname: string; count: number }>();
    for (const message of groupMessages) {
      const existing = userMessageCounts.get(message.senderId);
      if (existing) {
        existing.count++;
      } else {
        userMessageCounts.set(message.senderId, {
          nickname: message.senderNickname,
          count: 1
        });
      }
    }

    const activeUsers = Array.from(userMessageCounts.entries())
      .map(([userId, data]) => ({
        userId,
        userNickname: data.nickname,
        messageCount: data.count
      }))
      .sort((a, b) => b.messageCount - a.messageCount)
      .slice(0, 10);

    // 每日訊息統計
    const dailyCounts = new Map<string, number>();
    for (const message of groupMessages) {
      const dateKey = message.createdAt.toISOString().split('T')[0];
      dailyCounts.set(dateKey, (dailyCounts.get(dateKey) || 0) + 1);
    }

    const dailyMessageCounts = Array.from(dailyCounts.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      totalMessages,
      messagesByType,
      activeUsers,
      dailyMessageCounts
    };
  }

  async emitRealtimeEvent(event: RealtimeEvent): Promise<void> {
    // 通知所有監聽器
    for (const listener of this.realtimeListeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in realtime event listener:', error);
      }
    }

    // 使用 WebSocket 廣播事件
    if (this.webSocketService) {
      this.webSocketService.broadcastGroupMessage(event.groupId, {
        eventType: event.type,
        data: event.data,
        timestamp: event.timestamp
      });
    }
  }

  async getUserOnlineStatus(groupId: string): Promise<UserOnlineStatus[]> {
    return Array.from(this.onlineStatus.values())
      .filter(status => status.groupId === groupId);
  }

  async setUserOnlineStatus(userId: string, groupId: string, isOnline: boolean): Promise<void> {
    const key = `${userId}:${groupId}`;
    const existing = this.onlineStatus.get(key);

    const status: UserOnlineStatus = {
      userId,
      groupId,
      isOnline,
      lastSeen: new Date(),
      isTyping: existing?.isTyping || false
    };

    this.onlineStatus.set(key, status);

    // 發送即時事件
    await this.emitRealtimeEvent({
      type: isOnline ? 'user_online' : 'user_offline',
      groupId,
      data: status,
      timestamp: new Date()
    });
  }

  async setUserTypingStatus(userId: string, groupId: string, isTyping: boolean): Promise<void> {
    const key = `${userId}:${groupId}`;
    const existing = this.onlineStatus.get(key);

    if (existing) {
      existing.isTyping = isTyping;
      this.onlineStatus.set(key, existing);

      // 發送即時事件
      await this.emitRealtimeEvent({
        type: 'user_typing',
        groupId,
        data: { userId, isTyping },
        timestamp: new Date()
      });
    }
  }

  async extractMentions(content: string): Promise<MessageMention[]> {
    const mentions: MessageMention[] = [];
    const mentionRegex = /@(\w+)/g;
    let match;

    while ((match = mentionRegex.exec(content)) !== null) {
      const mentionedNickname = match[1];
      
      // 這裡需要根據暱稱查找用戶ID
      // 簡化實現，實際應該查詢用戶資料庫
      mentions.push({
        messageId: '', // 稍後設定
        mentionedUserId: mentionedNickname, // 簡化實現
        mentionedUserNickname: mentionedNickname,
        startIndex: match.index,
        endIndex: match.index + match[0].length
      });
    }

    return mentions;
  }

  async notifyMentionedUsers(messageId: string, mentions: MessageMention[]): Promise<void> {
    const message = this.messages.get(messageId);
    if (!message) return;

    for (const mention of mentions) {
      await this.createNotification({
        groupId: message.groupId,
        recipientId: mention.mentionedUserId,
        type: 'mention',
        title: '您被提及了',
        content: `${message.senderNickname} 在訊息中提及了您`,
        metadata: {
          messageId,
          senderId: message.senderId,
          senderNickname: message.senderNickname
        },
        isRead: false
      });
    }
  }

  async saveDraft(userId: string, groupId: string, content: string, replyTo?: string): Promise<void> {
    const key = `${userId}:${groupId}`;
    const draft: MessageDraft = {
      userId,
      groupId,
      content,
      replyTo,
      lastUpdated: new Date()
    };

    this.drafts.set(key, draft);
  }

  async getDraft(userId: string, groupId: string): Promise<MessageDraft | null> {
    const key = `${userId}:${groupId}`;
    return this.drafts.get(key) || null;
  }

  async clearDraft(userId: string, groupId: string): Promise<void> {
    const key = `${userId}:${groupId}`;
    this.drafts.delete(key);
  }

  // 私有輔助方法

  private async getUserDisplayName(userId: string, groupId?: string): Promise<string> {
    if (userId === 'system') {
      return '系統';
    }

    if (this.userManager) {
      const nickname = await this.userManager.getUserNickname(userId, groupId);
      if (nickname) {
        return nickname;
      }
    }

    // 回退到用戶ID
    return userId;
  }

  private async notifyGroupMembers(groupId: string, senderId: string, type: NotificationType, metadata: any): Promise<void> {
    if (!this.groupService) return;

    const group = await this.groupService.getGroupById(groupId);
    if (!group) return;

    // 通知除了發送者之外的所有成員
    for (const member of group.members) {
      if (member.userId !== senderId) {
        // 檢查通知設定
        const settings = await this.getNotificationSettings(member.userId, groupId);
        
        let shouldNotify = true;
        if (settings) {
          switch (type) {
            case 'new_message':
              shouldNotify = settings.enableNewMessages;
              break;
            case 'order_shared':
            case 'order_update':
              shouldNotify = settings.enableOrderUpdates;
              break;
            case 'member_joined':
              shouldNotify = settings.enableMemberActivity;
              break;
            case 'mention':
              shouldNotify = settings.enableMentions;
              break;
            case 'announcement':
              shouldNotify = settings.enableAnnouncements;
              break;
          }

          // 檢查是否被靜音
          if (settings.muteUntil && settings.muteUntil > new Date()) {
            shouldNotify = false;
          }
        }

        if (shouldNotify) {
          await this.createNotification({
            groupId,
            recipientId: member.userId,
            type,
            title: this.getNotificationTitle(type),
            content: this.getNotificationContent(type, metadata),
            metadata,
            isRead: false
          });
        }
      }
    }
  }

  private getNotificationTitle(type: NotificationType): string {
    switch (type) {
      case 'new_message': return '新訊息';
      case 'order_shared': return '訂單分享';
      case 'order_update': return '訂單更新';
      case 'member_joined': return '新成員';
      case 'role_changed': return '角色變更';
      case 'group_invitation': return '群族邀請';
      case 'mention': return '被提及';
      case 'announcement': return '公告';
      default: return '通知';
    }
  }

  private getNotificationContent(type: NotificationType, metadata: any): string {
    switch (type) {
      case 'new_message':
        return `${metadata.senderNickname} 發送了新訊息`;
      case 'order_shared':
        return `${metadata.senderNickname} 分享了團購訂單`;
      case 'order_update':
        return `團購訂單有新的更新`;
      case 'member_joined':
        return `${metadata.memberNickname} 加入了群族`;
      case 'role_changed':
        return `您的角色已變更`;
      case 'group_invitation':
        return `您收到了群族邀請`;
      case 'mention':
        return `${metadata.senderNickname} 在訊息中提及了您`;
      case 'announcement':
        return `群族有新的公告`;
      default:
        return '您有新的通知';
    }
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
  }

  /**
   * 設定 WebSocket 服務引用
   */
  setWebSocketService(webSocketService: WebSocketService): void {
    this.webSocketService = webSocketService;
  }

  // 即時事件監聽器管理
  addRealtimeListener(listener: (event: RealtimeEvent) => void): void {
    this.realtimeListeners.push(listener);
  }

  removeRealtimeListener(listener: (event: RealtimeEvent) => void): void {
    const index = this.realtimeListeners.indexOf(listener);
    if (index > -1) {
      this.realtimeListeners.splice(index, 1);
    }
  }

  // 測試和調試方法
  getMessage_Debug(messageId: string): GroupMessage | undefined {
    return this.messages.get(messageId);
  }

  getNotification_Debug(notificationId: string): GroupNotification | undefined {
    return this.notifications.get(notificationId);
  }
}