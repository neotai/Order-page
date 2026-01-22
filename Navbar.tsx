import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import './Navbar.css';

const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const { connected } = useSocket();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/" className="navbar-brand">
          🍽️ 團購訂餐系統
        </Link>
        
        <div className="navbar-menu">
          <Link to="/" className="navbar-item">首頁</Link>
          <Link to="/community" className="navbar-item">社群菜單</Link>
          
          {user ? (
            <>
              <Link to="/menu/create" className="navbar-item">建立菜單</Link>
              <Link to="/order/manage" className="navbar-item">管理訂單</Link>
              <Link to="/group" className="navbar-item">群族</Link>
              <div className="navbar-user">
                <div className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
                  <span className="status-dot"></span>
                  <span className="status-text">{connected ? '已連線' : '離線'}</span>
                </div>
                <span className="user-nickname">👋 {user.defaultNickname}</span>
                <button onClick={handleLogout} className="logout-btn">登出</button>
              </div>
            </>
          ) : (
            <div className="navbar-auth">
              <Link to="/login" className="navbar-item">登入</Link>
              <Link to="/register" className="navbar-item register-btn">註冊</Link>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;