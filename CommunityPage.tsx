import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './CommunityPage.css';

interface CommunityMenu {
  _id: string;
  name: string;
  restaurantName?: string;
  itemCount: number;
  createdBy: {
    defaultNickname: string;
  };
  createdAt: string;
}

const CommunityPage: React.FC = () => {
  const [menus, setMenus] = useState<CommunityMenu[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchCommunityMenus = async () => {
      try {
        const response = await axios.get('/api/community/menus', {
          params: searchTerm ? { search: searchTerm } : {}
        });
        
        if (response.data.success) {
          setMenus(response.data.menus);
        }
      } catch (error: any) {
        setError('載入社群菜單失敗');
        console.error('Error fetching community menus:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCommunityMenus();
  }, [searchTerm]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // 搜尋會在 useEffect 中自動觸發
  };

  const copyMenu = async (menuId: string) => {
    try {
      const response = await axios.post(`/api/community/copy/${menuId}`);
      if (response.data.success) {
        navigate(`/menu/edit/${response.data.menuId}`);
      }
    } catch (error: any) {
      setError(error.response?.data?.error || '複製菜單失敗');
    }
  };

  if (loading) {
    return (
      <div className="community-page">
        <div className="loading-container">
          <div className="loading-message">載入社群菜單中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="community-page">
      <div className="community-container">
        <div className="page-header">
          <h1>🌟 社群菜單</h1>
          <p>探索其他用戶分享的菜單，找到您喜歡的餐廳和菜色</p>
        </div>

        <div className="search-section">
          <form onSubmit={handleSearch} className="search-form">
            <input
              type="text"
              placeholder="搜尋菜單或餐廳名稱..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            <button type="submit" className="search-btn">
              🔍 搜尋
            </button>
          </form>
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="menus-section">
          {menus.length === 0 ? (
            <div className="empty-state">
              <p>
                {searchTerm 
                  ? `找不到包含 "${searchTerm}" 的菜單` 
                  : '目前沒有社群菜單'
                }
              </p>
            </div>
          ) : (
            <div className="menus-grid">
              {menus.map(menu => (
                <div key={menu._id} className="community-menu-card">
                  <div className="menu-header">
                    <h3>{menu.name}</h3>
                    {menu.restaurantName && (
                      <p className="restaurant-name">{menu.restaurantName}</p>
                    )}
                  </div>

                  <div className="menu-info">
                    <div className="menu-stats">
                      <span className="stat">
                        📋 {menu.itemCount} 個項目
                      </span>
                    </div>
                    <div className="menu-meta">
                      <span className="creator">
                        👤 {menu.createdBy.defaultNickname}
                      </span>
                      <span className="date">
                        📅 {new Date(menu.createdAt).toLocaleDateString('zh-TW')}
                      </span>
                    </div>
                  </div>

                  <div className="menu-actions">
                    <button 
                      onClick={() => copyMenu(menu._id)}
                      className="copy-btn"
                    >
                      📋 複製菜單
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="help-section">
          <h2>💡 如何使用社群菜單？</h2>
          <div className="help-items">
            <div className="help-item">
              <h3>🔍 搜尋菜單</h3>
              <p>使用搜尋功能找到您想要的餐廳或菜色</p>
            </div>
            <div className="help-item">
              <h3>📋 複製菜單</h3>
              <p>點擊「複製菜單」將菜單複製到您的帳號，可以進行修改</p>
            </div>
            <div className="help-item">
              <h3>🍽️ 建立訂單</h3>
              <p>複製後的菜單可以用來建立團購訂單</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommunityPage;