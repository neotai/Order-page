import { OrderService } from './OrderService';

export interface OrderScheduler {
  start(): void;
  stop(): void;
  checkExpiredOrders(): Promise<string[]>;
}

export class OrderSchedulerImpl implements OrderScheduler {
  private orderService: OrderService;
  private intervalId?: NodeJS.Timeout;
  private checkInterval: number; // 檢查間隔（毫秒）
  private isRunning: boolean = false;

  constructor(orderService: OrderService, checkIntervalMinutes: number = 1) {
    this.orderService = orderService;
    this.checkInterval = checkIntervalMinutes * 60 * 1000; // 轉換為毫秒
  }

  start(): void {
    if (this.isRunning) {
      console.log('Order scheduler is already running');
      return;
    }

    console.log(`Starting order scheduler with ${this.checkInterval / 60000} minute intervals`);
    
    // 立即執行一次檢查
    this.checkExpiredOrders();
    
    // 設定定期檢查
    this.intervalId = setInterval(async () => {
      try {
        await this.checkExpiredOrders();
      } catch (error) {
        console.error('Error in scheduled order expiration check:', error);
      }
    }, this.checkInterval);

    this.isRunning = true;
  }

  stop(): void {
    if (!this.isRunning) {
      console.log('Order scheduler is not running');
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    this.isRunning = false;
    console.log('Order scheduler stopped');
  }

  async checkExpiredOrders(): Promise<string[]> {
    try {
      const expiredOrderIds = await this.orderService.checkAndExpireOrders();
      
      if (expiredOrderIds.length > 0) {
        console.log(`Automatically expired ${expiredOrderIds.length} orders:`, expiredOrderIds);
        
        // 這裡可以添加通知邏輯，例如發送通知給訂單創建者和參與者
        await this.notifyExpiredOrders(expiredOrderIds);
      }

      return expiredOrderIds;
    } catch (error) {
      console.error('Error checking expired orders:', error);
      return [];
    }
  }

  private async notifyExpiredOrders(expiredOrderIds: string[]): Promise<void> {
    // 實作通知邏輯
    // 這裡可以整合 WebSocket、Email 或其他通知服務
    for (const orderId of expiredOrderIds) {
      try {
        const order = await this.orderService.getOrderById(orderId);
        if (order) {
          console.log(`Notifying participants of expired order: ${order.title} (${order.orderCode})`);
          
          // 發送通知給訂單創建者
          // await this.notificationService.notifyUser(order.createdBy, {
          //   type: 'order_expired',
          //   orderId: order.id,
          //   orderTitle: order.title,
          //   orderCode: order.orderCode
          // });

          // 發送通知給所有參與者
          // for (const participant of order.participants) {
          //   if (participant.userId) {
          //     await this.notificationService.notifyUser(participant.userId, {
          //       type: 'order_expired',
          //       orderId: order.id,
          //       orderTitle: order.title,
          //       orderCode: order.orderCode
          //     });
          //   }
          // }
        }
      } catch (error) {
        console.error(`Error notifying expired order ${orderId}:`, error);
      }
    }
  }

  // 獲取調度器狀態
  getStatus(): { isRunning: boolean; checkInterval: number } {
    return {
      isRunning: this.isRunning,
      checkInterval: this.checkInterval
    };
  }

  // 手動觸發過期檢查
  async triggerCheck(): Promise<string[]> {
    console.log('Manually triggering order expiration check');
    return await this.checkExpiredOrders();
  }
}