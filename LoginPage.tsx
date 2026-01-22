import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import './AuthPages.css';

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { addNotification } = useNotification();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      addNotification({
        type: 'success',
        title: '登入成功',
        message: '歡迎回來！'
      });
      navigate('/');
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || '登入失敗，請檢查您的帳號密碼';
      setError(errorMessage);
      addNotification({
        type: 'error',
        title: '登入失敗',
        message: errorMessage
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-header">
          <h1>🍽️ 登入帳號</h1>
          <p>歡迎回來！請登入您的帳號</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="error-message">{error}</div>}
          
          <div className="form-group">
            <label htmlFor="email">電子郵件</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="請輸入您的電子郵件"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">密碼</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="請輸入您的密碼"
            />
          </div>

          <button type="submit" disabled={loading} className="auth-submit-btn">
            {loading ? '登入中...' : '登入'}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            還沒有帳號？ 
            <Link to="/register" className="auth-link">立即註冊</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;