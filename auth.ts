import { Request, Response, NextFunction } from 'express';
import { UserManager } from '../managers/UserManager';
import { User } from '../types/user';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export function createAuthMiddleware(userManager: UserManager) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return res.status(401).json({ 
          success: false, 
          error: 'No token provided' 
        });
      }

      const user = await userManager.verifyToken(token);
      
      if (!user) {
        return res.status(401).json({ 
          success: false, 
          error: 'Invalid token' 
        });
      }

      req.user = user;
      next();
    } catch (error) {
      console.error('Auth middleware error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  };
}

export function createOptionalAuthMiddleware(userManager: UserManager) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      
      if (token) {
        const user = await userManager.verifyToken(token);
        if (user) {
          req.user = user;
        }
      }

      next();
    } catch (error) {
      console.error('Optional auth middleware error:', error);
      next(); // Continue even if auth fails
    }
  };
}