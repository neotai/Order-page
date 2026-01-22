export interface GroupMessage {
  id: string;
  groupId: string;
  senderId: string;
  senderNickname: string;
  type: MessageType;
  content: string;
  metadata?: MessageMetadata;
  createdAt: Date;
  updatedAt: Date;
  isEdited: boolean;
  isDeleted: boolean;
  reactions: MessageReaction[];
  replyTo?: string; // 回覆的訊息ID
}

export type MessageType = 
  | 'text'           // 純文字訊息
  | 'order_share'    // 訂單分享
  | 'order_update'   // 訂單更新通知
  | 'system'         // 系統訊息
  | 'announcement'   // 公告訊息
  | 'image'          // 圖片訊息
  | 'file';          // 檔案訊息

export interface MessageMetadata {
  // 訂單相關
  orderId?: string;
  orderCode?: string;
  orderTitle?: string;
  
  // 檔案相關
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  fileUrl?: string;
  
  // 圖片相關
  imageUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
  
  // 系統訊息相關
  systemEventType?: SystemEventType;
  eventData?: any;
}

export type SystemEventType = 
  | 'member_joined'
  | 'member_left'
  | 'member_role_changed'
  | 'group_settings_updated'
  | 'order_created'
  | 'order_closed'
  | 'order_expired';

export interface MessageReaction {
  emoji: string;
  userId: string;
  userNickname: string;
  createdAt: Date;
}

// 群族通知
export interface GroupNotification {
  id: string;
  groupId: string;
  recipientId: string; // 接收者用戶ID
  type: NotificationType;
  title: string;
  content: string;
  metadata?: NotificationMetadata;
  isRead: boolean;
  createdAt: Date;
  readAt?: Date;
}

export type NotificationType = 
  | 'new_message'        // 新訊息
  | 'order_shared'       // 訂單分享
  | 'order_update'       // 訂單更新
  | 'member_joined'      // 新成員加入
  | 'role_changed'       // 角色變更
  | 'group_invitation'   // 群族邀請
  | 'mention'            // 被提及
  | 'announcement';      // 公告

export interface NotificationMetadata {
  messageId?: string;
  orderId?: string;
  orderCode?: string;
  senderId?: string;
  senderNickname?: string;
  actionUrl?: string;
}

// 訊息發送請求
export interface SendMessageRequest {
  groupId: string;
  type: MessageType;
  content: string;
  metadata?: Partial<MessageMetadata>;
  replyTo?: string;
}

// 訊息更新請求
export interface UpdateMessageRequest {
  content?: string;
  metadata?: Partial<MessageMetadata>;
}

// 訊息搜尋查詢
export interface MessageSearchQuery {
  groupId: string;
  keyword?: string;
  senderId?: string;
  type?: MessageType;
  dateRange?: {
    start: Date;
    end: Date;
  };
  hasAttachment?: boolean;
  isDeleted?: boolean;
}

export interface MessageSearchResult {
  messages: GroupMessage[];
  total: number;
  page: number;
  limit: number;
}

// 訊息統計
export interface MessageStatistics {
  totalMessages: number;
  messagesByType: { [key in MessageType]?: number };
  activeUsers: {
    userId: string;
    userNickname: string;
    messageCount: number;
  }[];
  dailyMessageCounts: {
    date: string;
    count: number;
  }[];
}

// 通知設定
export interface NotificationSettings {
  userId: string;
  groupId: string;
  enableNewMessages: boolean;
  enableOrderUpdates: boolean;
  enableMemberActivity: boolean;
  enableMentions: boolean;
  enableAnnouncements: boolean;
  muteUntil?: Date;
}

// 訊息批次操作
export interface MessageBatchOperation {
  messageIds: string[];
  operation: 'delete' | 'mark_read' | 'mark_unread';
}

// 群族訂單分享
export interface GroupOrderShare {
  id: string;
  groupId: string;
  orderId: string;
  sharedBy: string;
  sharedAt: Date;
  message?: string;
  isActive: boolean;
  statistics: {
    viewCount: number;
    joinCount: number;
    lastViewedAt?: Date;
  };
}

// 訂單分享請求
export interface ShareOrderToGroupRequest {
  groupId: string;
  orderId: string;
  message?: string;
}

// 訂單分享結果
export interface ShareOrderResult {
  success: boolean;
  shareId?: string;
  messageId?: string;
  error?: string;
}

// 即時事件
export interface RealtimeEvent {
  type: RealtimeEventType;
  groupId: string;
  data: any;
  timestamp: Date;
}

export type RealtimeEventType = 
  | 'message_sent'
  | 'message_updated'
  | 'message_deleted'
  | 'message_reaction_added'
  | 'message_reaction_removed'
  | 'user_typing'
  | 'user_online'
  | 'user_offline'
  | 'order_shared'
  | 'order_updated'
  | 'member_joined'
  | 'member_left';

// 用戶在線狀態
export interface UserOnlineStatus {
  userId: string;
  groupId: string;
  isOnline: boolean;
  lastSeen: Date;
  isTyping: boolean;
}

// 提及功能
export interface MessageMention {
  messageId: string;
  mentionedUserId: string;
  mentionedUserNickname: string;
  startIndex: number;
  endIndex: number;
}

// 訊息草稿
export interface MessageDraft {
  userId: string;
  groupId: string;
  content: string;
  replyTo?: string;
  lastUpdated: Date;
}