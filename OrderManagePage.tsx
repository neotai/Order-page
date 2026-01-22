import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import './OrderPages.css';

interface Menu {
  _id: string;
  name: string;
  restaurantName?: string;
}

interface Order {
  _id: string;
  code: string;
  menu: Menu;
  status: 'active' | 'closed' | 'expired';
  deadline?: string;
  totalAmount: number;
  participantCount: number;
  createdAt: string;
}

const OrderManagePage: React.FC = () => {
  const [menus, setMenus] = useState<Menu[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [menusResponse, ordersResponse] = await Promise.all([
          axios.get('/api/menu/my'),
          axios.get('/api/order/my')
        ]);

        if (menusResponse.data.success) {
          setMenus(menusResponse.data.menus);
        }

        if (ordersResponse.data.success) {
          setOrders(ordersResponse.data.orders);
        }
      } catch (error: any) {
        setError('載入資料失敗');
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const createOrder = async (menuId: string) => {
    try {
      const response = await axios.post('/api/order', { menuId });
      if (response.data.success) {
        // 重新載入訂單列表
        const ordersResponse = await axios.get('/api/order/my');
        if (ordersResponse.data.success) {
          setOrders(ordersResponse.data.orders);
        }
      }
    } catch (error: any) {
      setError(error.response?.data?.error || '建立訂單失敗');
    }
  };

  const closeOrder = async (orderId: string) => {
    try {
      const response = await axios.post(`/api/order/${orderId}/close`);
      if (response.data.success) {
        // 更新訂單狀態
        setOrders(prev => prev.map(order => 
          order._id === orderId 
            ? { ...order, status: 'closed' as const }
            : order
        ));
      }
    } catch (error: any) {
      setError(error.response?.data?.error || '結單失敗');
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active': return '進行中';
      case 'closed': return '已結單';
      case 'expired': return '已過期';
      default: return status;
    }
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'active': return 'status-active';
      case 'closed': return 'status-closed';
      case 'expired': return 'status-expired';
      default: return '';
    }
  };

  if (loading) {
    return (
      <div className="order-page">
        <div className="loading-container">
          <div className="loading-message">載入中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="order-page">
      <div className="order-container">
        <div className="page-header">
          <h1>📊 管理訂單</h1>
          <Link to="/menu/create" className="create-menu-btn">
            建立新菜單
          </Link>
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="section">
          <h2>我的菜單</h2>
          {menus.length === 0 ? (
            <div className="empty-state">
              <p>您還沒有建立任何菜單</p>
              <Link to="/menu/create" className="create-btn">
                建立第一個菜單
              </Link>
            </div>
          ) : (
            <div className="menus-grid">
              {menus.map(menu => (
                <div key={menu._id} className="menu-card">
                  <div className="menu-info">
                    <h3>{menu.name}</h3>
                    {menu.restaurantName && <p className="restaurant-name">{menu.restaurantName}</p>}
                  </div>
                  <div className="menu-actions">
                    <Link to={`/menu/edit/${menu._id}`} className="edit-btn">
                      編輯
                    </Link>
                    <button 
                      onClick={() => createOrder(menu._id)} 
                      className="create-order-btn"
                    >
                      建立訂單
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="section">
          <h2>我的訂單</h2>
          {orders.length === 0 ? (
            <div className="empty-state">
              <p>您還沒有建立任何訂單</p>
            </div>
          ) : (
            <div className="orders-list">
              {orders.map(order => (
                <div key={order._id} className="order-card">
                  <div className="order-header">
                    <div className="order-info">
                      <h3>{order.menu.name}</h3>
                      {order.menu.restaurantName && (
                        <p className="restaurant-name">{order.menu.restaurantName}</p>
                      )}
                      <p className="order-code">訂單代碼: <strong>{order.code}</strong></p>
                    </div>
                    <div className={`order-status ${getStatusClass(order.status)}`}>
                      {getStatusText(order.status)}
                    </div>
                  </div>

                  <div className="order-stats">
                    <div className="stat">
                      <span className="stat-label">參與人數</span>
                      <span className="stat-value">{order.participantCount}</span>
                    </div>
                    <div className="stat">
                      <span className="stat-label">總金額</span>
                      <span className="stat-value">${order.totalAmount}</span>
                    </div>
                    {order.deadline && (
                      <div className="stat">
                        <span className="stat-label">截止時間</span>
                        <span className="stat-value">
                          {new Date(order.deadline).toLocaleString('zh-TW')}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="order-actions">
                    <Link to={`/order/${order.code}`} className="view-btn">
                      查看詳情
                    </Link>
                    {order.status === 'active' && (
                      <button 
                        onClick={() => closeOrder(order._id)} 
                        className="close-btn"
                      >
                        結單
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrderManagePage;