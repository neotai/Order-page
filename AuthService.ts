import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { User, UserRegistration, LoginCredentials, AuthResult } from '../types/user';

export interface AuthService {
  generateToken(userId: string): string;
  verifyToken(token: string): Promise<{ userId: string } | null>;
  hashPassword(password: string): Promise<string>;
  verifyPassword(password: string, hashedPassword: string): Promise<boolean>;
}

export class AuthServiceImpl implements AuthService {
  private readonly jwtSecret: string;
  private readonly jwtExpiresIn: string;
  private readonly saltRounds: number;

  constructor(
    jwtSecret: string = 'meal-ordering-secret-key',
    jwtExpiresIn: string = '24h',
    saltRounds: number = 10
  ) {
    this.jwtSecret = jwtSecret;
    this.jwtExpiresIn = jwtExpiresIn;
    this.saltRounds = saltRounds;
  }

  generateToken(userId: string): string {
    return jwt.sign(
      { userId },
      this.jwtSecret,
      { expiresIn: this.jwtExpiresIn }
    );
  }

  async verifyToken(token: string): Promise<{ userId: string } | null> {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as { userId: string };
      return decoded;
    } catch (error) {
      return null;
    }
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.saltRounds);
  }

  async verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword);
  }
}