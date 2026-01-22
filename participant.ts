import express from 'express';
import { ParticipantService, ParticipantServiceImpl } from '../services/ParticipantService';
import { OrderService, OrderServiceImpl } from '../services/OrderService';
import { MenuService, MenuServiceImpl } from '../services/MenuService';
import { UserManager } from '../managers/UserManager';
import { GuestService } from '../services/GuestService';

export function createParticipantRouter(userManager: UserManager, guestService: GuestService): express.Router {
  const router = express.Router();

  // 初始化服務
  const menuService = new MenuServiceImpl(undefined, undefined, userManager);
  const orderService = new OrderServiceImpl(menuService);
  const participantService = new ParticipantServiceImpl(userManager, guestService);

  // 驗證參與者身份
  router.post('/validate-identity', async (req: express.Request, res: express.Response) => {
    try {
      const { orderCode, nickname, userId, guestSessionId } = req.body;

      if (!orderCode || !nickname) {
        return res.status(400).json({
          success: false,
          error: 'Order code and nickname are required'
        });
      }

      const validation = await participantService.validateParticipantIdentity({
        orderCode,
        nickname,
        userId,
        guestSessionId
      });

      res.json({
        success: true,
        validation
      });
    } catch (error) {
      console.error('Error validating participant identity:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to validate participant identity'
      });
    }
  });

  // 獲取參與者身份信息
  router.get('/:participantId/identity', async (req: express.Request, res: express.Response) => {
    try {
      const { participantId } = req.params;
      const identity = await participantService.getParticipantIdentity(participantId);

      if (!identity) {
        return res.status(404).json({
          success: false,
          error: 'Participant not found'
        });
      }

      res.json({
        success: true,
        identity
      });
    } catch (error) {
      console.error('Error getting participant identity:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get participant identity'
      });
    }
  });

  // 檢查參與者是否可以加入訂單
  router.post('/:participantId/can-join/:orderId', async (req: express.Request, res: express.Response) => {
    try {
      const { participantId, orderId } = req.params;
      
      const order = await orderService.getOrderById(orderId);
      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }

      const canJoin = await participantService.canParticipantJoinOrder(participantId, order);

      res.json({
        success: true,
        canJoin
      });
    } catch (error) {
      console.error('Error checking if participant can join:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to check join permission'
      });
    }
  });

  // 檢查參與者是否可以修改訂單
  router.post('/:participantId/can-modify/:orderId', async (req: express.Request, res: express.Response) => {
    try {
      const { participantId, orderId } = req.params;
      
      const order = await orderService.getOrderById(orderId);
      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }

      const canModify = await participantService.canParticipantModifyOrder(participantId, order);

      res.json({
        success: true,
        canModify
      });
    } catch (error) {
      console.error('Error checking if participant can modify:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to check modify permission'
      });
    }
  });

  // 檢查參與者是否在訂單中
  router.get('/:participantId/in-order/:orderId', async (req: express.Request, res: express.Response) => {
    try {
      const { participantId, orderId } = req.params;
      
      const isInOrder = await participantService.isParticipantInOrder(participantId, orderId);

      res.json({
        success: true,
        isInOrder
      });
    } catch (error) {
      console.error('Error checking if participant is in order:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to check participant status'
      });
    }
  });

  // 獲取參與者的訂單歷史
  router.get('/:participantId/order-history', async (req: express.Request, res: express.Response) => {
    try {
      const { participantId } = req.params;
      const token = req.headers.authorization?.replace('Bearer ', '');

      // 驗證權限：只能查看自己的歷史或公開信息
      if (token) {
        const user = await userManager.verifyToken(token);
        const identity = await participantService.getParticipantIdentity(participantId);
        
        if (user && identity && identity.userId !== user.id) {
          return res.status(403).json({
            success: false,
            error: 'Permission denied'
          });
        }
      }

      const orderHistory = await participantService.getParticipantOrderHistory(participantId);

      res.json({
        success: true,
        orderHistory
      });
    } catch (error) {
      console.error('Error getting participant order history:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get order history'
      });
    }
  });

  // 獲取參與者統計信息
  router.get('/:participantId/statistics', async (req: express.Request, res: express.Response) => {
    try {
      const { participantId } = req.params;
      const token = req.headers.authorization?.replace('Bearer ', '');

      // 驗證權限：只能查看自己的統計
      if (token) {
        const user = await userManager.verifyToken(token);
        const identity = await participantService.getParticipantIdentity(participantId);
        
        if (user && identity && identity.userId !== user.id) {
          return res.status(403).json({
            success: false,
            error: 'Permission denied'
          });
        }
      }

      const statistics = await participantService.getParticipantStatistics(participantId);

      res.json({
        success: true,
        statistics
      });
    } catch (error) {
      console.error('Error getting participant statistics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get participant statistics'
      });
    }
  });

  // 檢查暱稱在訂單中是否可用
  router.post('/check-nickname', async (req: express.Request, res: express.Response) => {
    try {
      const { nickname, orderId } = req.body;

      if (!nickname || !orderId) {
        return res.status(400).json({
          success: false,
          error: 'Nickname and order ID are required'
        });
      }

      const isAvailable = await participantService.isNicknameAvailableInOrder(nickname, orderId);

      res.json({
        success: true,
        isAvailable
      });
    } catch (error) {
      console.error('Error checking nickname availability:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to check nickname availability'
      });
    }
  });

  // 獲取暱稱建議
  router.post('/suggest-nicknames', async (req: express.Request, res: express.Response) => {
    try {
      const { nickname, orderId } = req.body;

      if (!nickname || !orderId) {
        return res.status(400).json({
          success: false,
          error: 'Nickname and order ID are required'
        });
      }

      const suggestions = await participantService.suggestAlternativeNicknames(nickname, orderId);

      res.json({
        success: true,
        suggestions
      });
    } catch (error) {
      console.error('Error getting nickname suggestions:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get nickname suggestions'
      });
    }
  });

  // 更新參與者活動時間
  router.post('/:participantId/update-activity', async (req: express.Request, res: express.Response) => {
    try {
      const { participantId } = req.params;
      
      await participantService.updateParticipantActivity(participantId);

      res.json({
        success: true,
        message: 'Activity updated successfully'
      });
    } catch (error) {
      console.error('Error updating participant activity:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update activity'
      });
    }
  });

  return router;
}

export default createParticipantRouter;