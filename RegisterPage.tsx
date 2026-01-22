import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import './AuthPages.css';

const RegisterPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [defaultNickname, setDefaultNickname] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const { addNotification } = useNotification();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      const errorMessage = '密碼確認不符';
      setError(errorMessage);
      addNotification({
        type: 'error',
        title: '註冊失敗',
        message: errorMessage
      });
      return;
    }

    if (password.length < 6) {
      const errorMessage = '密碼長度至少需要 6 個字元';
      setError(errorMessage);
      addNotification({
        type: 'error',
        title: '註冊失敗',
        message: errorMessage
      });
      return;
    }

    setLoading(true);

    try {
      await register(email, password, defaultNickname);
      addNotification({
        type: 'success',
        title: '註冊成功',
        message: '歡迎加入團購訂餐系統！'
      });
      navigate('/');
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || '註冊失敗，請稍後再試';
      setError(errorMessage);
      addNotification({
        type: 'error',
        title: '註冊失敗',
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
          <h1>🍽️ 註冊帳號</h1>
          <p>建立新帳號，開始使用團購訂餐系統</p>
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
            <label htmlFor="defaultNickname">預設暱稱</label>
            <input
              type="text"
              id="defaultNickname"
              value={defaultNickname}
              onChange={(e) => setDefaultNickname(e.target.value)}
              required
              placeholder="請輸入您的預設暱稱"
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
              placeholder="請輸入密碼（至少 6 個字元）"
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">確認密碼</label>
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              placeholder="請再次輸入密碼"
            />
          </div>

          <button type="submit" disabled={loading} className="auth-submit-btn">
            {loading ? '註冊中...' : '註冊'}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            已經有帳號？ 
            <Link to="/login" className="auth-link">立即登入</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;