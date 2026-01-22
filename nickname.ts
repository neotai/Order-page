import express from 'express';
import { UserManager } from '../managers/UserManager';
import { NicknameRequest } from '../types/nickname';
import { createAuthMiddleware } from '../middleware/auth';

export function createNicknameRouter(userManager: UserManager): express.Router {
  const router = express.Router();
  const authMiddleware = createAuthMiddleware(userManager);

  // 驗證暱稱格式
  router.post('/validate', async (req, res) => {
    try {
      const { nickname } = req.body;
      
      if (!nickname || typeof nickname !== 'string') {
        return res.status(400).json({
          success: false,
          error: '暱稱不能為空'
        });
      }

      const result = await userManager.validateNickname(nickname);
      
      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('Nickname validation error:', error);
      res.status(500).json({
        success: false,
        error: '內部伺服器錯誤'
      });
    }
  });

  // 設定預設暱稱 (需要認證)
  router.put('/default', authMiddleware(userManager), async (req, res) => {
    try {
      const { nickname }: NicknameRequest = req.body;
      const userId = (req as any).user.id;
      
      if (!nickname || typeof nickname !== 'string') {
        return res.status(400).json({
          success: false,
          error: '暱稱不能為空'
        });
      }

      const result = await userManager.setDefaultNickname(userId, nickname);
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);
    } catch (error) {
      console.error('Set default nickname error:', error);
      res.status(500).json({
        success: false,
        error: '內部伺服器錯誤'
      });
    }
  });

  // 設定群族暱稱 (需要認證)
  router.put('/group/:groupId', authMiddleware(userManager), async (req, res) => {
    try {
      const { nickname }: NicknameRequest = req.body;
      const { groupId } = req.params;
      const userId = (req as any).user.id;
      
      if (!nickname || typeof nickname !== 'string') {
        return res.status(400).json({
          success: false,
          error: '暱稱不能為空'
        });
      }

      if (!groupId) {
        return res.status(400).json({
          success: false,
          error: '群族 ID 不能為空'
        });
      }

      const result = await userManager.setGroupNickname(userId, groupId, nickname);
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);
    } catch (error) {
      console.error('Set group nickname error:', error);
      res.status(500).json({
        success: false,
        error: '內部伺服器錯誤'
      });
    }
  });

  // 獲取用戶暱稱資訊 (需要認證)
  router.get('/info', authMiddleware(userManager), async (req, res) => {
    try {
      const userId = (req as any).user.id;
      
      const nicknameInfo = await userManager.getUserNicknameInfo(userId);
      
      if (!nicknameInfo) {
        return res.status(404).json({
          success: false,
          error: '用戶不存在'
        });
      }

      res.json({
        success: true,
        data: nicknameInfo
      });
    } catch (error) {
      console.error('Get nickname info error:', error);
      res.status(500).json({
        success: false,
        error: '內部伺服器錯誤'
      });
    }
  });

  // 獲取用戶在特定群族的暱稱 (需要認證)
  router.get('/display/:groupId?', authMiddleware(userManager), async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const { groupId } = req.params;
      
      const nickname = await userManager.getUserNickname(userId, groupId);
      
      res.json({
        success: true,
        nickname,
        groupId: groupId || null
      });
    } catch (error) {
      console.error('Get display nickname error:', error);
      res.status(500).json({
        success: false,
        error: '內部伺服器錯誤'
      });
    }
  });

  // 刪除群族暱稱 (需要認證)
  router.delete('/group/:groupId', authMiddleware(userManager), async (req, res) => {
    try {
      const { groupId } = req.params;
      const userId = (req as any).user.id;
      
      if (!groupId) {
        return res.status(400).json({
          success: false,
          error: '群族 ID 不能為空'
        });
      }

      // 設定空字串來刪除群族暱稱
      const result = await userManager.setGroupNickname(userId, groupId, '');
      
      res.json({
        success: true,
        message: '群族暱稱已刪除'
      });
    } catch (error) {
      console.error('Delete group nickname error:', error);
      res.status(500).json({
        success: false,
        error: '內部伺服器錯誤'
      });
    }
  });

  return router;
}