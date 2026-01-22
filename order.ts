import express from 'express';
import { OrderService, OrderServiceImpl } from '../services/OrderService';
import { MenuService, MenuServiceImpl } from '../services/MenuService';
import { ParticipantServiceImpl } from '../services/ParticipantService';
import { GuestService } from '../services/GuestService';
import { UserManager } from '../managers/UserManager';
import {
  GroupOrderCreateRequest,
  GroupOrderUpdateRequest,
  JoinOrderRequest,
  AddOrderItemRequest,
  UpdateOrderItemRequest,
  OrderSearchQuery
} from '../types/order';

export function createOrderRouter(userManager: UserManager): express.Router {
  const router = express.Router();

  // 初始化服務
  const guestService = new GuestService();
  const menuService = new MenuServiceImpl(undefined, undefined, userManager);
  const participantService = new ParticipantServiceImpl(userManager, guestService);
  const orderService = new OrderServiceImpl(menuService, participantService);

// 創建團購訂單
router.post('/', async (req: express.Request, res: express.Response) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const user = await userManager.verifyToken(token);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
    }

    const request: GroupOrderCreateRequest = req.body;

    // 驗證必要欄位
    if (!request.menuId || !request.title) {
      return res.status(400).json({
        success: false,
        error: 'Menu ID and title are required'
      });
    }

    const order = await orderService.createGroupOrder(user.id, request);
    
    res.json({
      success: true,
      order
    });
  } catch (error) {
    console.error('Error creating group order:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create group order'
    });
  }
});

// 根據ID獲取訂單
router.get('/:orderId', async (req: express.Request, res: express.Response) => {
  try {
    const { orderId } = req.params;
    const order = await orderService.getOrderById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    res.json({
      success: true,
      order
    });
  } catch (error) {
    console.error('Error getting order:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get order'
    });
  }
});

// 根據訂單代碼獲取訂單
router.get('/code/:orderCode', async (req: express.Request, res: express.Response) => {
  try {
    const { orderCode } = req.params;
    const order = await orderService.getOrderByCode(orderCode);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    res.json({
      success: true,
      order
    });
  } catch (error) {
    console.error('Error getting order by code:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get order'
    });
  }
});

// 更新訂單
router.put('/:orderId', async (req: express.Request, res: express.Response) => {
  try {
    const { orderId } = req.params;
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const user = await userManager.verifyToken(token);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
    }

    const request: GroupOrderUpdateRequest = req.body;

    const order = await orderService.updateOrder(orderId, user.id, request);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found or permission denied'
      });
    }

    res.json({
      success: true,
      order
    });
  } catch (error) {
    console.error('Error updating order:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update order'
    });
  }
});

// 關閉訂單
router.post('/:orderId/close', async (req: express.Request, res: express.Response) => {
  try {
    const { orderId } = req.params;
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const user = await userManager.verifyToken(token);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
    }

    const success = await orderService.closeOrder(orderId, user.id);

    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Order not found or permission denied'
      });
    }

    res.json({
      success: true,
      message: 'Order closed successfully'
    });
  } catch (error) {
    console.error('Error closing order:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to close order'
    });
  }
});

// 刪除訂單
router.delete('/:orderId', async (req: express.Request, res: express.Response) => {
  try {
    const { orderId } = req.params;
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const user = await userManager.verifyToken(token);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
    }

    const success = await orderService.deleteOrder(orderId, user.id);

    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Order not found or permission denied'
      });
    }

    res.json({
      success: true,
      message: 'Order deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete order'
    });
  }
});

// 驗證訂單代碼
router.post('/validate-code', async (req: express.Request, res: express.Response) => {
  try {
    const { orderCode } = req.body;

    if (!orderCode) {
      return res.status(400).json({
        success: false,
        error: 'Order code is required'
      });
    }

    const validation = await orderService.validateOrderCode(orderCode);

    res.json({
      success: true,
      validation
    });
  } catch (error) {
    console.error('Error validating order code:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate order code'
    });
  }
});

// 加入訂單
router.post('/join', async (req: express.Request, res: express.Response) => {
  try {
    const request: JoinOrderRequest = req.body;
    const token = req.headers.authorization?.replace('Bearer ', '');
    let userId: string | undefined;

    if (token) {
      const user = await userManager.verifyToken(token);
      userId = user?.id;
    }

    // 驗證必要欄位
    if (!request.orderCode || !request.nickname) {
      return res.status(400).json({
        success: false,
        error: 'Order code and nickname are required'
      });
    }

    // 設定用戶ID（如果已登入）
    if (userId) {
      request.userId = userId;
    }

    const result = await orderService.joinOrder(request);

    if (!result.isValid || !result.canJoin) {
      return res.status(400).json({
        success: false,
        error: result.error || 'Cannot join order'
      });
    }

    res.json({
      success: true,
      order: result.order,
      message: 'Successfully joined order'
    });
  } catch (error) {
    console.error('Error joining order:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to join order'
    });
  }
});

// 離開訂單
router.post('/:orderId/leave', async (req: express.Request, res: express.Response) => {
  try {
    const { orderId } = req.params;
    const { participantId } = req.body;

    if (!participantId) {
      return res.status(400).json({
        success: false,
        error: 'Participant ID is required'
      });
    }

    const success = await orderService.leaveOrder(orderId, participantId);

    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Order or participant not found'
      });
    }

    res.json({
      success: true,
      message: 'Successfully left order'
    });
  } catch (error) {
    console.error('Error leaving order:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to leave order'
    });
  }
});

// 獲取訂單參與者
router.get('/:orderId/participants', async (req: express.Request, res: express.Response) => {
  try {
    const { orderId } = req.params;
    const participants = await orderService.getOrderParticipants(orderId);

    res.json({
      success: true,
      participants
    });
  } catch (error) {
    console.error('Error getting participants:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get participants'
    });
  }
});

// 添加訂單項目
router.post('/:orderId/items', async (req: express.Request, res: express.Response) => {
  try {
    const { orderId } = req.params;
    const { participantId, ...itemRequest }: { participantId: string } & AddOrderItemRequest = req.body;

    if (!participantId) {
      return res.status(400).json({
        success: false,
        error: 'Participant ID is required'
      });
    }

    const item = await orderService.addOrderItem(orderId, participantId, itemRequest);

    if (!item) {
      return res.status(400).json({
        success: false,
        error: 'Failed to add item to order'
      });
    }

    res.json({
      success: true,
      item
    });
  } catch (error) {
    console.error('Error adding order item:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add order item'
    });
  }
});

// 更新訂單項目
router.put('/:orderId/items/:itemId', async (req: express.Request, res: express.Response) => {
  try {
    const { orderId, itemId } = req.params;
    const { participantId, ...updateRequest }: { participantId: string } & UpdateOrderItemRequest = req.body;

    if (!participantId) {
      return res.status(400).json({
        success: false,
        error: 'Participant ID is required'
      });
    }

    const item = await orderService.updateOrderItem(orderId, participantId, itemId, updateRequest);

    if (!item) {
      return res.status(400).json({
        success: false,
        error: 'Failed to update order item'
      });
    }

    res.json({
      success: true,
      item
    });
  } catch (error) {
    console.error('Error updating order item:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update order item'
    });
  }
});

// 刪除訂單項目
router.delete('/:orderId/items/:itemId', async (req: express.Request, res: express.Response) => {
  try {
    const { orderId, itemId } = req.params;
    const { participantId } = req.body;

    if (!participantId) {
      return res.status(400).json({
        success: false,
        error: 'Participant ID is required'
      });
    }

    const success = await orderService.removeOrderItem(orderId, participantId, itemId);

    if (!success) {
      return res.status(400).json({
        success: false,
        error: 'Failed to remove order item'
      });
    }

    res.json({
      success: true,
      message: 'Order item removed successfully'
    });
  } catch (error) {
    console.error('Error removing order item:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove order item'
    });
  }
});

// 搜尋訂單
router.get('/', async (req: express.Request, res: express.Response) => {
  try {
    const query: OrderSearchQuery = {};
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    // 解析查詢參數
    if (req.query.createdBy) query.createdBy = req.query.createdBy as string;
    if (req.query.status) query.status = req.query.status as any;
    if (req.query.menuId) query.menuId = req.query.menuId as string;
    if (req.query.participantId) query.participantId = req.query.participantId as string;
    if (req.query.keyword) query.keyword = req.query.keyword as string;

    if (req.query.startDate && req.query.endDate) {
      query.dateRange = {
        start: new Date(req.query.startDate as string),
        end: new Date(req.query.endDate as string)
      };
    }

    const result = await orderService.searchOrders(query, page, limit);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error searching orders:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search orders'
    });
  }
});

// 獲取用戶的訂單
router.get('/user/:userId', async (req: express.Request, res: express.Response) => {
  try {
    const { userId } = req.params;
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const user = await userManager.verifyToken(token);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
    }

    // 只能查看自己的訂單
    if (userId !== user.id) {
      return res.status(403).json({
        success: false,
        error: 'Permission denied'
      });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    const result = await orderService.getUserOrders(userId, page, limit);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error getting user orders:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user orders'
    });
  }
});

// 獲取參與的訂單
router.get('/participant/:participantId', async (req: express.Request, res: express.Response) => {
  try {
    const { participantId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    const result = await orderService.getParticipantOrders(participantId, page, limit);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error getting participant orders:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get participant orders'
    });
  }
});

// 獲取訂單摘要
router.get('/:orderId/summary', async (req: express.Request, res: express.Response) => {
  try {
    const { orderId } = req.params;
    const summary = await orderService.calculateOrderSummary(orderId);

    if (!summary) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    res.json({
      success: true,
      summary
    });
  } catch (error) {
    console.error('Error getting order summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get order summary'
    });
  }
});

// 獲取訂單統計
router.get('/stats/overview', async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.query.userId as string;
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const user = await userManager.verifyToken(token);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
    }

    // 如果指定了用戶ID，只能查看自己的統計
    if (userId && userId !== user.id) {
      return res.status(403).json({
        success: false,
        error: 'Permission denied'
      });
    }

    const stats = await orderService.getOrderStatistics(userId || user.id);

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error getting order statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get order statistics'
    });
  }
});

// 高級搜尋訂單
router.post('/advanced-search', async (req: express.Request, res: express.Response) => {
  try {
    const query = req.body;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    const result = await orderService.advancedSearchOrders(query, page, limit);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error in advanced search:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to perform advanced search'
    });
  }
});

// 搜尋訂單項目
router.get('/:orderId/items/search', async (req: express.Request, res: express.Response) => {
  try {
    const { orderId } = req.params;
    const keyword = req.query.keyword as string;

    const items = await orderService.searchOrderItems(orderId, keyword);

    res.json({
      success: true,
      items
    });
  } catch (error) {
    console.error('Error searching order items:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search order items'
    });
  }
});

// 批量關閉訂單
router.post('/bulk-close', async (req: express.Request, res: express.Response) => {
  try {
    const { orderIds } = req.body;
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const user = await userManager.verifyToken(token);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
    }

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Order IDs array is required'
      });
    }

    const result = await orderService.bulkCloseOrders(orderIds, user.id);

    res.json({
      success: true,
      result
    });
  } catch (error) {
    console.error('Error in bulk close orders:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to bulk close orders'
    });
  }
});

// 按狀態獲取訂單
router.get('/status/:status', async (req: express.Request, res: express.Response) => {
  try {
    const { status } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    if (!['active', 'closed', 'expired'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status. Must be active, closed, or expired'
      });
    }

    const result = await orderService.getOrdersByStatus(status as any, page, limit);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error getting orders by status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get orders by status'
    });
  }
});

// 按日期範圍獲取訂單
router.get('/date-range', async (req: express.Request, res: express.Response) => {
  try {
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'Start date and end date are required'
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format'
      });
    }

    const result = await orderService.getOrdersByDateRange(start, end, page, limit);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error getting orders by date range:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get orders by date range'
    });
  }
});

// 生成訂單報告
router.get('/:orderId/report', async (req: express.Request, res: express.Response) => {
  try {
    const { orderId } = req.params;
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const user = await userManager.verifyToken(token);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
    }

    // 檢查用戶是否有權限查看報告（訂單創建者）
    const canModify = await orderService.canUserModifyOrder(orderId, user.id);
    if (!canModify) {
      // 也允許查看自己參與的訂單報告
      const order = await orderService.getOrderById(orderId);
      const isParticipant = order?.participants.some(p => p.userId === user.id);
      
      if (!isParticipant) {
        return res.status(403).json({
          success: false,
          error: 'Permission denied'
        });
      }
    }

    const report = await orderService.generateOrderReport(orderId);

    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    res.json({
      success: true,
      report
    });
  } catch (error) {
    console.error('Error generating order report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate order report'
    });
  }
});

// 獲取訂單分析
router.get('/analytics/detailed', async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.query.userId as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const user = await userManager.verifyToken(token);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
    }

    // 如果指定了用戶ID，只能查看自己的分析
    if (userId && userId !== user.id) {
      return res.status(403).json({
        success: false,
        error: 'Permission denied'
      });
    }

    let dateRange: { start: Date; end: Date } | undefined;
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        dateRange = { start, end };
      }
    }

    const analytics = await orderService.getOrderAnalytics(userId || user.id, dateRange);

    res.json({
      success: true,
      analytics
    });
  } catch (error) {
    console.error('Error getting order analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get order analytics'
    });
  }
});

// 檢查參與者修改權限
router.get('/:orderId/participants/:participantId/modification-permission', async (req: express.Request, res: express.Response) => {
  try {
    const { orderId, participantId } = req.params;

    const permission = await orderService.checkParticipantModificationPermission(orderId, participantId);

    res.json({
      success: true,
      permission
    });
  } catch (error) {
    console.error('Error checking modification permission:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check modification permission'
    });
  }
});

// 獲取訂單修改歷史
router.get('/:orderId/modification-history', async (req: express.Request, res: express.Response) => {
  try {
    const { orderId } = req.params;
    const history = await orderService.getOrderModificationHistory(orderId);

    res.json({
      success: true,
      history
    });
  } catch (error) {
    console.error('Error getting order modification history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get modification history'
    });
  }
});

// 獲取參與者修改歷史
router.get('/participants/:participantId/modification-history', async (req: express.Request, res: express.Response) => {
  try {
    const { participantId } = req.params;
    const history = await orderService.getParticipantModificationHistory(participantId);

    res.json({
      success: true,
      history
    });
  } catch (error) {
    console.error('Error getting participant modification history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get participant modification history'
    });
  }
});

// 獲取訂單即時統計
router.get('/:orderId/totals', async (req: express.Request, res: express.Response) => {
  try {
    const { orderId } = req.params;
    const totals = await orderService.getOrderTotals(orderId);

    if (!totals) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    res.json({
      success: true,
      totals
    });
  } catch (error) {
    console.error('Error getting order totals:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get order totals'
    });
  }
});

// 獲取參與者即時統計
router.get('/:orderId/participants/:participantId/totals', async (req: express.Request, res: express.Response) => {
  try {
    const { orderId, participantId } = req.params;
    const totals = await orderService.getParticipantTotals(orderId, participantId);

    if (!totals) {
      return res.status(404).json({
        success: false,
        error: 'Order or participant not found'
      });
    }

    res.json({
      success: true,
      totals
    });
  } catch (error) {
    console.error('Error getting participant totals:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get participant totals'
    });
  }
});

// 使用增強的項目操作方法（帶修改歷史記錄）
// 添加訂單項目（增強版）
router.post('/:orderId/items-enhanced', async (req: express.Request, res: express.Response) => {
  try {
    const { orderId } = req.params;
    const { participantId, ...itemRequest }: { participantId: string } & AddOrderItemRequest = req.body;

    if (!participantId) {
      return res.status(400).json({
        success: false,
        error: 'Participant ID is required'
      });
    }

    const item = await orderService.addOrderItemWithHistory(orderId, participantId, itemRequest);

    if (!item) {
      return res.status(400).json({
        success: false,
        error: 'Failed to add item to order'
      });
    }

    res.json({
      success: true,
      item
    });
  } catch (error) {
    console.error('Error adding order item with history:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add order item'
    });
  }
});

// 更新訂單項目（增強版）
router.put('/:orderId/items-enhanced/:itemId', async (req: express.Request, res: express.Response) => {
  try {
    const { orderId, itemId } = req.params;
    const { participantId, ...updateRequest }: { participantId: string } & UpdateOrderItemRequest = req.body;

    if (!participantId) {
      return res.status(400).json({
        success: false,
        error: 'Participant ID is required'
      });
    }

    const item = await orderService.updateOrderItemWithHistory(orderId, participantId, itemId, updateRequest);

    if (!item) {
      return res.status(400).json({
        success: false,
        error: 'Failed to update order item'
      });
    }

    res.json({
      success: true,
      item
    });
  } catch (error) {
    console.error('Error updating order item with history:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update order item'
    });
  }
});

// 刪除訂單項目（增強版）
router.delete('/:orderId/items-enhanced/:itemId', async (req: express.Request, res: express.Response) => {
  try {
    const { orderId, itemId } = req.params;
    const { participantId } = req.body;

    if (!participantId) {
      return res.status(400).json({
        success: false,
        error: 'Participant ID is required'
      });
    }

    const success = await orderService.removeOrderItemWithHistory(orderId, participantId, itemId);

    if (!success) {
      return res.status(400).json({
        success: false,
        error: 'Failed to remove order item'
      });
    }

    res.json({
      success: true,
      message: 'Order item removed successfully'
    });
  } catch (error) {
    console.error('Error removing order item with history:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to remove order item'
    });
  }
});

  return router;
}

export default createOrderRouter;