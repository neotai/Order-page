import {
  Group,
  GroupMember,
  GroupInvitation,
  GroupCreateRequest,
  GroupUpdateRequest,
  GroupInviteRequest,
  GroupMemberUpdateRequest,
  GroupSearchQuery,
  GroupSearchResult,
  GroupValidationResult,
  InvitationValidationResult,
  GroupPermissionCheck,
  GroupActivity,
  GroupActivityType,
  GroupRole,
  InvitationStatus,
  DEFAULT_GROUP_SETTINGS,
  DEFAULT_MEMBER_PERMISSIONS,
  OWNER_PERMISSIONS,
  ADMIN_PERMISSIONS
} from '../types/group';
import { User } from '../types/user';
import { NicknameService } from './NicknameService';
import { UserManager } from '../managers/UserManager';

export interface GroupService {
  // 群族 CRUD 操作
  createGroup(userId: string, request: GroupCreateRequest): Promise<Group>;
  getGroupById(groupId: string): Promise<Group | null>;
  updateGroup(groupId: string, userId: string, request: GroupUpdateRequest): Promise<Group | null>;
  deleteGroup(groupId: string, userId: string): Promise<boolean>;
  
  // 群族搜尋和列表
  searchGroups(query: GroupSearchQuery, page?: number, limit?: number): Promise<GroupSearchResult>;
  getUserGroups(userId: string, page?: number, limit?: number): Promise<GroupSearchResult>;
  
  // 成員管理
  inviteMember(userId: string, request: GroupInviteRequest): Promise<GroupInvitation | null>;
  acceptInvitation(inviteCode: string, userId: string): Promise<boolean>;
  rejectInvitation(inviteCode: string, userId: string): Promise<boolean>;
  removeMember(groupId: string, adminUserId: string, targetUserId: string): Promise<boolean>;
  updateMember(groupId: string, adminUserId: string, targetUserId: string, request: GroupMemberUpdateRequest): Promise<GroupMember | null>;
  leaveGroup(groupId: string, userId: string): Promise<boolean>;
  
  // 權限檢查
  canUserViewGroup(groupId: string, userId: string): Promise<GroupPermissionCheck>;
  canUserManageGroup(groupId: string, userId: string): Promise<GroupPermissionCheck>;
  canUserInviteMembers(groupId: string, userId: string): Promise<GroupPermissionCheck>;
  canUserManageMembers(groupId: string, userId: string): Promise<GroupPermissionCheck>;
  
  // 邀請管理
  validateInviteCode(inviteCode: string): Promise<InvitationValidationResult>;
  getGroupInvitations(groupId: string, userId: string): Promise<GroupInvitation[]>;
  cancelInvitation(invitationId: string, userId: string): Promise<boolean>;
  
  // 群族專屬暱稱管理
  setGroupNickname(groupId: string, userId: string, nickname: string): Promise<boolean>;
  getGroupNickname(groupId: string, userId: string): Promise<string | null>;
  
  // 活動記錄
  recordActivity(activity: Omit<GroupActivity, 'id' | 'timestamp'>): Promise<void>;
  getGroupActivities(groupId: string, page?: number, limit?: number): Promise<GroupActivity[]>;
  
  // 統計和分析
  updateGroupStatistics(groupId: string): Promise<void>;
  getGroupStatistics(groupId: string): Promise<Group['statistics'] | null>;
}

export class GroupServiceImpl implements GroupService {
  private groups: Map<string, Group> = new Map();
  private invitations: Map<string, GroupInvitation> = new Map();
  private inviteCodeIndex: Map<string, string> = new Map(); // inviteCode -> invitationId
  private activities: Map<string, GroupActivity[]> = new Map(); // groupId -> activities
  private nicknameService?: NicknameService;
  private users?: Map<string, User>;
  private userManager?: UserManager;

  constructor(nicknameService?: NicknameService, users?: Map<string, User>, userManager?: UserManager) {
    this.nicknameService = nicknameService;
    this.users = users;
    this.userManager = userManager;
    
    // 啟動定期清理過期邀請的任務
    this.startInvitationCleanup();
  }

  async createGroup(userId: string, request: GroupCreateRequest): Promise<Group> {
    const groupId = this.generateId();
    const now = new Date();

    // 創建群族創建者成員記錄
    const ownerMember: GroupMember = {
      userId,
      role: 'owner',
      joinedAt: now,
      lastActiveAt: now,
      permissions: OWNER_PERMISSIONS
    };

    const group: Group = {
      id: groupId,
      name: request.name,
      description: request.description,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
      settings: {
        ...DEFAULT_GROUP_SETTINGS,
        ...request.settings
      },
      members: [ownerMember],
      invitations: [],
      statistics: {
        totalMembers: 1,
        activeMembers: 1,
        totalOrders: 0,
        totalMessages: 0,
        lastActivityAt: now
      }
    };

    this.groups.set(groupId, group);

    // 添加用戶群族成員關係
    if (this.userManager) {
      await this.userManager.addGroupMembership(userId, groupId);
    }

    // 記錄活動
    await this.recordActivity({
      groupId,
      userId,
      userNickname: await this.getUserDisplayName(userId, groupId),
      type: 'group_created',
      description: `群族 "${request.name}" 已建立`,
      metadata: { groupName: request.name }
    });

    console.log(`Group created: ${groupId} by user ${userId}`);
    return group;
  }

  async getGroupById(groupId: string): Promise<Group | null> {
    return this.groups.get(groupId) || null;
  }

  async updateGroup(groupId: string, userId: string, request: GroupUpdateRequest): Promise<Group | null> {
    const group = this.groups.get(groupId);
    if (!group) {
      return null;
    }

    // 檢查權限
    const permission = await this.canUserManageGroup(groupId, userId);
    if (!permission.hasPermission) {
      return null;
    }

    const updatedGroup: Group = {
      ...group,
      ...request,
      id: groupId, // 確保 ID 不被覆蓋
      createdBy: group.createdBy, // 確保創建者不被覆蓋
      createdAt: group.createdAt, // 確保創建時間不被覆蓋
      updatedAt: new Date(),
      settings: {
        ...group.settings,
        ...request.settings
      }
    };

    this.groups.set(groupId, updatedGroup);

    // 記錄活動
    await this.recordActivity({
      groupId,
      userId,
      userNickname: await this.getUserDisplayName(userId, groupId),
      type: 'settings_updated',
      description: '群族設定已更新',
      metadata: { changes: request }
    });

    return updatedGroup;
  }

  async deleteGroup(groupId: string, userId: string): Promise<boolean> {
    const group = this.groups.get(groupId);
    if (!group || group.createdBy !== userId) {
      return false;
    }

    // 刪除群族相關的所有邀請
    const groupInvitations = Array.from(this.invitations.values())
      .filter(inv => inv.groupId === groupId);
    
    for (const invitation of groupInvitations) {
      this.invitations.delete(invitation.id);
      this.inviteCodeIndex.delete(invitation.inviteCode);
    }

    // 刪除活動記錄
    this.activities.delete(groupId);

    // 刪除群族
    this.groups.delete(groupId);

    console.log(`Group ${groupId} deleted by user ${userId}`);
    return true;
  }

  async searchGroups(query: GroupSearchQuery, page: number = 1, limit: number = 10): Promise<GroupSearchResult> {
    const allGroups = Array.from(this.groups.values());
    
    let filteredGroups = allGroups.filter(group => {
      // 創建者篩選
      if (query.createdBy && group.createdBy !== query.createdBy) {
        return false;
      }

      // 成員篩選
      if (query.memberId) {
        const isMember = group.members.some(member => member.userId === query.memberId);
        if (!isMember) return false;
      }

      // 私人群族篩選
      if (query.isPrivate !== undefined && group.settings.isPrivate !== query.isPrivate) {
        return false;
      }

      // 成員數量篩選
      if (query.minMembers !== undefined && group.statistics.totalMembers < query.minMembers) {
        return false;
      }
      if (query.maxMembers !== undefined && group.statistics.totalMembers > query.maxMembers) {
        return false;
      }

      // 關鍵字搜尋
      if (query.keyword) {
        const keyword = query.keyword.toLowerCase();
        const matchesName = group.name.toLowerCase().includes(keyword);
        const matchesDescription = group.description?.toLowerCase().includes(keyword);
        
        if (!matchesName && !matchesDescription) {
          return false;
        }
      }

      // 日期範圍篩選
      if (query.dateRange) {
        const groupDate = group.createdAt;
        if (groupDate < query.dateRange.start || groupDate > query.dateRange.end) {
          return false;
        }
      }

      return true;
    });

    // 排序：最新的在前面
    filteredGroups.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    // 分頁
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedGroups = filteredGroups.slice(startIndex, endIndex);

    return {
      groups: paginatedGroups,
      total: filteredGroups.length,
      page,
      limit
    };
  }

  async getUserGroups(userId: string, page: number = 1, limit: number = 10): Promise<GroupSearchResult> {
    return this.searchGroups({ memberId: userId }, page, limit);
  }

  async inviteMember(userId: string, request: GroupInviteRequest): Promise<GroupInvitation | null> {
    const group = this.groups.get(request.groupId);
    if (!group) {
      return null;
    }

    // 檢查邀請權限
    const permission = await this.canUserInviteMembers(request.groupId, userId);
    if (!permission.hasPermission) {
      return null;
    }

    // 檢查是否已經是成員
    if (request.userId) {
      const existingMember = group.members.find(member => member.userId === request.userId);
      if (existingMember) {
        return null; // 已經是成員
      }
    }

    // 檢查是否已有待處理的邀請
    const existingInvitation = Array.from(this.invitations.values()).find(inv => 
      inv.groupId === request.groupId && 
      inv.status === 'pending' &&
      ((request.email && inv.invitedEmail === request.email) ||
       (request.userId && inv.invitedUserId === request.userId))
    );

    if (existingInvitation) {
      return null; // 已有待處理邀請
    }

    const invitationId = this.generateId();
    const inviteCode = this.generateInviteCode();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7天後過期

    const invitation: GroupInvitation = {
      id: invitationId,
      groupId: request.groupId,
      invitedBy: userId,
      invitedEmail: request.email,
      invitedUserId: request.userId,
      inviteCode,
      status: 'pending',
      createdAt: now,
      expiresAt,
      message: request.message
    };

    this.invitations.set(invitationId, invitation);
    this.inviteCodeIndex.set(inviteCode, invitationId);

    // 記錄活動
    await this.recordActivity({
      groupId: request.groupId,
      userId,
      userNickname: await this.getUserDisplayName(userId, request.groupId),
      type: 'member_invited',
      description: `邀請了新成員: ${request.email || request.userId}`,
      metadata: { invitedEmail: request.email, invitedUserId: request.userId }
    });

    console.log(`Member invited to group ${request.groupId}: ${request.email || request.userId}`);
    return invitation;
  }

  async acceptInvitation(inviteCode: string, userId: string): Promise<boolean> {
    const validation = await this.validateInviteCode(inviteCode);
    if (!validation.isValid || !validation.canAccept || !validation.invitation || !validation.group) {
      return false;
    }

    const invitation = validation.invitation;
    const group = validation.group;

    // 檢查用戶是否有權限接受此邀請
    if (invitation.invitedUserId && invitation.invitedUserId !== userId) {
      return false;
    }

    // 檢查是否已經是成員
    const existingMember = group.members.find(member => member.userId === userId);
    if (existingMember) {
      return false;
    }

    // 創建新成員
    const now = new Date();
    const newMember: GroupMember = {
      userId,
      role: 'member',
      joinedAt: now,
      lastActiveAt: now,
      permissions: DEFAULT_MEMBER_PERMISSIONS
    };

    // 更新群族
    const updatedGroup: Group = {
      ...group,
      members: [...group.members, newMember],
      updatedAt: now
    };

    this.groups.set(group.id, updatedGroup);

    // 添加用戶群族成員關係
    if (this.userManager) {
      await this.userManager.addGroupMembership(userId, group.id);
    }

    // 更新邀請狀態
    const updatedInvitation: GroupInvitation = {
      ...invitation,
      status: 'accepted',
      acceptedAt: now
    };

    this.invitations.set(invitation.id, updatedInvitation);

    // 更新統計
    await this.updateGroupStatistics(group.id);

    // 記錄活動
    await this.recordActivity({
      groupId: group.id,
      userId,
      userNickname: await this.getUserDisplayName(userId, group.id),
      type: 'member_joined',
      description: '加入了群族',
      metadata: { invitationId: invitation.id }
    });

    console.log(`User ${userId} accepted invitation and joined group ${group.id}`);
    return true;
  }

  async rejectInvitation(inviteCode: string, userId: string): Promise<boolean> {
    const validation = await this.validateInviteCode(inviteCode);
    if (!validation.isValid || !validation.invitation) {
      return false;
    }

    const invitation = validation.invitation;

    // 檢查用戶是否有權限拒絕此邀請
    if (invitation.invitedUserId && invitation.invitedUserId !== userId) {
      return false;
    }

    // 更新邀請狀態
    const updatedInvitation: GroupInvitation = {
      ...invitation,
      status: 'rejected',
      rejectedAt: new Date()
    };

    this.invitations.set(invitation.id, updatedInvitation);

    console.log(`User ${userId} rejected invitation ${invitation.id}`);
    return true;
  }

  async removeMember(groupId: string, adminUserId: string, targetUserId: string): Promise<boolean> {
    const group = this.groups.get(groupId);
    if (!group) {
      return false;
    }

    // 檢查管理權限
    const permission = await this.canUserManageMembers(groupId, adminUserId);
    if (!permission.hasPermission) {
      return false;
    }

    // 不能移除群族創建者
    if (targetUserId === group.createdBy) {
      return false;
    }

    // 找到要移除的成員
    const memberIndex = group.members.findIndex(member => member.userId === targetUserId);
    if (memberIndex === -1) {
      return false;
    }

    const removedMember = group.members[memberIndex];

    // 移除成員
    const updatedMembers = [...group.members];
    updatedMembers.splice(memberIndex, 1);

    const updatedGroup: Group = {
      ...group,
      members: updatedMembers,
      updatedAt: new Date()
    };

    this.groups.set(groupId, updatedGroup);

    // 移除用戶群族成員關係
    if (this.userManager) {
      await this.userManager.removeGroupMembership(targetUserId, groupId);
    }

    // 更新統計
    await this.updateGroupStatistics(groupId);

    // 記錄活動
    await this.recordActivity({
      groupId,
      userId: adminUserId,
      userNickname: await this.getUserDisplayName(adminUserId, groupId),
      type: 'member_left',
      description: `移除了成員: ${await this.getUserDisplayName(targetUserId, groupId)}`,
      metadata: { removedUserId: targetUserId, removedByAdmin: true }
    });

    console.log(`Member ${targetUserId} removed from group ${groupId} by admin ${adminUserId}`);
    return true;
  }

  async updateMember(groupId: string, adminUserId: string, targetUserId: string, request: GroupMemberUpdateRequest): Promise<GroupMember | null> {
    const group = this.groups.get(groupId);
    if (!group) {
      return null;
    }

    // 檢查管理權限
    const permission = await this.canUserManageMembers(groupId, adminUserId);
    if (!permission.hasPermission) {
      return null;
    }

    // 不能修改群族創建者
    if (targetUserId === group.createdBy && request.role && request.role !== 'owner') {
      return null;
    }

    // 找到要更新的成員
    const memberIndex = group.members.findIndex(member => member.userId === targetUserId);
    if (memberIndex === -1) {
      return null;
    }

    const existingMember = group.members[memberIndex];

    // 更新成員資訊
    const updatedMember: GroupMember = {
      ...existingMember,
      ...request,
      userId: targetUserId, // 確保用戶ID不被覆蓋
      joinedAt: existingMember.joinedAt, // 確保加入時間不被覆蓋
      permissions: request.permissions ? 
        { ...existingMember.permissions, ...request.permissions } : 
        existingMember.permissions
    };

    // 根據角色設定權限
    if (request.role) {
      switch (request.role) {
        case 'owner':
          updatedMember.permissions = OWNER_PERMISSIONS;
          break;
        case 'admin':
          updatedMember.permissions = ADMIN_PERMISSIONS;
          break;
        case 'member':
          updatedMember.permissions = DEFAULT_MEMBER_PERMISSIONS;
          break;
      }
    }

    // 更新群族
    const updatedMembers = [...group.members];
    updatedMembers[memberIndex] = updatedMember;

    const updatedGroup: Group = {
      ...group,
      members: updatedMembers,
      updatedAt: new Date()
    };

    this.groups.set(groupId, updatedGroup);

    // 記錄活動
    if (request.role && request.role !== existingMember.role) {
      await this.recordActivity({
        groupId,
        userId: adminUserId,
        userNickname: await this.getUserDisplayName(adminUserId, groupId),
        type: 'member_role_changed',
        description: `更改了 ${await this.getUserDisplayName(targetUserId, groupId)} 的角色: ${existingMember.role} → ${request.role}`,
        metadata: { 
          targetUserId, 
          oldRole: existingMember.role, 
          newRole: request.role 
        }
      });
    }

    return updatedMember;
  }

  async leaveGroup(groupId: string, userId: string): Promise<boolean> {
    const group = this.groups.get(groupId);
    if (!group) {
      return false;
    }

    // 群族創建者不能離開群族
    if (userId === group.createdBy) {
      return false;
    }

    // 找到成員
    const memberIndex = group.members.findIndex(member => member.userId === userId);
    if (memberIndex === -1) {
      return false;
    }

    // 移除成員
    const updatedMembers = [...group.members];
    updatedMembers.splice(memberIndex, 1);

    const updatedGroup: Group = {
      ...group,
      members: updatedMembers,
      updatedAt: new Date()
    };

    this.groups.set(groupId, updatedGroup);

    // 移除用戶群族成員關係
    if (this.userManager) {
      await this.userManager.removeGroupMembership(userId, groupId);
    }

    // 更新統計
    await this.updateGroupStatistics(groupId);

    // 記錄活動
    await this.recordActivity({
      groupId,
      userId,
      userNickname: await this.getUserDisplayName(userId, groupId),
      type: 'member_left',
      description: '離開了群族',
      metadata: { leftVoluntarily: true }
    });

    console.log(`User ${userId} left group ${groupId}`);
    return true;
  }

  async canUserViewGroup(groupId: string, userId: string): Promise<GroupPermissionCheck> {
    const group = this.groups.get(groupId);
    if (!group) {
      return { hasPermission: false, reason: 'Group not found' };
    }

    // 檢查是否為成員
    const member = group.members.find(m => m.userId === userId);
    if (member) {
      return { hasPermission: true };
    }

    // 如果不是私人群族，任何人都可以查看
    if (!group.settings.isPrivate) {
      return { hasPermission: true };
    }

    return { hasPermission: false, reason: 'Private group - members only' };
  }

  async canUserManageGroup(groupId: string, userId: string): Promise<GroupPermissionCheck> {
    const group = this.groups.get(groupId);
    if (!group) {
      return { hasPermission: false, reason: 'Group not found' };
    }

    const member = group.members.find(m => m.userId === userId);
    if (!member) {
      return { hasPermission: false, reason: 'Not a member' };
    }

    if (member.role === 'owner' || member.role === 'admin') {
      return { hasPermission: true };
    }

    return { 
      hasPermission: false, 
      reason: 'Insufficient permissions',
      requiredRole: 'admin'
    };
  }

  async canUserInviteMembers(groupId: string, userId: string): Promise<GroupPermissionCheck> {
    const group = this.groups.get(groupId);
    if (!group) {
      return { hasPermission: false, reason: 'Group not found' };
    }

    const member = group.members.find(m => m.userId === userId);
    if (!member) {
      return { hasPermission: false, reason: 'Not a member' };
    }

    if (!group.settings.allowMemberInvites && member.role === 'member') {
      return { 
        hasPermission: false, 
        reason: 'Member invites not allowed',
        requiredRole: 'admin'
      };
    }

    if (member.permissions.canInviteMembers) {
      return { hasPermission: true };
    }

    return { 
      hasPermission: false, 
      reason: 'No invite permission'
    };
  }

  async canUserManageMembers(groupId: string, userId: string): Promise<GroupPermissionCheck> {
    const group = this.groups.get(groupId);
    if (!group) {
      return { hasPermission: false, reason: 'Group not found' };
    }

    const member = group.members.find(m => m.userId === userId);
    if (!member) {
      return { hasPermission: false, reason: 'Not a member' };
    }

    if (member.permissions.canManageMembers) {
      return { hasPermission: true };
    }

    return { 
      hasPermission: false, 
      reason: 'No member management permission',
      requiredRole: 'admin'
    };
  }

  async validateInviteCode(inviteCode: string): Promise<InvitationValidationResult> {
    const invitationId = this.inviteCodeIndex.get(inviteCode);
    if (!invitationId) {
      return {
        isValid: false,
        canAccept: false,
        error: 'Invalid invite code'
      };
    }

    const invitation = this.invitations.get(invitationId);
    if (!invitation) {
      return {
        isValid: false,
        canAccept: false,
        error: 'Invitation not found'
      };
    }

    // 檢查邀請狀態
    if (invitation.status !== 'pending') {
      return {
        isValid: true,
        canAccept: false,
        error: `Invitation is ${invitation.status}`,
        invitation
      };
    }

    // 檢查是否過期
    if (invitation.expiresAt <= new Date()) {
      // 更新邀請狀態為過期
      const expiredInvitation: GroupInvitation = {
        ...invitation,
        status: 'expired'
      };
      this.invitations.set(invitationId, expiredInvitation);

      return {
        isValid: true,
        canAccept: false,
        error: 'Invitation has expired',
        invitation: expiredInvitation
      };
    }

    const group = this.groups.get(invitation.groupId);
    if (!group) {
      return {
        isValid: true,
        canAccept: false,
        error: 'Group not found',
        invitation
      };
    }

    return {
      isValid: true,
      canAccept: true,
      invitation,
      group
    };
  }

  async getGroupInvitations(groupId: string, userId: string): Promise<GroupInvitation[]> {
    // 檢查權限
    const permission = await this.canUserManageGroup(groupId, userId);
    if (!permission.hasPermission) {
      return [];
    }

    return Array.from(this.invitations.values())
      .filter(inv => inv.groupId === groupId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async cancelInvitation(invitationId: string, userId: string): Promise<boolean> {
    const invitation = this.invitations.get(invitationId);
    if (!invitation) {
      return false;
    }

    // 檢查權限（只有邀請者或群族管理員可以取消）
    const group = this.groups.get(invitation.groupId);
    if (!group) {
      return false;
    }

    const isInviter = invitation.invitedBy === userId;
    const permission = await this.canUserManageGroup(invitation.groupId, userId);
    
    if (!isInviter && !permission.hasPermission) {
      return false;
    }

    // 只能取消待處理的邀請
    if (invitation.status !== 'pending') {
      return false;
    }

    // 刪除邀請
    this.invitations.delete(invitationId);
    this.inviteCodeIndex.delete(invitation.inviteCode);

    console.log(`Invitation ${invitationId} cancelled by user ${userId}`);
    return true;
  }

  async setGroupNickname(groupId: string, userId: string, nickname: string): Promise<boolean> {
    const group = this.groups.get(groupId);
    if (!group) {
      return false;
    }

    // 檢查是否為成員
    const memberIndex = group.members.findIndex(member => member.userId === userId);
    if (memberIndex === -1) {
      return false;
    }

    // 使用暱稱服務進行驗證和設定
    if (this.nicknameService && this.users) {
      const result = await this.nicknameService.setGroupNickname(userId, groupId, nickname, this.users);
      if (!result.success) {
        return false;
      }
    }

    // 更新群族成員的暱稱
    const updatedMembers = [...group.members];
    updatedMembers[memberIndex] = {
      ...updatedMembers[memberIndex],
      nickname: nickname || undefined
    };

    const updatedGroup: Group = {
      ...group,
      members: updatedMembers,
      updatedAt: new Date()
    };

    this.groups.set(groupId, updatedGroup);

    console.log(`Group nickname set for user ${userId} in group ${groupId}: ${nickname}`);
    return true;
  }

  async getGroupNickname(groupId: string, userId: string): Promise<string | null> {
    const group = this.groups.get(groupId);
    if (!group) {
      return null;
    }

    const member = group.members.find(member => member.userId === userId);
    if (!member) {
      return null;
    }

    // 優先返回群族專屬暱稱
    if (member.nickname) {
      return member.nickname;
    }

    // 使用暱稱服務獲取暱稱
    if (this.nicknameService && this.users) {
      return await this.nicknameService.getUserNickname(userId, groupId, this.users);
    }

    return null;
  }

  async recordActivity(activity: Omit<GroupActivity, 'id' | 'timestamp'>): Promise<void> {
    const activityRecord: GroupActivity = {
      ...activity,
      id: this.generateId(),
      timestamp: new Date()
    };

    const groupActivities = this.activities.get(activity.groupId) || [];
    groupActivities.push(activityRecord);
    
    // 保留最近100條活動記錄
    if (groupActivities.length > 100) {
      groupActivities.splice(0, groupActivities.length - 100);
    }
    
    this.activities.set(activity.groupId, groupActivities);
  }

  async getGroupActivities(groupId: string, page: number = 1, limit: number = 20): Promise<GroupActivity[]> {
    const activities = this.activities.get(groupId) || [];
    
    // 按時間倒序排列
    const sortedActivities = activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    // 分頁
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    
    return sortedActivities.slice(startIndex, endIndex);
  }

  async updateGroupStatistics(groupId: string): Promise<void> {
    const group = this.groups.get(groupId);
    if (!group) {
      return;
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // 計算活躍成員（最近30天有活動）
    const activeMembers = group.members.filter(member => 
      member.lastActiveAt >= thirtyDaysAgo
    ).length;

    const updatedStatistics = {
      totalMembers: group.members.length,
      activeMembers,
      totalOrders: group.statistics.totalOrders, // 這個需要從訂單服務獲取
      totalMessages: group.statistics.totalMessages, // 這個需要從訊息服務獲取
      lastActivityAt: now
    };

    const updatedGroup: Group = {
      ...group,
      statistics: updatedStatistics,
      updatedAt: now
    };

    this.groups.set(groupId, updatedGroup);
  }

  async getGroupStatistics(groupId: string): Promise<Group['statistics'] | null> {
    const group = this.groups.get(groupId);
    return group ? group.statistics : null;
  }

  private async getUserDisplayName(userId: string, groupId?: string): Promise<string> {
    if (this.nicknameService && this.users) {
      const nickname = await this.nicknameService.getUserNickname(userId, groupId, this.users);
      if (nickname) {
        return nickname;
      }
    }

    // 回退到用戶ID
    return userId;
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
  }

  private generateInviteCode(): string {
    // 生成8位字母數字組合的邀請代碼
    let code: string;
    do {
      code = Math.random().toString(36).substring(2, 10).toUpperCase();
    } while (this.inviteCodeIndex.has(code)); // 確保唯一性
    
    return code;
  }

  private startInvitationCleanup(): void {
    // 每小時清理一次過期邀請
    setInterval(() => {
      try {
        this.cleanupExpiredInvitations();
      } catch (error) {
        console.error('Error cleaning up expired invitations:', error);
      }
    }, 60 * 60 * 1000); // 1小時
  }

  private cleanupExpiredInvitations(): void {
    const now = new Date();
    const expiredInvitations: string[] = [];

    for (const [invitationId, invitation] of this.invitations.entries()) {
      if (invitation.status === 'pending' && invitation.expiresAt <= now) {
        // 更新狀態為過期
        const expiredInvitation: GroupInvitation = {
          ...invitation,
          status: 'expired'
        };
        this.invitations.set(invitationId, expiredInvitation);
        expiredInvitations.push(invitationId);
      }
    }

    if (expiredInvitations.length > 0) {
      console.log(`Marked ${expiredInvitations.length} invitations as expired`);
    }
  }

  // 測試和調試方法
  getGroup(groupId: string): Group | undefined {
    return this.groups.get(groupId);
  }

  getInvitation(invitationId: string): GroupInvitation | undefined {
    return this.invitations.get(invitationId);
  }
}