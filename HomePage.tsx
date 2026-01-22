import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './HomePage.css';

const HomePage: React.FC = () => {
  const [orderCode, setOrderCode] = useState('');
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleJoinOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (orderCode.trim()) {
      navigate(`/participant/${orderCode.trim()}`);
    }
  };

  const handleCreateMenu = () => {
    navigate('/menu/create');
  };

  const handleManageOrders = () => {
    navigate('/order/manage');
  };

  return (
    <div className="home-page">
      <div className="hero-section">
        <h1 className="hero-title">🍽️ 團購訂餐系統</h1>
        <p className="hero-subtitle">輕鬆管理團體訂餐，即時協作，簡單便利</p>
      </div>

      <div className="main-actions">
        <div className="action-card">
          <h2>🔍 加入團購</h2>
          <p>輸入團購代碼，立即參與訂餐</p>
          <form onSubmit={handleJoinOrder} className="join-form">
            <input
              type="text"
              placeholder="請輸入團購代碼"
              value={orderCode}
              onChange={(e) => setOrderCode(e.target.value)}
              className="code-input"
            />
            <button type="submit" className="join-btn">
              加入團購
            </button>
          </form>
        </div>

        {user ? (
          <>
            <div className="action-card">
              <h2>📋 建立菜單</h2>
              <p>建立新的菜單，開始團購訂餐</p>
              <button onClick={handleCreateMenu} className="create-btn">
                建立菜單
              </button>
            </div>

            <div className="action-card">
              <h2>📊 管理訂單</h2>
              <p>查看和管理您的團購訂單</p>
              <button onClick={handleManageOrders} className="manage-btn">
                管理訂單
              </button>
            </div>
          </>
        ) : (
          <div className="action-card">
            <h2>👤 登入帳號</h2>
            <p>登入後可建立菜單和管理訂單</p>
            <button onClick={() => navigate('/login')} className="login-btn">
              立即登入
            </button>
          </div>
        )}
      </div>

      <div className="features-section">
        <h2>✨ 主要功能</h2>
        <div className="features-grid">
          <div className="feature-item">
            <div className="feature-icon">🍜</div>
            <h3>菜單管理</h3>
            <p>輕鬆建立和編輯菜單，支援圖片辨識</p>
          </div>
          <div className="feature-item">
            <div className="feature-icon">👥</div>
            <h3>團購協作</h3>
            <p>多人同時訂餐，即時更新訂單狀態</p>
          </div>
          <div className="feature-item">
            <div className="feature-icon">💬</div>
            <h3>群族功能</h3>
            <p>建立群族，分享菜單和討論</p>
          </div>
          <div className="feature-item">
            <div className="feature-icon">📱</div>
            <h3>響應式設計</h3>
            <p>支援手機、平板和電腦使用</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomePage;