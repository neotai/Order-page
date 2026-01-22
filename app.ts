import express from 'express';
import cors from 'cors';
import path from 'path';
import { Server as HTTPServer } from 'http';
import { UserManagerImpl } from './managers/UserManager';
import { AuthServiceImpl } from './services/AuthService';
import { GoogleAuthServiceImpl } from './services/GoogleAuthService';
import { GuestService } from './services/GuestService';
import { NicknameServiceImpl } from './services/NicknameService';
import { MenuServiceImpl } from './services/MenuService';
import { OrderServiceImpl } from './services/OrderService';
import { ParticipantServiceImpl } from './services/ParticipantService';
import { OrderSchedulerImpl } from './services/OrderScheduler';
import { WebSocketService } from './services/WebSocketService';
import { createAuthRouter } from './routes/auth';
import { createNicknameRouter } from './routes/nickname';
import { createMenuRouter } from './routes/menu';
import { createOrderRouter } from './routes/order';
import { createParticipantRouter } from './routes/participant';
import { createCommunityRouter } from './routes/community';
import { GroupServiceImpl } from './services/GroupService';
import { GroupMessageServiceImpl } from './services/GroupMessageService';
import groupRouter from './routes/group';
import { createGroupMessageRouter } from './routes/groupMessage';
import { createWebSocketRouter } from './routes/websocket';
import { createSystemRouter } from './routes/system';
import { createAuthMiddleware, createOptionalAuthMiddleware } from './middleware/auth';
import { errorHandler, notFoundHandler, asyncHandler } from './middleware/errorHandler';

export function createApp(server?: HTTPServer) {
  const app = express();

  // 中間件設定
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // 靜態文件服務 (React 應用)
  app.use(express.static(path.join(__dirname, '../client/build')));

  // 創建服務實例
  const authService = new AuthServiceImpl();
  const googleAuthService = new GoogleAuthServiceImpl();
  const guestService = new GuestService();
  const nicknameService = new NicknameServiceImpl();
  const userManager = new UserManagerImpl(authService, googleAuthService, nicknameService);
  
  // 創建 WebSocket 服務（如果提供了 HTTP 伺服器）
  let webSocketService: WebSocketService | undefined;
  if (server) {
    webSocketService = new WebSocketService(server, userManager);
  }

  // 創建菜單、參與者和訂單服務
  const menuService = new MenuServiceImpl(undefined, undefined, userManager);
  const participantService = new ParticipantServiceImpl(userManager, guestService);
  
  // 創建群族和訊息服務
  const groupService = new GroupServiceImpl(undefined, undefined, userManager);
  const messageService = new GroupMessageServiceImpl(groupService, undefined, userManager, webSocketService);
  
  // 創建訂單服務並傳入訊息服務
  const orderService = new OrderServiceImpl(menuService, participantService, messageService, webSocketService);
  
  // 創建訂單調度器並啟動
  const orderScheduler = new OrderSchedulerImpl(orderService, 1); // 每分鐘檢查一次
  orderScheduler.start();

  // 創建中間件
  const authMiddleware = createAuthMiddleware(userManager);
  const optionalAuthMiddleware = createOptionalAuthMiddleware(userManager);

  // 路由設定
  app.use('/api/auth', createAuthRouter(userManager));
  app.use('/api/nickname', createNicknameRouter(userManager));
  app.use('/api/menu', createMenuRouter(userManager));
  app.use('/api/order', createOrderRouter(userManager));
  app.use('/api/participant', createParticipantRouter(userManager, guestService));
  app.use('/api/community', createCommunityRouter(userManager));
  app.use('/api/group', authMiddleware, groupRouter);
  app.use('/api/group-message', authMiddleware, createGroupMessageRouter(messageService));
  
  // WebSocket 路由（如果 WebSocket 服務可用）
  if (webSocketService) {
    app.use('/api/websocket', createWebSocketRouter(webSocketService, userManager));
  }

  // 系統管理路由
  app.use('/api/system', createSystemRouter(userManager, webSocketService, orderScheduler));

  // 健康檢查端點
  app.get('/health', asyncHandler(async (req, res) => {
    const dbManager = (await import('./config/database')).DatabaseManager.getInstance();
    
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      service: 'meal-ordering-system',
      database: dbManager.isConnectionActive(),
      scheduler: orderScheduler.getStatus(),
      webSocket: webSocketService ? webSocketService.getStatus() : null
    });
  }));

  // 訂單調度器管理端點
  app.post('/api/admin/scheduler/trigger', authMiddleware, asyncHandler(async (req, res) => {
    const expiredOrders = await orderScheduler.triggerCheck();
    res.json({
      success: true,
      message: 'Manual expiration check completed',
      expiredOrders
    });
  }));

  app.get('/api/admin/scheduler/status', authMiddleware, asyncHandler(async (req, res) => {
    res.json({
      success: true,
      status: orderScheduler.getStatus()
    });
  }));

  // WebSocket 狀態端點
  if (webSocketService) {
    app.get('/api/websocket/status', authMiddleware, asyncHandler(async (req, res) => {
      res.json({
        success: true,
        status: webSocketService!.getStatus()
      });
    }));
  }

  // 受保護的測試端點
  app.get('/api/protected', authMiddleware, asyncHandler(async (req, res) => {
    res.json({ 
      message: 'This is a protected endpoint',
      user: {
        id: req.user?.id,
        email: req.user?.email,
        defaultNickname: req.user?.defaultNickname
      }
    });
  }));

  // 可選認證的測試端點
  app.get('/api/optional-auth', optionalAuthMiddleware, asyncHandler(async (req, res) => {
    if (req.user) {
      res.json({ 
        message: 'Welcome back!',
        user: {
          id: req.user.id,
          email: req.user.email,
          defaultNickname: req.user.defaultNickname
        }
      });
    } else {
      res.json({ 
        message: 'Welcome, guest!'
      });
    }
  }));

  // 使用增強的錯誤處理中間件
  app.use(errorHandler);

  // 404 處理 - 必須在錯誤處理之前
  app.use('*', (req, res, next) => {
    // 如果是 API 請求，使用 notFoundHandler
    if (req.originalUrl.startsWith('/api/')) {
      return notFoundHandler(req, res, next);
    } else {
      // 否則返回 React 應用的 index.html
      res.sendFile(path.join(__dirname, '../client/build/index.html'));
    }
  });

  return { app, userManager, authService, googleAuthService, guestService, nicknameService, menuService, participantService, orderService, orderScheduler, webSocketService };
}

export default createApp;