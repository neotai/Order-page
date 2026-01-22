import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { UserManagerImpl } from '../managers/UserManager';
import jwt from 'jsonwebtoken';

export interface SocketUser {
  id: string;
  email?: string;
  defaultNickname?: string;
  isGuest: boolean;
  guestId?: string;
}

export interface AuthenticatedSocket extends Socket {
  user?: SocketUser;
}

export class WebSocketService {
  private io: SocketIOServer;
  private userManager: UserManagerImpl;
  private connectedUsers: Map<string, AuthenticatedSocket> = new Map();
  private userRooms: Map<string, Set<string>> = new Map(); // userId -> Set of room names

  constructor(server: HTTPServer, userManager: UserManagerImpl) {
    this.userManager = userManager;
    this.io = new SocketIOServer(server, {
      cors: {
        origin: "*", // 在生產環境中應該設定具體的域名
        methods: ["GET", "POST"]
      }
    });

    this.setupMiddleware();
    this.setupEventHandlers();
  }

  private setupMiddleware() {
    // 認證中間件
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
        
        if (token) {
          // 嘗試驗證 JWT token
          try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as any;
            const user = await this.userManager.getUserById(decoded.userId);
            
            if (user) {
              socket.user = {
                id: user.id,
                email: user.email,
                defaultNickname: user.defaultNickname,
                isGuest: false
              };
            } else {
              throw new Error('User not found');
            }
          } catch (jwtError) {
            // JWT 驗證失敗，檢查是否為訪客
            const guestId = socket.handshake.auth.guestId;
            if (guestId) {
              socket.user = {
                id: guestId,
                isGuest: true,
                guestId: guestId
              };
            } else {
              return next(new Error('Authentication failed'));
            }
          }
        } else {
          // 沒有 token，檢查是否為訪客
          const guestId = socket.handshake.auth.guestId;
          if (guestId) {
            socket.user = {
              id: guestId,
              isGuest: true,
              guestId: guestId
            };
          } else {
            return next(new Error('Authentication required'));
          }
        }

        next();
      } catch (error) {
        console.error('Socket authentication error:', error);
        next(new Error('Authentication failed'));
      }
    });
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket: AuthenticatedSocket) => {
      console.log(`用戶連接: ${socket.user?.id} (${socket.user?.isGuest ? '訪客' : '註冊用戶'})`);
      
      // 儲存連接的用戶
      if (socket.user) {
        this.connectedUsers.set(socket.user.id, socket);
        
        // 初始化用戶房間集合
        if (!this.userRooms.has(socket.user.id)) {
          this.userRooms.set(socket.user.id, new Set());
        }
      }

      // 加入房間事件
      socket.on('join-room', (roomId: string) => {
        this.joinRoom(socket, roomId);
      });

      // 離開房間事件
      socket.on('leave-room', (roomId: string) => {
        this.leaveRoom(socket, roomId);
      });

      // 發送訊息到房間
      socket.on('send-message', (data: { roomId: string; message: any }) => {
        this.sendMessageToRoom(socket, data.roomId, data.message);
      });

      // 訂單相關事件
      socket.on('join-order', (orderId: string) => {
        this.joinOrderRoom(socket, orderId);
      });

      socket.on('leave-order', (orderId: string) => {
        this.leaveOrderRoom(socket, orderId);
      });

      // 群族相關事件
      socket.on('join-group', (groupId: string) => {
        this.joinGroupRoom(socket, groupId);
      });

      socket.on('leave-group', (groupId: string) => {
        this.leaveGroupRoom(socket, groupId);
      });

      // 斷線處理
      socket.on('disconnect', () => {
        this.handleDisconnect(socket);
      });

      // 發送連接成功訊息
      socket.emit('connected', {
        userId: socket.user?.id,
        isGuest: socket.user?.isGuest,
        timestamp: new Date().toISOString()
      });
    });
  }

  // 房間管理方法
  public joinRoom(socket: AuthenticatedSocket, roomId: string) {
    if (!socket.user) return;

    socket.join(roomId);
    const userRooms = this.userRooms.get(socket.user.id);
    if (userRooms) {
      userRooms.add(roomId);
    }

    console.log(`用戶 ${socket.user.id} 加入房間 ${roomId}`);
    
    // 通知房間內其他用戶
    socket.to(roomId).emit('user-joined', {
      userId: socket.user.id,
      isGuest: socket.user.isGuest,
      nickname: socket.user.defaultNickname,
      timestamp: new Date().toISOString()
    });

    // 確認加入成功
    socket.emit('room-joined', {
      roomId,
      timestamp: new Date().toISOString()
    });
  }

  public leaveRoom(socket: AuthenticatedSocket, roomId: string) {
    if (!socket.user) return;

    socket.leave(roomId);
    const userRooms = this.userRooms.get(socket.user.id);
    if (userRooms) {
      userRooms.delete(roomId);
    }

    console.log(`用戶 ${socket.user.id} 離開房間 ${roomId}`);
    
    // 通知房間內其他用戶
    socket.to(roomId).emit('user-left', {
      userId: socket.user.id,
      isGuest: socket.user.isGuest,
      nickname: socket.user.defaultNickname,
      timestamp: new Date().toISOString()
    });

    // 確認離開成功
    socket.emit('room-left', {
      roomId,
      timestamp: new Date().toISOString()
    });
  }

  // 訂單房間管理
  public joinOrderRoom(socket: AuthenticatedSocket, orderId: string) {
    const roomId = `order:${orderId}`;
    this.joinRoom(socket, roomId);
  }

  public leaveOrderRoom(socket: AuthenticatedSocket, orderId: string) {
    const roomId = `order:${orderId}`;
    this.leaveRoom(socket, roomId);
  }

  // 群族房間管理
  public joinGroupRoom(socket: AuthenticatedSocket, groupId: string) {
    const roomId = `group:${groupId}`;
    this.joinRoom(socket, roomId);
  }

  public leaveGroupRoom(socket: AuthenticatedSocket, groupId: string) {
    const roomId = `group:${groupId}`;
    this.leaveRoom(socket, roomId);
  }

  // 發送訊息到房間
  public sendMessageToRoom(socket: AuthenticatedSocket, roomId: string, message: any) {
    if (!socket.user) return;

    const messageData = {
      ...message,
      senderId: socket.user.id,
      senderNickname: socket.user.defaultNickname,
      isGuest: socket.user.isGuest,
      timestamp: new Date().toISOString()
    };

    // 發送給房間內所有用戶（包括發送者）
    this.io.to(roomId).emit('message', messageData);
    
    console.log(`用戶 ${socket.user.id} 在房間 ${roomId} 發送訊息`);
  }

  // 廣播事件到特定房間
  public broadcastToRoom(roomId: string, event: string, data: any) {
    this.io.to(roomId).emit(event, {
      ...data,
      timestamp: new Date().toISOString()
    });
  }

  // 廣播訂單更新
  public broadcastOrderUpdate(orderId: string, updateData: any) {
    const roomId = `order:${orderId}`;
    this.broadcastToRoom(roomId, 'order-updated', {
      orderId,
      ...updateData
    });
  }

  // 廣播參與者加入/離開
  public broadcastParticipantUpdate(orderId: string, participantData: any, action: 'joined' | 'left') {
    const roomId = `order:${orderId}`;
    this.broadcastToRoom(roomId, 'participant-update', {
      orderId,
      action,
      participant: participantData
    });
  }

  // 廣播群族訊息
  public broadcastGroupMessage(groupId: string, messageData: any) {
    const roomId = `group:${groupId}`;
    this.broadcastToRoom(roomId, 'group-message', {
      groupId,
      ...messageData
    });
  }

  // 發送給特定用戶
  public sendToUser(userId: string, event: string, data: any) {
    const socket = this.connectedUsers.get(userId);
    if (socket) {
      socket.emit(event, {
        ...data,
        timestamp: new Date().toISOString()
      });
    }
  }

  // 處理用戶斷線
  private handleDisconnect(socket: AuthenticatedSocket) {
    if (!socket.user) return;

    console.log(`用戶斷線: ${socket.user.id}`);
    
    // 從連接用戶列表中移除
    this.connectedUsers.delete(socket.user.id);
    
    // 通知所有用戶所在的房間
    const userRooms = this.userRooms.get(socket.user.id);
    if (userRooms) {
      userRooms.forEach(roomId => {
        socket.to(roomId).emit('user-disconnected', {
          userId: socket.user?.id,
          isGuest: socket.user?.isGuest,
          nickname: socket.user?.defaultNickname,
          timestamp: new Date().toISOString()
        });
      });
      
      // 清空用戶房間記錄
      userRooms.clear();
    }
  }

  // 獲取房間內的用戶列表
  public async getRoomUsers(roomId: string): Promise<SocketUser[]> {
    const sockets = await this.io.in(roomId).fetchSockets();
    return sockets.map(socket => (socket as AuthenticatedSocket).user).filter(Boolean) as SocketUser[];
  }

  // 獲取連接的用戶數量
  public getConnectedUsersCount(): number {
    return this.connectedUsers.size;
  }

  // 獲取房間數量
  public getRoomCount(): number {
    return this.io.sockets.adapter.rooms.size;
  }

  // 獲取服務狀態
  public getStatus() {
    return {
      connectedUsers: this.connectedUsers.size,
      totalRooms: this.io.sockets.adapter.rooms.size,
      isActive: true
    };
  }

  // 關閉服務
  public close() {
    this.io.close();
  }
}