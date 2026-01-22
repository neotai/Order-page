import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export class CustomError extends Error implements AppError {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

// 錯誤類型定義
export class ValidationError extends CustomError {
  constructor(message: string) {
    super(message, 400);
  }
}

export class AuthenticationError extends CustomError {
  constructor(message: string = '認證失敗') {
    super(message, 401);
  }
}

export class AuthorizationError extends CustomError {
  constructor(message: string = '權限不足') {
    super(message, 403);
  }
}

export class NotFoundError extends CustomError {
  constructor(message: string = '資源不存在') {
    super(message, 404);
  }
}

export class ConflictError extends CustomError {
  constructor(message: string) {
    super(message, 409);
  }
}

export class DatabaseError extends CustomError {
  constructor(message: string = '資料庫操作失敗') {
    super(message, 500);
  }
}

export class ExternalServiceError extends CustomError {
  constructor(message: string = '外部服務錯誤') {
    super(message, 502);
  }
}

// 錯誤處理中間件
export const errorHandler = (
  error: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // 設定預設值
  let statusCode = error.statusCode || 500;
  let message = error.message || '內部伺服器錯誤';
  let isOperational = error.isOperational !== false;

  // 處理 MongoDB 錯誤
  if (error.name === 'ValidationError') {
    statusCode = 400;
    message = '資料驗證失敗';
    isOperational = true;
  } else if (error.name === 'CastError') {
    statusCode = 400;
    message = '無效的資料格式';
    isOperational = true;
  } else if (error.name === 'MongoError' && (error as any).code === 11000) {
    statusCode = 409;
    message = '資料重複';
    isOperational = true;
  }

  // 處理 JWT 錯誤
  if (error.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = '無效的認證令牌';
    isOperational = true;
  } else if (error.name === 'TokenExpiredError') {
    statusCode = 401;
    message = '認證令牌已過期';
    isOperational = true;
  }

  // 記錄錯誤
  if (!isOperational || statusCode >= 500) {
    console.error('系統錯誤:', {
      message: error.message,
      stack: error.stack,
      url: req.url,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    });
  } else {
    console.warn('操作錯誤:', {
      message: error.message,
      url: req.url,
      method: req.method,
      statusCode,
      timestamp: new Date().toISOString()
    });
  }

  // 回應錯誤
  const errorResponse: any = {
    success: false,
    error: message,
    statusCode
  };

  // 在開發環境中包含堆疊追蹤
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = error.stack;
    errorResponse.details = {
      name: error.name,
      isOperational
    };
  }

  res.status(statusCode).json(errorResponse);
};

// 404 處理中間件
export const notFoundHandler = (req: Request, res: Response, next: NextFunction) => {
  const error = new NotFoundError(`路由 ${req.originalUrl} 不存在`);
  next(error);
};

// 異步錯誤包裝器
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// 驗證錯誤處理器
export const handleValidationError = (error: any): ValidationError => {
  if (error.name === 'ValidationError') {
    const messages = Object.values(error.errors).map((err: any) => err.message);
    return new ValidationError(`驗證失敗: ${messages.join(', ')}`);
  }
  return new ValidationError('資料驗證失敗');
};

// 資料庫錯誤處理器
export const handleDatabaseError = (error: any): CustomError => {
  if (error.name === 'MongoError') {
    if (error.code === 11000) {
      return new ConflictError('資料重複，請檢查輸入');
    }
    return new DatabaseError(`資料庫錯誤: ${error.message}`);
  }
  
  if (error.name === 'CastError') {
    return new ValidationError('無效的資料格式');
  }
  
  return new DatabaseError('資料庫操作失敗');
};