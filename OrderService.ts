import {
  GroupOrder,
  OrderStatus,
  OrderParticipant,
  OrderItem,
  OrderSummary,
  OrderItemBreakdown,
  GroupOrderCreateRequest,
  GroupOrderUpdateRequest,
  JoinOrderRequest,
  AddOrderItemRequest,
  UpdateOrderItemRequest,
  OrderSearchQuery,
  OrderSearchResult,
  OrderValidationResult,
  OrderStatistics,
  PopularMenuItem,
  AdvancedOrderSearchQuery,
  OrderReport,
  ParticipantReport,
  OrderTimelineEvent,
  FinancialBreakdown,
  OrderAnalytics,
  TimeSeriesData,
  HourlyStats,
  RestaurantStats,
  ParticipantBehaviorStats,
  DEFAULT_ORDER_SETTINGS
} from '../types/order';
import { MenuService } from './MenuService';
import { ParticipantService } from './ParticipantService';
import { GroupMessageService } from './GroupMessageService';
import { WebSocketService } from './WebSocketService';
import { 
  OrderModificationService, 
  OrderModificationServiceImpl, 
  EnhancedOrderModificationMethods,
  ModificationPermissionCheck,
  OrderModification,
  OrderTotals,
  ParticipantTotals
} from './OrderModificationService';

export interface OrderService extends EnhancedOrderModificationMethods {
  // 訂單 CRUD 操作
  createGroupOrder(userId: string, request: GroupOrderCreateRequest): Promise<GroupOrder>;
  getOrderById(orderId: string): Promise<GroupOrder | null>;
  getOrderByCode(orderCode: string): Promise<GroupOrder | null>;
  updateOrder(orderId: string, userId: string, request: GroupOrderUpdateRequest): Promise<GroupOrder | null>;
  closeOrder(orderId: string, userId: string): Promise<boolean>;
  deleteOrder(orderId: string, userId: string): Promise<boolean>;
  
  // 訂單狀態管理
  expireOrder(orderId: string): Promise<boolean>;
  checkAndExpireOrders(): Promise<string[]>; // 返回過期的訂單ID列表
  
  // 參與者管理
  joinOrder(request: JoinOrderRequest): Promise<OrderValidationResult>;
  leaveOrder(orderId: string, participantId: string): Promise<boolean>;
  getOrderParticipants(orderId: string): Promise<OrderParticipant[]>;
  
  // 訂單項目管理
  addOrderItem(orderId: string, participantId: string, request: AddOrderItemRequest): Promise<OrderItem | null>;
  updateOrderItem(orderId: string, participantId: string, itemId: string, request: UpdateOrderItemRequest): Promise<OrderItem | null>;
  removeOrderItem(orderId: string, participantId: string, itemId: string): Promise<boolean>;
  
  // 訂單搜尋和列表
  searchOrders(query: OrderSearchQuery, page?: number, limit?: number): Promise<OrderSearchResult>;
  getUserOrders(userId: string, page?: number, limit?: number): Promise<OrderSearchResult>;
  getParticipantOrders(participantId: string, page?: number, limit?: number): Promise<OrderSearchResult>;
  
  // 訂單統計和摘要
  calculateOrderSummary(orderId: string): Promise<OrderSummary | null>;
  getOrderStatistics(userId?: string): Promise<OrderStatistics>;
  
  // 訂單項目搜尋功能
  searchOrderItems(orderId: string, keyword?: string): Promise<OrderItem[]>;
  
  // 高級搜尋功能
  advancedSearchOrders(query: AdvancedOrderSearchQuery, page?: number, limit?: number): Promise<OrderSearchResult>;
  
  // 訂單管理功能
  bulkCloseOrders(orderIds: string[], userId: string): Promise<{ success: string[]; failed: string[] }>;
  getOrdersByStatus(status: OrderStatus, page?: number, limit?: number): Promise<OrderSearchResult>;
  getOrdersByDateRange(startDate: Date, endDate: Date, page?: number, limit?: number): Promise<OrderSearchResult>;
  
  // 訂單摘要和報告
  generateOrderReport(orderId: string): Promise<OrderReport | null>;
  getOrderAnalytics(userId?: string, dateRange?: { start: Date; end: Date }): Promise<OrderAnalytics>;
  
  // 群族訂單分享功能 (Task 10.2)
  shareOrderToGroup(orderId: string, groupId: string, userId: string, message?: string): Promise<boolean>;
  notifyGroupOrderUpdate(orderId: string, updateType: string, updateData: any): Promise<void>;
}

export class OrderServiceImpl implements OrderService {
  private orders: Map<string, GroupOrder> = new Map();
  private orderCodeIndex: Map<string, string> = new Map(); // orderCode -> orderId
  private menuService: MenuService;
  private participantService?: ParticipantService;
  private modificationService: OrderModificationService;
  private messageService?: GroupMessageService;
  private webSocketService?: WebSocketService;

  constructor(
    menuService: MenuService, 
    participantService?: ParticipantService, 
    messageService?: GroupMessageService,
    webSocketService?: WebSocketService
  ) {
    this.menuService = menuService;
    this.participantService = participantService;
    this.messageService = messageService;
    this.webSocketService = webSocketService;
    this.modificationService = new OrderModificationServiceImpl();
    
    // 設定服務引用
    if (this.participantService && 'setOrdersReference' in this.participantService) {
      (this.participantService as any).setOrdersReference(this.orders);
    }
    
    if ('setOrdersReference' in this.modificationService) {
      (this.modificationService as any).setOrdersReference(this.orders);
    }
    
    // 啟動定期檢查過期訂單的任務
    this.startExpirationChecker();
  }

  async createGroupOrder(userId: string, request: GroupOrderCreateRequest): Promise<GroupOrder> {
    // 驗證菜單是否存在
    const menu = await this.menuService.getMenuById(request.menuId);
    if (!menu) {
      throw new Error('Menu not found');
    }

    // 檢查用戶是否有權限查看此菜單
    const canView = await this.menuService.canUserViewMenu(request.menuId, userId);
    if (!canView) {
      throw new Error('Permission denied: Cannot create order for private menu');
    }

    const orderId = this.generateId();
    const orderCode = this.generateOrderCode();
    const now = new Date();

    const order: GroupOrder = {
      id: orderId,
      orderCode,
      menuId: request.menuId,
      createdBy: userId,
      title: request.title,
      description: request.description,
      status: 'active',
      deadline: request.deadline,
      createdAt: now,
      updatedAt: now,
      participants: [],
      summary: {
        totalParticipants: 0,
        totalItems: 0,
        totalAmount: 0,
        itemBreakdown: [],
        lastUpdated: now
      },
      settings: {
        ...DEFAULT_ORDER_SETTINGS,
        ...request.settings
      }
    };

    this.orders.set(orderId, order);
    this.orderCodeIndex.set(orderCode, orderId);

    console.log(`Group order created: ${orderId} with code: ${orderCode}`);
    
    // 廣播訂單創建事件
    this.broadcastOrderEvent(orderId, 'order_created', {
      order: this.sanitizeOrderForBroadcast(order)
    });
    
    return order;
  }

  async getOrderById(orderId: string): Promise<GroupOrder | null> {
    return this.orders.get(orderId) || null;
  }

  async getOrderByCode(orderCode: string): Promise<GroupOrder | null> {
    const orderId = this.orderCodeIndex.get(orderCode);
    return orderId ? this.getOrderById(orderId) : null;
  }

  async updateOrder(orderId: string, userId: string, request: GroupOrderUpdateRequest): Promise<GroupOrder | null> {
    const order = this.orders.get(orderId);
    if (!order || order.createdBy !== userId) {
      return null;
    }

    // 不能修改已關閉或過期的訂單
    if (order.status !== 'active') {
      return null;
    }

    const updatedOrder: GroupOrder = {
      ...order,
      ...request,
      id: orderId, // 確保 ID 不被覆蓋
      orderCode: order.orderCode, // 確保訂單代碼不被覆蓋
      createdBy: order.createdBy, // 確保創建者不被覆蓋
      createdAt: order.createdAt, // 確保創建時間不被覆蓋
      updatedAt: new Date(),
      settings: {
        ...order.settings,
        ...request.settings
      }
    };

    this.orders.set(orderId, updatedOrder);
    
    // 廣播訂單更新事件
    this.broadcastOrderEvent(orderId, 'order_updated', {
      order: this.sanitizeOrderForBroadcast(updatedOrder),
      changes: request
    });
    
    return updatedOrder;
  }

  async closeOrder(orderId: string, userId: string): Promise<boolean> {
    const order = this.orders.get(orderId);
    if (!order || order.createdBy !== userId) {
      return false;
    }

    if (order.status !== 'active') {
      return false; // 已經關閉或過期
    }

    const now = new Date();
    const closedOrder: GroupOrder = {
      ...order,
      status: 'closed',
      closedAt: now,
      updatedAt: now
    };

    this.orders.set(orderId, closedOrder);
    console.log(`Order ${orderId} closed by user ${userId}`);
    
    // 廣播訂單關閉事件
    this.broadcastOrderEvent(orderId, 'order_closed', {
      order: this.sanitizeOrderForBroadcast(closedOrder),
      closedBy: userId
    });
    
    return true;
  }

  async deleteOrder(orderId: string, userId: string): Promise<boolean> {
    const order = this.orders.get(orderId);
    if (!order || order.createdBy !== userId) {
      return false;
    }

    this.orders.delete(orderId);
    this.orderCodeIndex.delete(order.orderCode);
    console.log(`Order ${orderId} deleted by user ${userId}`);
    return true;
  }

  async expireOrder(orderId: string): Promise<boolean> {
    const order = this.orders.get(orderId);
    if (!order || order.status !== 'active') {
      return false;
    }

    const now = new Date();
    const expiredOrder: GroupOrder = {
      ...order,
      status: 'expired',
      closedAt: now,
      updatedAt: now
    };

    this.orders.set(orderId, expiredOrder);
    console.log(`Order ${orderId} expired`);
    
    // 廣播訂單過期事件
    this.broadcastOrderEvent(orderId, 'order_expired', {
      order: this.sanitizeOrderForBroadcast(expiredOrder)
    });
    
    return true;
  }

  async checkAndExpireOrders(): Promise<string[]> {
    const now = new Date();
    const expiredOrderIds: string[] = [];

    for (const [orderId, order] of this.orders.entries()) {
      if (order.status === 'active' && 
          order.deadline && 
          order.deadline <= now && 
          order.settings.autoCloseOnDeadline) {
        
        await this.expireOrder(orderId);
        expiredOrderIds.push(orderId);
      }
    }

    if (expiredOrderIds.length > 0) {
      console.log(`Expired ${expiredOrderIds.length} orders:`, expiredOrderIds);
    }

    return expiredOrderIds;
  }

  async joinOrder(request: JoinOrderRequest): Promise<OrderValidationResult> {
    const validation = await this.validateOrderCode(request.orderCode);
    if (!validation.isValid || !validation.order) {
      return validation;
    }

    const order = validation.order;

    // 如果有參與者服務，使用它進行身份驗證
    if (this.participantService) {
      const identityValidation = await this.participantService.validateParticipantIdentity(request);
      if (!identityValidation.isValid || !identityValidation.canJoin) {
        return {
          isValid: false,
          canJoin: false,
          error: identityValidation.error || 'Cannot join order'
        };
      }

      // 檢查是否可以加入此訂單
      if (identityValidation.identity) {
        const canJoin = await this.participantService.canParticipantJoinOrder(identityValidation.identity.id, order);
        if (!canJoin) {
          return {
            isValid: false,
            canJoin: false,
            error: 'Cannot join this order'
          };
        }
      }
    }

    // 檢查是否已經參與（備用檢查）
    const existingParticipant = order.participants.find(p => 
      (request.userId && p.userId === request.userId) ||
      (request.guestSessionId && p.guestSessionId === request.guestSessionId) ||
      p.nickname === request.nickname
    );

    if (existingParticipant) {
      return {
        isValid: false,
        canJoin: false,
        error: 'Already joined this order or nickname already taken'
      };
    }

    // 檢查參與人數限制
    if (order.settings.maxParticipants && 
        order.participants.length >= order.settings.maxParticipants) {
      return {
        isValid: false,
        canJoin: false,
        error: 'Order has reached maximum participants'
      };
    }

    // 創建新參與者
    const participantId = this.generateId();
    const now = new Date();
    
    const participant: OrderParticipant = {
      id: participantId,
      userId: request.userId,
      guestSessionId: request.guestSessionId,
      nickname: request.nickname,
      items: [],
      totalAmount: 0,
      joinedAt: now,
      lastModifiedAt: now
    };

    // 加入訂單
    const updatedOrder: GroupOrder = {
      ...order,
      participants: [...order.participants, participant],
      updatedAt: now
    };

    this.orders.set(order.id, updatedOrder);

    // 重新計算摘要
    await this.calculateOrderSummary(order.id);

    // 記錄參與者加入的修改歷史
    await this.modificationService.recordModification({
      orderId: order.id,
      participantId,
      participantNickname: request.nickname,
      type: 'participant_joined',
      description: `${request.nickname} joined the order`,
      newValue: participant
    });

    // 更新參與者活動時間
    if (this.participantService) {
      await this.participantService.updateParticipantActivity(participantId);
    }

    console.log(`Participant ${request.nickname} joined order ${order.id}`);
    
    // 廣播參與者加入事件
    this.broadcastOrderEvent(order.id, 'participant_joined', {
      participant: this.sanitizeParticipantForBroadcast(participant),
      order: this.sanitizeOrderForBroadcast(updatedOrder)
    });
    
    return {
      isValid: true,
      canJoin: true,
      order: updatedOrder
    };
  }

  async leaveOrder(orderId: string, participantId: string): Promise<boolean> {
    const order = this.orders.get(orderId);
    if (!order) {
      return false;
    }

    const participantIndex = order.participants.findIndex(p => p.id === participantId);
    if (participantIndex === -1) {
      return false;
    }

    // 移除參與者
    const updatedParticipants = [...order.participants];
    const removedParticipant = updatedParticipants.splice(participantIndex, 1)[0];

    const updatedOrder: GroupOrder = {
      ...order,
      participants: updatedParticipants,
      updatedAt: new Date()
    };

    this.orders.set(orderId, updatedOrder);

    // 重新計算摘要
    await this.calculateOrderSummary(orderId);

    // 記錄參與者離開的修改歷史
    await this.modificationService.recordModification({
      orderId,
      participantId,
      participantNickname: removedParticipant.nickname,
      type: 'participant_left',
      description: `${removedParticipant.nickname} left the order`,
      oldValue: removedParticipant
    });

    console.log(`Participant ${participantId} left order ${orderId}`);
    
    // 廣播參與者離開事件
    this.broadcastOrderEvent(orderId, 'participant_left', {
      participant: this.sanitizeParticipantForBroadcast(removedParticipant),
      order: this.sanitizeOrderForBroadcast(updatedOrder)
    });
    
    return true;
  }

  async getOrderParticipants(orderId: string): Promise<OrderParticipant[]> {
    const order = this.orders.get(orderId);
    return order ? order.participants : [];
  }

  async addOrderItem(orderId: string, participantId: string, request: AddOrderItemRequest): Promise<OrderItem | null> {
    const order = this.orders.get(orderId);
    if (!order || order.status !== 'active') {
      return null;
    }

    // 檢查是否允許修改
    if (!order.settings.allowModification) {
      return null;
    }

    // 找到參與者
    const participantIndex = order.participants.findIndex(p => p.id === participantId);
    if (participantIndex === -1) {
      return null;
    }

    // 驗證菜單項目
    const menu = await this.menuService.getMenuById(order.menuId);
    if (!menu) {
      return null;
    }

    const menuItem = menu.items.find(item => item.id === request.menuItemId);
    if (!menuItem || !menuItem.isAvailable) {
      return null;
    }

    // 計算總價格
    let totalPrice = menuItem.price * request.quantity;
    
    if (request.customizations) {
      for (const customization of request.customizations) {
        totalPrice += customization.priceModifier * request.quantity;
      }
    }

    // 創建訂單項目
    const orderItem: OrderItem = {
      id: this.generateId(),
      menuItemId: request.menuItemId,
      menuItemName: menuItem.name,
      basePrice: menuItem.price,
      quantity: request.quantity,
      customizations: request.customizations || [],
      totalPrice,
      notes: request.notes
    };

    // 更新參與者
    const participant = order.participants[participantIndex];
    const updatedParticipant: OrderParticipant = {
      ...participant,
      items: [...participant.items, orderItem],
      totalAmount: participant.totalAmount + totalPrice,
      lastModifiedAt: new Date()
    };

    // 更新訂單
    const updatedParticipants = [...order.participants];
    updatedParticipants[participantIndex] = updatedParticipant;

    const updatedOrder: GroupOrder = {
      ...order,
      participants: updatedParticipants,
      updatedAt: new Date()
    };

    this.orders.set(orderId, updatedOrder);

    // 重新計算摘要
    await this.calculateOrderSummary(orderId);

    console.log(`Order item added to order ${orderId} by participant ${participantId}`);
    
    // 廣播訂單項目新增事件
    this.broadcastOrderEvent(orderId, 'item_added', {
      participantId,
      item: orderItem,
      order: this.sanitizeOrderForBroadcast(updatedOrder)
    });
    
    return orderItem;
  }

  async updateOrderItem(orderId: string, participantId: string, itemId: string, request: UpdateOrderItemRequest): Promise<OrderItem | null> {
    const order = this.orders.get(orderId);
    if (!order || order.status !== 'active') {
      return null;
    }

    if (!order.settings.allowModification) {
      return null;
    }

    const participantIndex = order.participants.findIndex(p => p.id === participantId);
    if (participantIndex === -1) {
      return null;
    }

    const participant = order.participants[participantIndex];
    const itemIndex = participant.items.findIndex(item => item.id === itemId);
    if (itemIndex === -1) {
      return null;
    }

    const existingItem = participant.items[itemIndex];
    
    // 計算新的總價格
    const quantity = request.quantity !== undefined ? request.quantity : existingItem.quantity;
    let totalPrice = existingItem.basePrice * quantity;
    
    const customizations = request.customizations !== undefined ? request.customizations : existingItem.customizations;
    for (const customization of customizations) {
      totalPrice += customization.priceModifier * quantity;
    }

    // 更新項目
    const updatedItem: OrderItem = {
      ...existingItem,
      quantity,
      customizations,
      totalPrice,
      notes: request.notes !== undefined ? request.notes : existingItem.notes
    };

    // 重新計算參與者總金額
    const updatedItems = [...participant.items];
    updatedItems[itemIndex] = updatedItem;
    
    const newTotalAmount = updatedItems.reduce((sum, item) => sum + item.totalPrice, 0);

    const updatedParticipant: OrderParticipant = {
      ...participant,
      items: updatedItems,
      totalAmount: newTotalAmount,
      lastModifiedAt: new Date()
    };

    // 更新訂單
    const updatedParticipants = [...order.participants];
    updatedParticipants[participantIndex] = updatedParticipant;

    const updatedOrder: GroupOrder = {
      ...order,
      participants: updatedParticipants,
      updatedAt: new Date()
    };

    this.orders.set(orderId, updatedOrder);

    // 重新計算摘要
    await this.calculateOrderSummary(orderId);

    // 廣播訂單項目更新事件
    this.broadcastOrderEvent(orderId, 'item_updated', {
      participantId,
      item: updatedItem,
      oldItem: existingItem,
      order: this.sanitizeOrderForBroadcast(updatedOrder)
    });

    return updatedItem;
  }

  async removeOrderItem(orderId: string, participantId: string, itemId: string): Promise<boolean> {
    const order = this.orders.get(orderId);
    if (!order || order.status !== 'active') {
      return false;
    }

    if (!order.settings.allowModification) {
      return false;
    }

    const participantIndex = order.participants.findIndex(p => p.id === participantId);
    if (participantIndex === -1) {
      return false;
    }

    const participant = order.participants[participantIndex];
    const itemIndex = participant.items.findIndex(item => item.id === itemId);
    if (itemIndex === -1) {
      return false;
    }

    // 移除項目
    const updatedItems = [...participant.items];
    const removedItem = updatedItems.splice(itemIndex, 1)[0];
    
    const newTotalAmount = updatedItems.reduce((sum, item) => sum + item.totalPrice, 0);

    const updatedParticipant: OrderParticipant = {
      ...participant,
      items: updatedItems,
      totalAmount: newTotalAmount,
      lastModifiedAt: new Date()
    };

    // 更新訂單
    const updatedParticipants = [...order.participants];
    updatedParticipants[participantIndex] = updatedParticipant;

    const updatedOrder: GroupOrder = {
      ...order,
      participants: updatedParticipants,
      updatedAt: new Date()
    };

    this.orders.set(orderId, updatedOrder);

    // 重新計算摘要
    await this.calculateOrderSummary(orderId);

    console.log(`Order item ${itemId} removed from order ${orderId}`);
    
    // 廣播訂單項目移除事件
    this.broadcastOrderEvent(orderId, 'item_removed', {
      participantId,
      removedItem,
      order: this.sanitizeOrderForBroadcast(updatedOrder)
    });
    
    return true;
  }

  async searchOrders(query: OrderSearchQuery, page: number = 1, limit: number = 10): Promise<OrderSearchResult> {
    const allOrders = Array.from(this.orders.values());
    
    let filteredOrders = allOrders.filter(order => {
      // 創建者篩選
      if (query.createdBy && order.createdBy !== query.createdBy) {
        return false;
      }

      // 狀態篩選
      if (query.status && order.status !== query.status) {
        return false;
      }

      // 菜單篩選
      if (query.menuId && order.menuId !== query.menuId) {
        return false;
      }

      // 參與者篩選
      if (query.participantId) {
        const hasParticipant = order.participants.some(p => 
          p.id === query.participantId || 
          p.userId === query.participantId ||
          p.guestSessionId === query.participantId
        );
        if (!hasParticipant) return false;
      }

      // 關鍵字搜尋
      if (query.keyword) {
        const keyword = query.keyword.toLowerCase();
        const matchesTitle = order.title.toLowerCase().includes(keyword);
        const matchesDescription = order.description?.toLowerCase().includes(keyword);
        const matchesCode = order.orderCode.toLowerCase().includes(keyword);
        
        if (!matchesTitle && !matchesDescription && !matchesCode) {
          return false;
        }
      }

      // 日期範圍篩選
      if (query.dateRange) {
        const orderDate = order.createdAt;
        if (orderDate < query.dateRange.start || orderDate > query.dateRange.end) {
          return false;
        }
      }

      return true;
    });

    // 排序：最新的在前面
    filteredOrders.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    // 分頁
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedOrders = filteredOrders.slice(startIndex, endIndex);

    return {
      orders: paginatedOrders,
      total: filteredOrders.length,
      page,
      limit
    };
  }

  async getUserOrders(userId: string, page: number = 1, limit: number = 10): Promise<OrderSearchResult> {
    return this.searchOrders({ createdBy: userId }, page, limit);
  }

  async getParticipantOrders(participantId: string, page: number = 1, limit: number = 10): Promise<OrderSearchResult> {
    return this.searchOrders({ participantId }, page, limit);
  }

  async calculateOrderSummary(orderId: string): Promise<OrderSummary | null> {
    const order = this.orders.get(orderId);
    if (!order) {
      return null;
    }

    const now = new Date();
    let totalItems = 0;
    let totalAmount = 0;
    const itemBreakdownMap = new Map<string, OrderItemBreakdown>();

    // 統計所有參與者的項目
    for (const participant of order.participants) {
      totalAmount += participant.totalAmount;
      
      for (const item of participant.items) {
        totalItems += item.quantity;
        
        const key = item.menuItemId;
        const existing = itemBreakdownMap.get(key);
        
        if (existing) {
          existing.totalQuantity += item.quantity;
          existing.totalAmount += item.totalPrice;
          existing.participants.push(participant.nickname);
        } else {
          itemBreakdownMap.set(key, {
            menuItemId: item.menuItemId,
            menuItemName: item.menuItemName,
            totalQuantity: item.quantity,
            totalAmount: item.totalPrice,
            participants: [participant.nickname]
          });
        }
      }
    }

    const summary: OrderSummary = {
      totalParticipants: order.participants.length,
      totalItems,
      totalAmount,
      itemBreakdown: Array.from(itemBreakdownMap.values()),
      lastUpdated: now
    };

    // 更新訂單中的摘要
    const updatedOrder: GroupOrder = {
      ...order,
      summary,
      updatedAt: now
    };

    this.orders.set(orderId, updatedOrder);
    return summary;
  }

  async getOrderStatistics(userId?: string): Promise<OrderStatistics> {
    const allOrders = Array.from(this.orders.values());
    const filteredOrders = userId ? 
      allOrders.filter(order => order.createdBy === userId) : 
      allOrders;

    const totalOrders = filteredOrders.length;
    const activeOrders = filteredOrders.filter(o => o.status === 'active').length;
    const closedOrders = filteredOrders.filter(o => o.status === 'closed').length;
    const expiredOrders = filteredOrders.filter(o => o.status === 'expired').length;

    let totalParticipants = 0;
    let totalAmount = 0;
    const menuItemStats = new Map<string, PopularMenuItem>();

    for (const order of filteredOrders) {
      totalParticipants += order.participants.length;
      totalAmount += order.summary.totalAmount;

      // 統計熱門菜單項目
      for (const breakdown of order.summary.itemBreakdown) {
        const existing = menuItemStats.get(breakdown.menuItemId);
        if (existing) {
          existing.orderCount += 1;
          existing.totalQuantity += breakdown.totalQuantity;
          existing.totalRevenue += breakdown.totalAmount;
        } else {
          menuItemStats.set(breakdown.menuItemId, {
            menuItemId: breakdown.menuItemId,
            menuItemName: breakdown.menuItemName,
            orderCount: 1,
            totalQuantity: breakdown.totalQuantity,
            totalRevenue: breakdown.totalAmount
          });
        }
      }
    }

    // 排序熱門項目
    const popularMenuItems = Array.from(menuItemStats.values())
      .sort((a, b) => b.orderCount - a.orderCount)
      .slice(0, 10); // 取前10名

    const averageOrderSize = totalOrders > 0 ? totalAmount / totalOrders : 0;

    return {
      totalOrders,
      activeOrders,
      closedOrders,
      expiredOrders,
      totalParticipants,
      totalAmount,
      averageOrderSize,
      popularMenuItems
    };
  }

  async canUserModifyOrder(orderId: string, userId: string): Promise<boolean> {
    const order = this.orders.get(orderId);
    return order ? order.createdBy === userId && order.status === 'active' : false;
  }

  async canParticipantModifyItems(orderId: string, participantId: string): Promise<boolean> {
    const order = this.orders.get(orderId);
    if (!order || order.status !== 'active' || !order.settings.allowModification) {
      return false;
    }

    return order.participants.some(p => p.id === participantId);
  }

  async validateOrderCode(orderCode: string): Promise<OrderValidationResult> {
    const orderId = this.orderCodeIndex.get(orderCode);
    if (!orderId) {
      return {
        isValid: false,
        canJoin: false,
        error: 'Invalid order code'
      };
    }

    const order = this.orders.get(orderId);
    if (!order) {
      return {
        isValid: false,
        canJoin: false,
        error: 'Order not found'
      };
    }

    if (order.status !== 'active') {
      return {
        isValid: true,
        canJoin: false,
        error: `Order is ${order.status}`,
        order
      };
    }

    // 檢查是否已過截止時間
    if (order.deadline && order.deadline <= new Date()) {
      return {
        isValid: true,
        canJoin: false,
        error: 'Order deadline has passed',
        order
      };
    }

    return {
      isValid: true,
      canJoin: true,
      order
    };
  }

  // 新增的訂單管理功能實作

  async searchOrderItems(orderId: string, keyword?: string): Promise<OrderItem[]> {
    const order = this.orders.get(orderId);
    if (!order) {
      return [];
    }

    let allItems: OrderItem[] = [];
    
    // 收集所有參與者的訂單項目
    for (const participant of order.participants) {
      allItems = allItems.concat(participant.items);
    }

    // 如果有關鍵字，進行篩選
    if (keyword) {
      const lowerKeyword = keyword.toLowerCase();
      allItems = allItems.filter(item => 
        item.menuItemName.toLowerCase().includes(lowerKeyword) ||
        item.notes?.toLowerCase().includes(lowerKeyword)
      );
    }

    return allItems;
  }

  async advancedSearchOrders(query: AdvancedOrderSearchQuery, page: number = 1, limit: number = 10): Promise<OrderSearchResult> {
    const allOrders = Array.from(this.orders.values());
    
    let filteredOrders = allOrders.filter(order => {
      // 基本篩選（重用現有邏輯）
      if (query.createdBy && order.createdBy !== query.createdBy) return false;
      if (query.status && order.status !== query.status) return false;
      if (query.menuId && order.menuId !== query.menuId) return false;
      
      // 高級篩選
      if (query.minAmount !== undefined && order.summary.totalAmount < query.minAmount) return false;
      if (query.maxAmount !== undefined && order.summary.totalAmount > query.maxAmount) return false;
      if (query.minParticipants !== undefined && order.participants.length < query.minParticipants) return false;
      if (query.maxParticipants !== undefined && order.participants.length > query.maxParticipants) return false;
      if (query.hasDeadline !== undefined && (!!order.deadline) !== query.hasDeadline) return false;
      if (query.isExpired !== undefined && (order.status === 'expired') !== query.isExpired) return false;

      // 日期範圍篩選
      if (query.dateRange) {
        const orderDate = order.createdAt;
        if (orderDate < query.dateRange.start || orderDate > query.dateRange.end) return false;
      }

      // 關鍵字搜尋
      if (query.keyword) {
        const keyword = query.keyword.toLowerCase();
        const matchesTitle = order.title.toLowerCase().includes(keyword);
        const matchesDescription = order.description?.toLowerCase().includes(keyword);
        const matchesCode = order.orderCode.toLowerCase().includes(keyword);
        
        if (!matchesTitle && !matchesDescription && !matchesCode) return false;
      }

      return true;
    });

    // 排序
    const sortBy = query.sortBy || 'updatedAt';
    const sortOrder = query.sortOrder || 'desc';
    
    filteredOrders.sort((a, b) => {
      let aValue: any, bValue: any;
      
      switch (sortBy) {
        case 'createdAt':
          aValue = a.createdAt.getTime();
          bValue = b.createdAt.getTime();
          break;
        case 'updatedAt':
          aValue = a.updatedAt.getTime();
          bValue = b.updatedAt.getTime();
          break;
        case 'deadline':
          aValue = a.deadline?.getTime() || 0;
          bValue = b.deadline?.getTime() || 0;
          break;
        case 'totalAmount':
          aValue = a.summary.totalAmount;
          bValue = b.summary.totalAmount;
          break;
        case 'participantCount':
          aValue = a.participants.length;
          bValue = b.participants.length;
          break;
        default:
          aValue = a.updatedAt.getTime();
          bValue = b.updatedAt.getTime();
      }

      if (sortOrder === 'asc') {
        return aValue - bValue;
      } else {
        return bValue - aValue;
      }
    });

    // 分頁
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedOrders = filteredOrders.slice(startIndex, endIndex);

    return {
      orders: paginatedOrders,
      total: filteredOrders.length,
      page,
      limit
    };
  }

  async bulkCloseOrders(orderIds: string[], userId: string): Promise<{ success: string[]; failed: string[] }> {
    const success: string[] = [];
    const failed: string[] = [];

    for (const orderId of orderIds) {
      try {
        const result = await this.closeOrder(orderId, userId);
        if (result) {
          success.push(orderId);
        } else {
          failed.push(orderId);
        }
      } catch (error) {
        console.error(`Error closing order ${orderId}:`, error);
        failed.push(orderId);
      }
    }

    console.log(`Bulk close orders - Success: ${success.length}, Failed: ${failed.length}`);
    return { success, failed };
  }

  async getOrdersByStatus(status: OrderStatus, page: number = 1, limit: number = 10): Promise<OrderSearchResult> {
    return this.searchOrders({ status }, page, limit);
  }

  async getOrdersByDateRange(startDate: Date, endDate: Date, page: number = 1, limit: number = 10): Promise<OrderSearchResult> {
    return this.searchOrders({ dateRange: { start: startDate, end: endDate } }, page, limit);
  }

  async generateOrderReport(orderId: string): Promise<OrderReport | null> {
    const order = this.orders.get(orderId);
    if (!order) {
      return null;
    }

    // 生成參與者詳細報告
    const participantDetails: ParticipantReport[] = order.participants.map(participant => {
      const totalItems = participant.items.reduce((sum, item) => sum + item.quantity, 0);
      const averageItemPrice = totalItems > 0 ? participant.totalAmount / totalItems : 0;

      return {
        participant,
        itemSummary: {
          totalItems,
          totalAmount: participant.totalAmount,
          averageItemPrice
        },
        orderHistory: [...participant.items]
      };
    });

    // 生成時間軸事件（簡化版本，實際應用中可以記錄更詳細的事件）
    const timeline: OrderTimelineEvent[] = [
      {
        timestamp: order.createdAt,
        type: 'created',
        description: `訂單 "${order.title}" 已建立`
      }
    ];

    // 添加參與者加入事件
    order.participants.forEach(participant => {
      timeline.push({
        timestamp: participant.joinedAt,
        type: 'participant_joined',
        description: `${participant.nickname} 加入訂單`,
        participantId: participant.id,
        participantName: participant.nickname
      });
    });

    // 如果訂單已關閉，添加關閉事件
    if (order.closedAt) {
      timeline.push({
        timestamp: order.closedAt,
        type: order.status === 'expired' ? 'expired' : 'closed',
        description: order.status === 'expired' ? '訂單已過期' : '訂單已手動關閉'
      });
    }

    // 按時間排序
    timeline.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // 生成財務分析
    const topSpendingParticipants = participantDetails
      .sort((a, b) => b.participant.totalAmount - a.participant.totalAmount)
      .slice(0, 5)
      .map(detail => ({
        participantId: detail.participant.id,
        participantName: detail.participant.nickname,
        totalSpent: detail.participant.totalAmount
      }));

    // 按類別分析收入（簡化版本）
    const categoryMap = new Map<string, number>();
    order.participants.forEach(participant => {
      participant.items.forEach(item => {
        const category = '一般餐點'; // 實際應用中應該從菜單項目獲取類別
        categoryMap.set(category, (categoryMap.get(category) || 0) + item.totalPrice);
      });
    });

    const totalRevenue = order.summary.totalAmount;
    const revenueByCategory = Array.from(categoryMap.entries()).map(([category, amount]) => ({
      category,
      amount,
      percentage: totalRevenue > 0 ? (amount / totalRevenue) * 100 : 0
    }));

    const financialBreakdown: FinancialBreakdown = {
      totalRevenue,
      averageOrderValue: order.participants.length > 0 ? totalRevenue / order.participants.length : 0,
      topSpendingParticipants,
      revenueByCategory
    };

    return {
      order,
      summary: order.summary,
      participantDetails,
      timeline,
      financialBreakdown
    };
  }

  async getOrderAnalytics(userId?: string, dateRange?: { start: Date; end: Date }): Promise<OrderAnalytics> {
    const allOrders = Array.from(this.orders.values());
    let filteredOrders = userId ? 
      allOrders.filter(order => order.createdBy === userId) : 
      allOrders;

    // 日期範圍篩選
    if (dateRange) {
      filteredOrders = filteredOrders.filter(order => 
        order.createdAt >= dateRange.start && order.createdAt <= dateRange.end
      );
    }

    // 基本概覽
    const totalOrders = filteredOrders.length;
    const totalRevenue = filteredOrders.reduce((sum, order) => sum + order.summary.totalAmount, 0);
    const totalParticipants = filteredOrders.reduce((sum, order) => sum + order.participants.length, 0);
    
    const overview = {
      totalOrders,
      totalRevenue,
      averageOrderSize: totalOrders > 0 ? totalRevenue / totalOrders : 0,
      averageParticipantsPerOrder: totalOrders > 0 ? totalParticipants / totalOrders : 0
    };

    // 趨勢分析（按日期分組）
    const dateMap = new Map<string, { orders: number; revenue: number; participants: number }>();
    
    filteredOrders.forEach(order => {
      const dateKey = order.createdAt.toISOString().split('T')[0];
      const existing = dateMap.get(dateKey) || { orders: 0, revenue: 0, participants: 0 };
      
      existing.orders += 1;
      existing.revenue += order.summary.totalAmount;
      existing.participants += order.participants.length;
      
      dateMap.set(dateKey, existing);
    });

    const ordersOverTime: TimeSeriesData[] = [];
    const revenueOverTime: TimeSeriesData[] = [];
    const participantsOverTime: TimeSeriesData[] = [];

    Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([date, data]) => {
        ordersOverTime.push({ date, value: data.orders });
        revenueOverTime.push({ date, value: data.revenue });
        participantsOverTime.push({ date, value: data.participants });
      });

    // 性能分析
    const completedOrders = filteredOrders.filter(order => order.status === 'closed');
    const completionRate = totalOrders > 0 ? (completedOrders.length / totalOrders) * 100 : 0;
    
    // 計算平均訂單持續時間
    const orderDurations = completedOrders
      .filter(order => order.closedAt)
      .map(order => {
        const duration = order.closedAt!.getTime() - order.createdAt.getTime();
        return duration / (1000 * 60 * 60); // 轉換為小時
      });
    
    const averageOrderDuration = orderDurations.length > 0 ? 
      orderDurations.reduce((sum, duration) => sum + duration, 0) / orderDurations.length : 0;

    // 按小時統計訂單創建時間
    const hourlyStats: HourlyStats[] = [];
    for (let hour = 0; hour < 24; hour++) {
      const ordersInHour = filteredOrders.filter(order => order.createdAt.getHours() === hour);
      const orderCount = ordersInHour.length;
      const averageOrderSize = orderCount > 0 ? 
        ordersInHour.reduce((sum, order) => sum + order.summary.totalAmount, 0) / orderCount : 0;
      
      hourlyStats.push({ hour, orderCount, averageOrderSize });
    }

    // 熱門項目分析
    const itemStats = new Map<string, PopularMenuItem>();
    filteredOrders.forEach(order => {
      order.summary.itemBreakdown.forEach(breakdown => {
        const existing = itemStats.get(breakdown.menuItemId);
        if (existing) {
          existing.orderCount += 1;
          existing.totalQuantity += breakdown.totalQuantity;
          existing.totalRevenue += breakdown.totalAmount;
        } else {
          itemStats.set(breakdown.menuItemId, {
            menuItemId: breakdown.menuItemId,
            menuItemName: breakdown.menuItemName,
            orderCount: 1,
            totalQuantity: breakdown.totalQuantity,
            totalRevenue: breakdown.totalAmount
          });
        }
      });
    });

    const mostPopularItems = Array.from(itemStats.values())
      .sort((a, b) => b.orderCount - a.orderCount)
      .slice(0, 10);

    // 餐廳統計（需要從菜單服務獲取餐廳資訊）
    const topPerformingRestaurants: RestaurantStats[] = []; // 簡化實作

    // 參與者行為分析
    const allParticipants = filteredOrders.flatMap(order => order.participants);
    const totalItems = allParticipants.reduce((sum, p) => sum + p.items.length, 0);
    const totalSpending = allParticipants.reduce((sum, p) => sum + p.totalAmount, 0);
    
    const participantBehavior: ParticipantBehaviorStats = {
      averageItemsPerParticipant: allParticipants.length > 0 ? totalItems / allParticipants.length : 0,
      averageSpendingPerParticipant: allParticipants.length > 0 ? totalSpending / allParticipants.length : 0,
      repeatParticipantRate: 0, // 需要更複雜的邏輯來計算
      mostActiveParticipants: [] // 簡化實作
    };

    return {
      overview,
      trends: {
        ordersOverTime,
        revenueOverTime,
        participantsOverTime
      },
      performance: {
        completionRate,
        averageOrderDuration,
        peakOrderTimes: hourlyStats.filter(stat => stat.orderCount > 0)
          .sort((a, b) => b.orderCount - a.orderCount)
          .slice(0, 5)
      },
      insights: {
        mostPopularItems,
        topPerformingRestaurants,
        participantBehavior
      }
    };
  }

  // 權限檢查
  async canUserModifyOrder(orderId: string, userId: string): Promise<boolean> {
    const order = this.orders.get(orderId);
    return order ? order.createdBy === userId && order.status === 'active' : false;
  }

  async canParticipantModifyItems(orderId: string, participantId: string): Promise<boolean> {
    const order = this.orders.get(orderId);
    if (!order || order.status !== 'active' || !order.settings.allowModification) {
      return false;
    }

    return order.participants.some(p => p.id === participantId);
  }

  // 增強的修改功能實作
  async checkParticipantModificationPermission(orderId: string, participantId: string): Promise<ModificationPermissionCheck> {
    return await this.modificationService.checkModificationPermission(orderId, participantId);
  }

  async addOrderItemWithHistory(orderId: string, participantId: string, request: AddOrderItemRequest): Promise<OrderItem | null> {
    // 檢查修改權限
    const permission = await this.checkParticipantModificationPermission(orderId, participantId);
    if (!permission.canModify) {
      throw new Error(permission.reason || 'Cannot modify order');
    }

    // 執行原有的添加邏輯
    const item = await this.addOrderItem(orderId, participantId, request);
    
    if (item) {
      // 記錄修改歷史
      const order = this.orders.get(orderId);
      const participant = order?.participants.find(p => p.id === participantId);
      
      if (participant) {
        await this.modificationService.recordModification({
          orderId,
          participantId,
          participantNickname: participant.nickname,
          type: 'item_added',
          description: `Added ${item.quantity}x ${item.menuItemName}`,
          newValue: item,
          itemDetails: {
            itemId: item.id,
            itemName: item.menuItemName,
            quantity: item.quantity,
            price: item.totalPrice
          }
        });
      }
    }

    return item;
  }

  async updateOrderItemWithHistory(orderId: string, participantId: string, itemId: string, request: UpdateOrderItemRequest): Promise<OrderItem | null> {
    // 檢查修改權限
    const permission = await this.checkParticipantModificationPermission(orderId, participantId);
    if (!permission.canModify) {
      throw new Error(permission.reason || 'Cannot modify order');
    }

    // 獲取原有項目資訊
    const order = this.orders.get(orderId);
    const participant = order?.participants.find(p => p.id === participantId);
    const oldItem = participant?.items.find(item => item.id === itemId);

    // 執行原有的更新邏輯
    const updatedItem = await this.updateOrderItem(orderId, participantId, itemId, request);
    
    if (updatedItem && oldItem && participant) {
      // 記錄修改歷史
      await this.modificationService.recordModification({
        orderId,
        participantId,
        participantNickname: participant.nickname,
        type: 'item_updated',
        description: `Updated ${updatedItem.menuItemName}: ${oldItem.quantity} → ${updatedItem.quantity}`,
        oldValue: oldItem,
        newValue: updatedItem,
        itemDetails: {
          itemId: updatedItem.id,
          itemName: updatedItem.menuItemName,
          quantity: updatedItem.quantity,
          price: updatedItem.totalPrice
        }
      });
    }

    return updatedItem;
  }

  async removeOrderItemWithHistory(orderId: string, participantId: string, itemId: string): Promise<boolean> {
    // 檢查修改權限
    const permission = await this.checkParticipantModificationPermission(orderId, participantId);
    if (!permission.canModify) {
      throw new Error(permission.reason || 'Cannot modify order');
    }

    // 獲取要刪除的項目資訊
    const order = this.orders.get(orderId);
    const participant = order?.participants.find(p => p.id === participantId);
    const itemToRemove = participant?.items.find(item => item.id === itemId);

    // 執行原有的刪除邏輯
    const success = await this.removeOrderItem(orderId, participantId, itemId);
    
    if (success && itemToRemove && participant) {
      // 記錄修改歷史
      await this.modificationService.recordModification({
        orderId,
        participantId,
        participantNickname: participant.nickname,
        type: 'item_removed',
        description: `Removed ${itemToRemove.quantity}x ${itemToRemove.menuItemName}`,
        oldValue: itemToRemove,
        itemDetails: {
          itemId: itemToRemove.id,
          itemName: itemToRemove.menuItemName,
          quantity: itemToRemove.quantity,
          price: itemToRemove.totalPrice
        }
      });
    }

    return success;
  }

  async getOrderModificationHistory(orderId: string): Promise<OrderModification[]> {
    return await this.modificationService.getOrderModificationHistory(orderId);
  }

  async getParticipantModificationHistory(participantId: string): Promise<OrderModification[]> {
    return await this.modificationService.getParticipantModificationHistory(participantId);
  }

  async getOrderTotals(orderId: string): Promise<OrderTotals | null> {
    const order = this.orders.get(orderId);
    if (!order) {
      return null;
    }

    return await this.modificationService.calculateOrderTotals(order);
  }

  async getParticipantTotals(orderId: string, participantId: string): Promise<ParticipantTotals | null> {
    const order = this.orders.get(orderId);
    if (!order) {
      return null;
    }

    const participant = order.participants.find(p => p.id === participantId);
    if (!participant) {
      return null;
    }

    return await this.modificationService.calculateParticipantTotals(participant);
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
  }

  private generateOrderCode(): string {
    // 生成6位數字的訂單代碼
    let code: string;
    do {
      code = Math.floor(100000 + Math.random() * 900000).toString();
    } while (this.orderCodeIndex.has(code)); // 確保唯一性
    
    return code;
  }

  private startExpirationChecker(): void {
    // 每分鐘檢查一次過期訂單
    setInterval(async () => {
      try {
        await this.checkAndExpireOrders();
      } catch (error) {
        console.error('Error checking expired orders:', error);
      }
    }, 60000); // 60秒
  }

  // 群族訂單分享功能實作 (Task 10.2)

  async shareOrderToGroup(orderId: string, groupId: string, userId: string, message?: string): Promise<boolean> {
    const order = this.orders.get(orderId);
    if (!order) {
      return false;
    }

    // 檢查用戶是否有權限分享此訂單
    const canModify = await this.canUserModifyOrder(orderId, userId);
    if (!canModify) {
      return false;
    }

    // 使用訊息服務分享訂單到群族
    if (this.messageService) {
      const result = await this.messageService.shareOrderToGroup(userId, {
        groupId,
        orderId,
        message
      });
      
      return result.success;
    }

    return false;
  }

  async notifyGroupOrderUpdate(orderId: string, updateType: string, updateData: any): Promise<void> {
    const order = this.orders.get(orderId);
    if (!order || !this.messageService) {
      return;
    }

    // 這裡需要知道訂單關聯的群族
    // 簡化實現：假設訂單有關聯的群族ID
    // 實際實現中可能需要維護訂單-群族關聯表
    
    // 發送系統訊息通知訂單更新
    let eventType: any = 'order_updated';
    let eventData = {
      orderId,
      orderTitle: order.title,
      orderCode: order.orderCode,
      updateType,
      ...updateData
    };

    switch (updateType) {
      case 'closed':
        eventType = 'order_closed';
        break;
      case 'expired':
        eventType = 'order_expired';
        break;
      case 'participant_joined':
        eventType = 'order_updated';
        eventData.description = `${updateData.participantName} 加入了訂單`;
        break;
      case 'item_added':
        eventType = 'order_updated';
        eventData.description = `${updateData.participantName} 新增了訂單項目`;
        break;
    }

    // 注意：這裡需要群族ID，實際實現中需要維護訂單與群族的關聯
    // 暫時跳過群族通知，因為沒有群族關聯資訊
    console.log(`Order update notification: ${updateType} for order ${orderId}`);
  }

  // WebSocket 即時更新方法

  /**
   * 廣播訂單事件到所有參與者
   */
  private broadcastOrderEvent(orderId: string, eventType: string, data: any): void {
    if (!this.webSocketService) {
      return;
    }

    // 廣播到訂單房間
    this.webSocketService.broadcastOrderUpdate(orderId, {
      eventType,
      ...data,
      timestamp: new Date().toISOString()
    });

    console.log(`Broadcasted ${eventType} event for order ${orderId}`);
  }

  /**
   * 廣播參與者更新事件
   */
  private broadcastParticipantEvent(orderId: string, participantData: any, action: 'joined' | 'left'): void {
    if (!this.webSocketService) {
      return;
    }

    this.webSocketService.broadcastParticipantUpdate(orderId, participantData, action);
    console.log(`Broadcasted participant ${action} event for order ${orderId}`);
  }

  /**
   * 清理訂單資料以供廣播（移除敏感資訊）
   */
  private sanitizeOrderForBroadcast(order: GroupOrder): any {
    return {
      id: order.id,
      orderCode: order.orderCode,
      title: order.title,
      description: order.description,
      status: order.status,
      deadline: order.deadline,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      closedAt: order.closedAt,
      summary: order.summary,
      settings: {
        allowModification: order.settings.allowModification,
        maxParticipants: order.settings.maxParticipants,
        autoCloseOnDeadline: order.settings.autoCloseOnDeadline
      },
      participantCount: order.participants.length
    };
  }

  /**
   * 清理參與者資料以供廣播（移除敏感資訊）
   */
  private sanitizeParticipantForBroadcast(participant: OrderParticipant): any {
    return {
      id: participant.id,
      nickname: participant.nickname,
      totalAmount: participant.totalAmount,
      itemCount: participant.items.length,
      joinedAt: participant.joinedAt,
      lastModifiedAt: participant.lastModifiedAt
    };
  }

  /**
   * 設定 WebSocket 服務引用
   */
  setWebSocketService(webSocketService: WebSocketService): void {
    this.webSocketService = webSocketService;
  }
}