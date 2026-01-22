import { 
  NicknameValidationResult, 
  NicknameConflictInfo, 
  NicknameUpdateResult,
  NicknameValidationRules,
  DEFAULT_NICKNAME_RULES
} from '../types/nickname';
import { User } from '../types/user';

export interface NicknameService {
  validateNickname(nickname: string, rules?: NicknameValidationRules): NicknameValidationResult;
  checkNicknameConflict(nickname: string, userId: string, groupId?: string, users?: Map<string, User>): NicknameConflictInfo | null;
  generateNicknameSuggestions(baseNickname: string, users?: Map<string, User>): string[];
  setDefaultNickname(userId: string, nickname: string, users: Map<string, User>): NicknameUpdateResult;
  setGroupNickname(userId: string, groupId: string, nickname: string, users: Map<string, User>): NicknameUpdateResult;
  getUserNickname(userId: string, groupId?: string, users?: Map<string, User>): string | null;
}

export class NicknameServiceImpl implements NicknameService {
  private validationRules: NicknameValidationRules;

  constructor(rules?: NicknameValidationRules) {
    this.validationRules = rules || DEFAULT_NICKNAME_RULES;
  }

  validateNickname(nickname: string, rules?: NicknameValidationRules): NicknameValidationResult {
    const activeRules = rules || this.validationRules;

    // 檢查長度
    if (nickname.length < activeRules.minLength) {
      return {
        isValid: false,
        error: `暱稱長度不能少於 ${activeRules.minLength} 個字符`
      };
    }

    if (nickname.length > activeRules.maxLength) {
      return {
        isValid: false,
        error: `暱稱長度不能超過 ${activeRules.maxLength} 個字符`
      };
    }

    // 檢查字符規則
    if (!activeRules.allowedCharacters.test(nickname)) {
      return {
        isValid: false,
        error: '暱稱只能包含英文字母、數字、中文字符、底線和連字號'
      };
    }

    // 檢查保留名稱
    const lowerNickname = nickname.toLowerCase();
    if (activeRules.reservedNames.some(reserved => reserved.toLowerCase() === lowerNickname)) {
      return {
        isValid: false,
        error: '此暱稱為系統保留名稱，請選擇其他暱稱'
      };
    }

    // 基本的不當內容過濾（簡化版）
    if (activeRules.profanityFilter && this.containsProfanity(nickname)) {
      return {
        isValid: false,
        error: '暱稱包含不當內容，請選擇其他暱稱'
      };
    }

    return { isValid: true };
  }

  checkNicknameConflict(
    nickname: string, 
    userId: string, 
    groupId?: string, 
    users?: Map<string, User>
  ): NicknameConflictInfo | null {
    if (!users) return null;

    for (const [existingUserId, user] of users) {
      // 跳過自己
      if (existingUserId === userId) continue;

      // 檢查預設暱稱衝突
      if (user.defaultNickname && user.defaultNickname.toLowerCase() === nickname.toLowerCase()) {
        return {
          conflictType: 'default',
          conflictingUserId: existingUserId
        };
      }

      // 檢查群族暱稱衝突
      if (groupId && user.groupNicknames.has(groupId)) {
        const groupNickname = user.groupNicknames.get(groupId);
        if (groupNickname && groupNickname.toLowerCase() === nickname.toLowerCase()) {
          return {
            conflictType: 'group',
            conflictingUserId: existingUserId,
            groupId
          };
        }
      }
    }

    return null;
  }

  generateNicknameSuggestions(baseNickname: string, users?: Map<string, User>): string[] {
    const suggestions: string[] = [];
    const maxSuggestions = 5;

    // 生成數字後綴建議
    for (let i = 1; i <= maxSuggestions; i++) {
      const suggestion = `${baseNickname}${i}`;
      if (!users || !this.isNicknameInUse(suggestion, users)) {
        suggestions.push(suggestion);
      }
    }

    // 生成其他變化
    const variations = [
      `${baseNickname}_user`,
      `${baseNickname}_new`,
      `new_${baseNickname}`,
      `${baseNickname}123`,
      `${baseNickname}_2024`
    ];

    for (const variation of variations) {
      if (suggestions.length >= maxSuggestions) break;
      if (!users || !this.isNicknameInUse(variation, users)) {
        suggestions.push(variation);
      }
    }

    return suggestions.slice(0, maxSuggestions);
  }

  setDefaultNickname(userId: string, nickname: string, users: Map<string, User>): NicknameUpdateResult {
    // 驗證暱稱格式
    const validation = this.validateNickname(nickname);
    if (!validation.isValid) {
      return {
        success: false,
        error: validation.error
      };
    }

    // 檢查衝突
    const conflict = this.checkNicknameConflict(nickname, userId, undefined, users);
    if (conflict) {
      const suggestions = this.generateNicknameSuggestions(nickname, users);
      return {
        success: false,
        error: '此暱稱已被使用',
        conflict,
        suggestions
      };
    }

    // 設定暱稱
    const user = users.get(userId);
    if (!user) {
      return {
        success: false,
        error: '用戶不存在'
      };
    }

    user.defaultNickname = nickname;
    return {
      success: true,
      nickname
    };
  }

  setGroupNickname(userId: string, groupId: string, nickname: string, users: Map<string, User>): NicknameUpdateResult {
    // 如果暱稱為空，則刪除群族暱稱
    if (!nickname || nickname.trim() === '') {
      const user = users.get(userId);
      if (!user) {
        return {
          success: false,
          error: '用戶不存在'
        };
      }
      
      user.groupNicknames.delete(groupId);
      return {
        success: true,
        nickname: ''
      };
    }

    // 驗證暱稱格式
    const validation = this.validateNickname(nickname);
    if (!validation.isValid) {
      return {
        success: false,
        error: validation.error
      };
    }

    // 檢查群族內衝突
    const conflict = this.checkNicknameConflict(nickname, userId, groupId, users);
    if (conflict) {
      const suggestions = this.generateNicknameSuggestions(nickname, users);
      return {
        success: false,
        error: '此暱稱在群族中已被使用',
        conflict,
        suggestions
      };
    }

    // 設定群族暱稱
    const user = users.get(userId);
    if (!user) {
      return {
        success: false,
        error: '用戶不存在'
      };
    }

    user.groupNicknames.set(groupId, nickname);
    return {
      success: true,
      nickname
    };
  }

  getUserNickname(userId: string, groupId?: string, users?: Map<string, User>): string | null {
    if (!users) return null;

    const user = users.get(userId);
    if (!user) return null;

    // 如果指定群族，優先返回群族暱稱
    if (groupId && user.groupNicknames.has(groupId)) {
      return user.groupNicknames.get(groupId) || null;
    }

    // 返回預設暱稱
    return user.defaultNickname || null;
  }

  private containsProfanity(nickname: string): boolean {
    // 簡化的不當內容檢查，實際應用中應使用更完善的過濾系統
    const profanityList = ['fuck', 'shit', 'damn', '操', '幹', '靠'];
    const lowerNickname = nickname.toLowerCase();
    
    return profanityList.some(word => lowerNickname.includes(word));
  }

  private isNicknameInUse(nickname: string, users: Map<string, User>): boolean {
    for (const user of users.values()) {
      // 檢查預設暱稱
      if (user.defaultNickname && user.defaultNickname.toLowerCase() === nickname.toLowerCase()) {
        return true;
      }

      // 檢查所有群族暱稱
      for (const groupNickname of user.groupNicknames.values()) {
        if (groupNickname.toLowerCase() === nickname.toLowerCase()) {
          return true;
        }
      }
    }
    return false;
  }
}