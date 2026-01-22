import { Router, Request, Response } from 'express';
import { GroupMessageService } from '../services/GroupMessageService';
import { 
  SendMessageRequest, 
  UpdateMessageRequest, 
  MessageSearchQuery,
  MessageBatchOperation,
  ShareOrderToGroupRequest
} from '../types/message';

export function createGroupMessageRouter(messageService: GroupMessageService) {
  const router = Router();

// 訊息 CRUD 操作

// 發送訊息
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const request: SendMessageRequest = req.body;
    
    // 驗證必要欄位
    if (!request.groupId || !request.type || !request.content) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const message = await messageService.sendMessage(userId, request);
    
    if (!message) {
      return res.status(403).json({ error: 'Permission denied or invalid group' });
    }

    res.status(201).json(message);
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// 獲取訊息
router.get('/:messageId', async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params;
    
    const message = await messageService.getMessage(messageId);
    
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    res.json(message);
  } catch (error) {
    console.error('Error getting message:', error);
    res.status(500).json({ error: 'Failed to get message' });
  }
});

// 更新訊息
router.put('/:messageId', async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const request: UpdateMessageRequest = req.body;
    const updatedMessage = await messageService.updateMessage(messageId, userId, request);
    
    if (!updatedMessage) {
      return res.status(404).json({ error: 'Message not found or permission denied' });
    }

    res.json(updatedMessage);
  } catch (error) {
    console.error('Error updating message:', error);
    res.status(500).json({ error: 'Failed to update message' });
  }
});

// 刪除訊息
router.delete('/:messageId', async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const success = await messageService.deleteMessage(messageId, userId);
    
    if (!success) {
      return res.status(404).json({ error: 'Message not found or permission denied' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// 訊息搜尋和列表

// 獲取群族訊息
router.get('/group/:groupId', async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;

    const result = await messageService.getGroupMessages(groupId, userId, page, limit);
    res.json(result);
  } catch (error) {
    console.error('Error getting group messages:', error);
    res.status(500).json({ error: 'Failed to get group messages' });
  }
});

// 搜尋訊息
router.post('/search', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const query: MessageSearchQuery = req.body;
    
    if (!query.groupId) {
      return res.status(400).json({ error: 'Group ID is required' });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const result = await messageService.searchMessages(query, userId, page, limit);
    res.json(result);
  } catch (error) {
    console.error('Error searching messages:', error);
    res.status(500).json({ error: 'Failed to search messages' });
  }
});

// 訊息反應

// 添加反應
router.post('/:messageId/reactions', async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { emoji } = req.body;
    
    if (!emoji) {
      return res.status(400).json({ error: 'Emoji is required' });
    }

    const success = await messageService.addReaction(messageId, userId, emoji);
    
    if (!success) {
      return res.status(400).json({ error: 'Failed to add reaction' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error adding reaction:', error);
    res.status(500).json({ error: 'Failed to add reaction' });
  }
});

// 移除反應
router.delete('/:messageId/reactions/:emoji', async (req: Request, res: Response) => {
  try {
    const { messageId, emoji } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const success = await messageService.removeReaction(messageId, userId, emoji);
    
    if (!success) {
      return res.status(400).json({ error: 'Failed to remove reaction' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error removing reaction:', error);
    res.status(500).json({ error: 'Failed to remove reaction' });
  }
});

// 批次操作

// 批次操作訊息
router.post('/batch', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const operation: MessageBatchOperation = req.body;
    
    if (!operation.messageIds || !operation.operation) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await messageService.batchOperateMessages(userId, operation);
    res.json(result);
  } catch (error) {
    console.error('Error in batch operation:', error);
    res.status(500).json({ error: 'Failed to perform batch operation' });
  }
});

// 訂單分享功能

// 分享訂單到群族
router.post('/share-order', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const request: ShareOrderToGroupRequest = req.body;
    
    if (!request.groupId || !request.orderId) {
      return res.status(400).json({ error: 'Group ID and Order ID are required' });
    }

    const result = await messageService.shareOrderToGroup(userId, request);
    res.json(result);
  } catch (error) {
    console.error('Error sharing order:', error);
    res.status(500).json({ error: 'Failed to share order' });
  }
});

// 獲取群族訂單分享
router.get('/group/:groupId/order-shares', async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const shares = await messageService.getGroupOrderShares(groupId, userId);
    res.json(shares);
  } catch (error) {
    console.error('Error getting order shares:', error);
    res.status(500).json({ error: 'Failed to get order shares' });
  }
});

// 通知管理

// 獲取用戶通知
router.get('/notifications/user', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const notifications = await messageService.getUserNotifications(userId, page, limit);
    res.json(notifications);
  } catch (error) {
    console.error('Error getting notifications:', error);
    res.status(500).json({ error: 'Failed to get notifications' });
  }
});

// 標記通知為已讀
router.put('/notifications/:notificationId/read', async (req: Request, res: Response) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const success = await messageService.markNotificationAsRead(notificationId, userId);
    
    if (!success) {
      return res.status(404).json({ error: 'Notification not found or permission denied' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// 標記所有通知為已讀
router.put('/notifications/read-all', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { groupId } = req.body;
    const count = await messageService.markAllNotificationsAsRead(userId, groupId);
    
    res.json({ success: true, count });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

// 通知設定

// 獲取通知設定
router.get('/notifications/settings/:groupId', async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const settings = await messageService.getNotificationSettings(userId, groupId);
    res.json(settings);
  } catch (error) {
    console.error('Error getting notification settings:', error);
    res.status(500).json({ error: 'Failed to get notification settings' });
  }
});

// 更新通知設定
router.put('/notifications/settings/:groupId', async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const settings = req.body;
    const updatedSettings = await messageService.updateNotificationSettings(userId, groupId, settings);
    
    if (!updatedSettings) {
      return res.status(400).json({ error: 'Failed to update notification settings' });
    }

    res.json(updatedSettings);
  } catch (error) {
    console.error('Error updating notification settings:', error);
    res.status(500).json({ error: 'Failed to update notification settings' });
  }
});

// 統計和分析

// 獲取訊息統計
router.get('/group/:groupId/statistics', async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const statistics = await messageService.getMessageStatistics(groupId, userId);
    
    if (!statistics) {
      return res.status(403).json({ error: 'Permission denied or group not found' });
    }

    res.json(statistics);
  } catch (error) {
    console.error('Error getting message statistics:', error);
    res.status(500).json({ error: 'Failed to get message statistics' });
  }
});

// 即時功能

// 獲取用戶在線狀態
router.get('/group/:groupId/online-status', async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const statuses = await messageService.getUserOnlineStatus(groupId);
    res.json(statuses);
  } catch (error) {
    console.error('Error getting online status:', error);
    res.status(500).json({ error: 'Failed to get online status' });
  }
});

// 設定用戶在線狀態
router.put('/group/:groupId/online-status', async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { isOnline } = req.body;
    
    if (typeof isOnline !== 'boolean') {
      return res.status(400).json({ error: 'isOnline must be a boolean' });
    }

    await messageService.setUserOnlineStatus(userId, groupId, isOnline);
    res.json({ success: true });
  } catch (error) {
    console.error('Error setting online status:', error);
    res.status(500).json({ error: 'Failed to set online status' });
  }
});

// 設定用戶輸入狀態
router.put('/group/:groupId/typing-status', async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { isTyping } = req.body;
    
    if (typeof isTyping !== 'boolean') {
      return res.status(400).json({ error: 'isTyping must be a boolean' });
    }

    await messageService.setUserTypingStatus(userId, groupId, isTyping);
    res.json({ success: true });
  } catch (error) {
    console.error('Error setting typing status:', error);
    res.status(500).json({ error: 'Failed to set typing status' });
  }
});

// 草稿功能

// 儲存草稿
router.put('/group/:groupId/draft', async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { content, replyTo } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    await messageService.saveDraft(userId, groupId, content, replyTo);
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving draft:', error);
    res.status(500).json({ error: 'Failed to save draft' });
  }
});

// 獲取草稿
router.get('/group/:groupId/draft', async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const draft = await messageService.getDraft(userId, groupId);
    res.json(draft);
  } catch (error) {
    console.error('Error getting draft:', error);
    res.status(500).json({ error: 'Failed to get draft' });
  }
});

// 清除草稿
router.delete('/group/:groupId/draft', async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    await messageService.clearDraft(userId, groupId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error clearing draft:', error);
    res.status(500).json({ error: 'Failed to clear draft' });
  }
});

  return router;
}

export default createGroupMessageRouter;