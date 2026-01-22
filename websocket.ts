import { Router } from 'express';
import { WebSocketService } from '../services/WebSocketService';
import { UserManagerImpl } from '../managers/UserManager';

export function createWebSocketRouter(webSocketService: WebSocketService, userManager: UserManagerImpl) {
  const router = Router();

  // 獲取 WebSocket 連接狀態
  router.get('/status', async (req, res) => {
    try {
      const status = webSocketService.getStatus();
      res.json({
        success: true,
        status
      });
    } catch (error) {
      console.error('Error getting WebSocket status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get WebSocket status'
      });
    }
  });

  // 獲取房間內的用戶列表
  router.get('/room/:roomId/users', async (req, res) => {
    try {
      const { roomId } = req.params;
      const users = await webSocketService.getRoomUsers(roomId);
      
      res.json({
        success: true,
        roomId,
        users: users.map(user => ({
          id: user.id,
          nickname: user.defaultNickname,
          isGuest: user.isGuest
        }))
      });
    } catch (error) {
      console.error('Error getting room users:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get room users'
      });
    }
  });

  // 發送測試訊息到房間
  router.post('/room/:roomId/test-message', async (req, res) => {
    try {
      const { roomId } = req.params;
      const { message } = req.body;
      
      webSocketService.broadcastToRoom(roomId, 'test-message', {
        message: message || 'Test message from server',
        sender: 'system'
      });
      
      res.json({
        success: true,
        message: 'Test message sent to room'
      });
    } catch (error) {
      console.error('Error sending test message:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to send test message'
      });
    }
  });

  // 廣播訂單更新測試
  router.post('/order/:orderId/test-update', async (req, res) => {
    try {
      const { orderId } = req.params;
      const { updateData } = req.body;
      
      webSocketService.broadcastOrderUpdate(orderId, {
        eventType: 'test_update',
        message: 'Test order update',
        ...updateData
      });
      
      res.json({
        success: true,
        message: 'Test order update broadcasted'
      });
    } catch (error) {
      console.error('Error broadcasting test update:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to broadcast test update'
      });
    }
  });

  // 發送訊息給特定用戶
  router.post('/user/:userId/message', async (req, res) => {
    try {
      const { userId } = req.params;
      const { event, data } = req.body;
      
      webSocketService.sendToUser(userId, event || 'notification', data || {});
      
      res.json({
        success: true,
        message: 'Message sent to user'
      });
    } catch (error) {
      console.error('Error sending message to user:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to send message to user'
      });
    }
  });

  return router;
}

export default createWebSocketRouter;