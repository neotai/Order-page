import { Router, Request, Response } from 'express';
import { GroupService, GroupServiceImpl } from '../services/GroupService';
import { NicknameServiceImpl } from '../services/NicknameService';
import { UserManagerImpl } from '../managers/UserManager';
import { 
  GroupCreateRequest, 
  GroupUpdateRequest, 
  GroupInviteRequest, 
  GroupMemberUpdateRequest,
  GroupSearchQuery 
} from '../types/group';

const router = Router();

// 創建服務實例
const nicknameService = new NicknameServiceImpl();
const userManager = new UserManagerImpl();
const groupService = new GroupServiceImpl(nicknameService, undefined, userManager);

// 群族 CRUD 操作

// 創建群族
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const request: GroupCreateRequest = req.body;
    
    // 驗證必要欄位
    if (!request.name || request.name.trim() === '') {
      return res.status(400).json({ error: 'Group name is required' });
    }

    const group = await groupService.createGroup(userId, request);
    res.status(201).json(group);
  } catch (error) {
    console.error('Error creating group:', error);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

// 獲取群族詳情
router.get('/:groupId', async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const userId = req.user?.id;

    const group = await groupService.getGroupById(groupId);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // 檢查查看權限
    if (userId) {
      const permission = await groupService.canUserViewGroup(groupId, userId);
      if (!permission.hasPermission) {
        return res.status(403).json({ error: permission.reason || 'Access denied' });
      }
    } else if (group.settings.isPrivate) {
      return res.status(403).json({ error: 'Private group - authentication required' });
    }

    res.json(group);
  } catch (error) {
    console.error('Error getting group:', error);
    res.status(500).json({ error: 'Failed to get group' });
  }
});

// 更新群族
router.put('/:groupId', async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const request: GroupUpdateRequest = req.body;
    const updatedGroup = await groupService.updateGroup(groupId, userId, request);
    
    if (!updatedGroup) {
      return res.status(404).json({ error: 'Group not found or permission denied' });
    }

    res.json(updatedGroup);
  } catch (error) {
    console.error('Error updating group:', error);
    res.status(500).json({ error: 'Failed to update group' });
  }
});

// 刪除群族
router.delete('/:groupId', async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const success = await groupService.deleteGroup(groupId, userId);
    
    if (!success) {
      return res.status(404).json({ error: 'Group not found or permission denied' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting group:', error);
    res.status(500).json({ error: 'Failed to delete group' });
  }
});

// 群族搜尋和列表

// 搜尋群族
router.get('/', async (req: Request, res: Response) => {
  try {
    const query: GroupSearchQuery = {
      keyword: req.query.keyword as string,
      createdBy: req.query.createdBy as string,
      memberId: req.query.memberId as string,
      isPrivate: req.query.isPrivate === 'true' ? true : req.query.isPrivate === 'false' ? false : undefined,
      minMembers: req.query.minMembers ? parseInt(req.query.minMembers as string) : undefined,
      maxMembers: req.query.maxMembers ? parseInt(req.query.maxMembers as string) : undefined
    };

    // 日期範圍處理
    if (req.query.startDate && req.query.endDate) {
      query.dateRange = {
        start: new Date(req.query.startDate as string),
        end: new Date(req.query.endDate as string)
      };
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    const result = await groupService.searchGroups(query, page, limit);
    res.json(result);
  } catch (error) {
    console.error('Error searching groups:', error);
    res.status(500).json({ error: 'Failed to search groups' });
  }
});

// 獲取用戶的群族
router.get('/user/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const requestUserId = req.user?.id;
    
    // 只能查看自己的群族，除非是管理員
    if (requestUserId !== userId) {
      return res.status(403).json({ error: 'Can only view your own groups' });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    const result = await groupService.getUserGroups(userId, page, limit);
    res.json(result);
  } catch (error) {
    console.error('Error getting user groups:', error);
    res.status(500).json({ error: 'Failed to get user groups' });
  }
});

// 成員管理

// 邀請成員
router.post('/:groupId/invite', async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const request: GroupInviteRequest = {
      ...req.body,
      groupId
    };

    // 驗證邀請資訊
    if (!request.email && !request.userId) {
      return res.status(400).json({ error: 'Either email or userId is required' });
    }

    const invitation = await groupService.inviteMember(userId, request);
    
    if (!invitation) {
      return res.status(400).json({ error: 'Failed to create invitation' });
    }

    res.status(201).json(invitation);
  } catch (error) {
    console.error('Error inviting member:', error);
    res.status(500).json({ error: 'Failed to invite member' });
  }
});

// 接受邀請
router.post('/invite/:inviteCode/accept', async (req: Request, res: Response) => {
  try {
    const { inviteCode } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const success = await groupService.acceptInvitation(inviteCode, userId);
    
    if (!success) {
      return res.status(400).json({ error: 'Failed to accept invitation' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error accepting invitation:', error);
    res.status(500).json({ error: 'Failed to accept invitation' });
  }
});

// 拒絕邀請
router.post('/invite/:inviteCode/reject', async (req: Request, res: Response) => {
  try {
    const { inviteCode } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const success = await groupService.rejectInvitation(inviteCode, userId);
    
    if (!success) {
      return res.status(400).json({ error: 'Failed to reject invitation' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error rejecting invitation:', error);
    res.status(500).json({ error: 'Failed to reject invitation' });
  }
});

// 驗證邀請代碼
router.get('/invite/:inviteCode/validate', async (req: Request, res: Response) => {
  try {
    const { inviteCode } = req.params;
    
    const validation = await groupService.validateInviteCode(inviteCode);
    res.json(validation);
  } catch (error) {
    console.error('Error validating invite code:', error);
    res.status(500).json({ error: 'Failed to validate invite code' });
  }
});

// 獲取群族邀請列表
router.get('/:groupId/invitations', async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const invitations = await groupService.getGroupInvitations(groupId, userId);
    res.json(invitations);
  } catch (error) {
    console.error('Error getting group invitations:', error);
    res.status(500).json({ error: 'Failed to get group invitations' });
  }
});

// 取消邀請
router.delete('/invitation/:invitationId', async (req: Request, res: Response) => {
  try {
    const { invitationId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const success = await groupService.cancelInvitation(invitationId, userId);
    
    if (!success) {
      return res.status(404).json({ error: 'Invitation not found or permission denied' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error cancelling invitation:', error);
    res.status(500).json({ error: 'Failed to cancel invitation' });
  }
});

// 移除成員
router.delete('/:groupId/members/:targetUserId', async (req: Request, res: Response) => {
  try {
    const { groupId, targetUserId } = req.params;
    const adminUserId = req.user?.id;
    
    if (!adminUserId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const success = await groupService.removeMember(groupId, adminUserId, targetUserId);
    
    if (!success) {
      return res.status(403).json({ error: 'Permission denied or member not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error removing member:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// 更新成員
router.put('/:groupId/members/:targetUserId', async (req: Request, res: Response) => {
  try {
    const { groupId, targetUserId } = req.params;
    const adminUserId = req.user?.id;
    
    if (!adminUserId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const request: GroupMemberUpdateRequest = req.body;
    const updatedMember = await groupService.updateMember(groupId, adminUserId, targetUserId, request);
    
    if (!updatedMember) {
      return res.status(403).json({ error: 'Permission denied or member not found' });
    }

    res.json(updatedMember);
  } catch (error) {
    console.error('Error updating member:', error);
    res.status(500).json({ error: 'Failed to update member' });
  }
});

// 離開群族
router.post('/:groupId/leave', async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const success = await groupService.leaveGroup(groupId, userId);
    
    if (!success) {
      return res.status(400).json({ error: 'Cannot leave group' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error leaving group:', error);
    res.status(500).json({ error: 'Failed to leave group' });
  }
});

// 群族專屬暱稱管理

// 設定群族暱稱
router.put('/:groupId/nickname', async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { nickname } = req.body;
    
    if (typeof nickname !== 'string') {
      return res.status(400).json({ error: 'Nickname must be a string' });
    }

    const success = await groupService.setGroupNickname(groupId, userId, nickname);
    
    if (!success) {
      return res.status(400).json({ error: 'Failed to set group nickname' });
    }

    res.json({ success: true, nickname });
  } catch (error) {
    console.error('Error setting group nickname:', error);
    res.status(500).json({ error: 'Failed to set group nickname' });
  }
});

// 獲取群族暱稱
router.get('/:groupId/nickname/:userId', async (req: Request, res: Response) => {
  try {
    const { groupId, userId } = req.params;
    const requestUserId = req.user?.id;
    
    // 檢查查看權限
    if (requestUserId) {
      const permission = await groupService.canUserViewGroup(groupId, requestUserId);
      if (!permission.hasPermission) {
        return res.status(403).json({ error: permission.reason || 'Access denied' });
      }
    }

    const nickname = await groupService.getGroupNickname(groupId, userId);
    res.json({ nickname });
  } catch (error) {
    console.error('Error getting group nickname:', error);
    res.status(500).json({ error: 'Failed to get group nickname' });
  }
});

// 活動記錄

// 獲取群族活動記錄
router.get('/:groupId/activities', async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const userId = req.user?.id;
    
    // 檢查查看權限
    if (userId) {
      const permission = await groupService.canUserViewGroup(groupId, userId);
      if (!permission.hasPermission) {
        return res.status(403).json({ error: permission.reason || 'Access denied' });
      }
    } else {
      // 訪客不能查看活動記錄
      return res.status(401).json({ error: 'Authentication required' });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const activities = await groupService.getGroupActivities(groupId, page, limit);
    res.json(activities);
  } catch (error) {
    console.error('Error getting group activities:', error);
    res.status(500).json({ error: 'Failed to get group activities' });
  }
});

// 統計資訊

// 獲取群族統計
router.get('/:groupId/statistics', async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const userId = req.user?.id;
    
    // 檢查查看權限
    if (userId) {
      const permission = await groupService.canUserViewGroup(groupId, userId);
      if (!permission.hasPermission) {
        return res.status(403).json({ error: permission.reason || 'Access denied' });
      }
    }

    const statistics = await groupService.getGroupStatistics(groupId);
    
    if (!statistics) {
      return res.status(404).json({ error: 'Group not found' });
    }

    res.json(statistics);
  } catch (error) {
    console.error('Error getting group statistics:', error);
    res.status(500).json({ error: 'Failed to get group statistics' });
  }
});

// 權限檢查端點

// 檢查用戶權限
router.get('/:groupId/permissions/:userId', async (req: Request, res: Response) => {
  try {
    const { groupId, userId } = req.params;
    const requestUserId = req.user?.id;
    
    // 只能查看自己的權限，除非是群族管理員
    if (requestUserId !== userId) {
      const permission = await groupService.canUserManageGroup(groupId, requestUserId || '');
      if (!permission.hasPermission) {
        return res.status(403).json({ error: 'Can only view your own permissions' });
      }
    }

    const [viewPermission, managePermission, invitePermission, manageMembersPermission] = await Promise.all([
      groupService.canUserViewGroup(groupId, userId),
      groupService.canUserManageGroup(groupId, userId),
      groupService.canUserInviteMembers(groupId, userId),
      groupService.canUserManageMembers(groupId, userId)
    ]);

    res.json({
      canView: viewPermission.hasPermission,
      canManage: managePermission.hasPermission,
      canInvite: invitePermission.hasPermission,
      canManageMembers: manageMembersPermission.hasPermission
    });
  } catch (error) {
    console.error('Error checking permissions:', error);
    res.status(500).json({ error: 'Failed to check permissions' });
  }
});

export default router;