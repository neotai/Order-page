import { GroupOrder, OrderParticipant, OrderItem } from '../types/order';

export interface OrderModification {
  id: string;
  orderId: string;
  participantId: string;
  participantNickname: string;
  type: 'item_added' | 'item_updated' | 'item_removed' | 'participant_joined' | 'participant_left';
  timestamp: Date;
  description: string;
  oldValue?: any;
  newValue?: any;
  itemDetails?: {
    itemId?: string;
    itemName?: string;
    quantity?: number;
    price?: number;
  };
}

export interface ModificationPermissionCheck {
  canModify: boolean;
  reason?: string;
  timeRemaining?: number; // 剩餘可修改時間（分鐘）
}

export interface OrderModificationService {
  // 權限檢查
  checkModificationPermission(orderId: string, participantId: string): Promise<ModificationPermissionCheck>;
  
  // 修改歷史記錄
  recordModification(modification: Omit<OrderModification, 'id' | 'timestamp'>): Promise<OrderModification>;
  getOrderModificationHistory(orderId: string): Promise<OrderModification[]>;
  getParticipantModificationHistory(participantId: string): Promise<OrderModification[]>;
  
  // 即時更新計算
  calculateOrderTotals(order: GroupOrder): Promise<OrderTotals>;
  calculateParticipantTotals(participant: OrderParticipant): Promise<ParticipantTotals>;
  
  // 修改通知
  notifyOrderUpdate(orderId: string, modification: OrderModification): Promise<void>;
}

export interface OrderTotals {
  totalParticipants: number;
  totalItems: number;
  totalAmount: number;
  averagePerParticipant: number;
  itemBreakdown: {
    itemId: string;
    itemName: string;
    totalQuantity: number;
    totalAmount: number;
    participantCount: number;
  }[];
}

export interface ParticipantTotals {
  totalItems: number;
  totalAmount: number;
  averageItemPrice: number;
  itemBreakdown: {
    itemId: string;
    itemName: string;
    quantity: number;
    totalPrice: number;
  }[];
}

export class OrderModificationServiceImpl implements OrderModificationService {
  private modifications: Map<string, OrderModification[]> = new Map(); // orderId -> modifications
  private orders: Map<string, GroupOrder> = new Map(); // Reference to orders

  constructor() {
    // 初始化
  }

  // 設定訂單引用（由 OrderService 調用）
  setOrdersReference(orders: Map<string, GroupOrder>): void {
    this.orders = orders;
  }

  async checkModificationPermission(orderId: string, participantId: string): Promise<ModificationPermissionCheck> {
    const order = this.orders.get(orderId);
    if (!order) {
      return {
        canModify: false,
        reason: 'Order not found'
      };
    }

    // 檢查訂單狀態
    if (order.status !== 'active') {
      return {
        canModify: false,
        reason: `Order is ${order.status}`
      };
    }

    // 檢查訂單設定是否允許修改
    if (!order.settings.allowModification) {
      return {
        canModify: false,
        reason: 'Order modifications are disabled'
      };
    }

    // 檢查參與者是否在訂單中
    const participant = order.participants.find(p => p.id === participantId);
    if (!participant) {
      return {
        canModify: false,
        reason: 'Participant not found in order'
      };
    }

    // 檢查截止時間
    if (order.deadline) {
      const now = new Date();
      const timeRemaining = Math.max(0, Math.floor((order.deadline.getTime() - now.getTime()) / (1000 * 60))); // 分鐘
      
      if (timeRemaining <= 0) {
        return {
          canModify: false,
          reason: 'Order deadline has passed'
        };
      }

      // 如果剩餘時間少於5分鐘，給予警告但仍允許修改
      if (timeRemaining <= 5) {
        return {
          canModify: true,
          reason: 'Limited time remaining',
          timeRemaining
        };
      }

      return {
        canModify: true,
        timeRemaining
      };
    }

    return {
      canModify: true
    };
  }

  async recordModification(modification: Omit<OrderModification, 'id' | 'timestamp'>): Promise<OrderModification> {
    const modificationRecord: OrderModification = {
      ...modification,
      id: this.generateId(),
      timestamp: new Date()
    };

    // 獲取或創建訂單的修改歷史
    const orderModifications = this.modifications.get(modification.orderId) || [];
    orderModifications.push(modificationRecord);
    this.modifications.set(modification.orderId, orderModifications);

    console.log(`Recorded modification: ${modificationRecord.type} for order ${modification.orderId}`);
    
    // 觸發通知
    await this.notifyOrderUpdate(modification.orderId, modificationRecord);
    
    return modificationRecord;
  }

  async getOrderModificationHistory(orderId: string): Promise<OrderModification[]> {
    const modifications = this.modifications.get(orderId) || [];
    
    // 按時間排序，最新的在前
    return modifications.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  async getParticipantModificationHistory(participantId: string): Promise<OrderModification[]> {
    const allModifications: OrderModification[] = [];
    
    // 搜尋所有訂單中該參與者的修改記錄
    for (const modifications of this.modifications.values()) {
      const participantModifications = modifications.filter(m => m.participantId === participantId);
      allModifications.push(...participantModifications);
    }
    
    // 按時間排序，最新的在前
    return allModifications.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  async calculateOrderTotals(order: GroupOrder): Promise<OrderTotals> {
    let totalItems = 0;
    let totalAmount = 0;
    const itemBreakdownMap = new Map<string, {
      itemId: string;
      itemName: string;
      totalQuantity: number;
      totalAmount: number;
      participantCount: number;
      participants: Set<string>;
    }>();

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
          existing.participants.add(participant.id);
          existing.participantCount = existing.participants.size;
        } else {
          itemBreakdownMap.set(key, {
            itemId: item.menuItemId,
            itemName: item.menuItemName,
            totalQuantity: item.quantity,
            totalAmount: item.totalPrice,
            participantCount: 1,
            participants: new Set([participant.id])
          });
        }
      }
    }

    const itemBreakdown = Array.from(itemBreakdownMap.values()).map(item => ({
      itemId: item.itemId,
      itemName: item.itemName,
      totalQuantity: item.totalQuantity,
      totalAmount: item.totalAmount,
      participantCount: item.participantCount
    }));

    return {
      totalParticipants: order.participants.length,
      totalItems,
      totalAmount,
      averagePerParticipant: order.participants.length > 0 ? totalAmount / order.participants.length : 0,
      itemBreakdown
    };
  }

  async calculateParticipantTotals(participant: OrderParticipant): Promise<ParticipantTotals> {
    let totalItems = 0;
    let totalAmount = 0;
    const itemBreakdown: ParticipantTotals['itemBreakdown'] = [];

    for (const item of participant.items) {
      totalItems += item.quantity;
      totalAmount += item.totalPrice;
      
      itemBreakdown.push({
        itemId: item.menuItemId,
        itemName: item.menuItemName,
        quantity: item.quantity,
        totalPrice: item.totalPrice
      });
    }

    return {
      totalItems,
      totalAmount,
      averageItemPrice: totalItems > 0 ? totalAmount / totalItems : 0,
      itemBreakdown
    };
  }

  async notifyOrderUpdate(orderId: string, modification: OrderModification): Promise<void> {
    // 這裡可以實作即時通知邏輯
    // 例如：WebSocket 推送、事件發布等
    console.log(`Order ${orderId} updated:`, {
      type: modification.type,
      participant: modification.participantNickname,
      description: modification.description,
      timestamp: modification.timestamp
    });

    // 未來可以整合 Socket.IO 或其他即時通訊機制
    // this.socketService.broadcastToOrder(orderId, {
    //   type: 'order_updated',
    //   modification
    // });
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
  }
}

// 擴展 OrderService 介面以支援修改功能
export interface EnhancedOrderModificationMethods {
  // 修改權限檢查
  checkParticipantModificationPermission(orderId: string, participantId: string): Promise<ModificationPermissionCheck>;
  
  // 帶修改記錄的項目操作
  addOrderItemWithHistory(orderId: string, participantId: string, request: any): Promise<any>;
  updateOrderItemWithHistory(orderId: string, participantId: string, itemId: string, request: any): Promise<any>;
  removeOrderItemWithHistory(orderId: string, participantId: string, itemId: string): Promise<boolean>;
  
  // 修改歷史查詢
  getOrderModificationHistory(orderId: string): Promise<OrderModification[]>;
  getParticipantModificationHistory(participantId: string): Promise<OrderModification[]>;
  
  // 即時統計
  getOrderTotals(orderId: string): Promise<OrderTotals | null>;
  getParticipantTotals(orderId: string, participantId: string): Promise<ParticipantTotals | null>;
}