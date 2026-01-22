import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { useSocket } from '../contexts/SocketContext';
import './OrderPages.css';

interface OrderDetail {
  _id: string;
  code: string;
  menu: {
    name: string;
    restaurantName?: string;
    items: Array<{
      name: string;
      price: number;
      description?: string;
      options?: Array<{
        name: string;
        price: number;
      }>;
    }>;
  };
  status: 'active' | 'closed' | 'expired';
  deadline?: string;
  totalAmount: number;
  participantCount: number;
  participants: Array<{
    nickname: string;
    items: Array<{
      itemName: string;
      quantity: number;
      options: string[];
      totalPrice: number;
    }>;
    totalAmount: number;
  }>;
  createdAt: string;
}

const OrderDetailPage: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { socket, joinOrderRoom, leaveOrderRoom } = useSocket();

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const response = await axios.get(`/api/order/detail/${code}`);
        if (response.data.success) {
          setOrder(response.data.order);
        }
      } catch (error: any) {
        setError('載入訂單失敗');
        console.error('Error fetching order:', error);
      } finally {
        setLoading(false);
      }
    };

    if (code) {
      fetchOrder();
      joinOrderRoom(code);
    }

    return () => {
      if (code) {
        leaveOrderRoom(code);
      }
    };
  }, [code, joinOrderRoom, leaveOrderRoom]);

  useEffect(() => {
    if (socket && code) {
      const handleOrderUpdate = (updatedOrder: OrderDetail) => {
        setOrder(updatedOrder);
      };

      socket.on('order-updated', handleOrderUpdate);

      return () => {
        socket.off('order-updated', handleOrderUpdate);
      };
    }
  }, [socket, code]);

  if (loading) {
    return (
      <div className="order-page">
        <div className="loading-container">
          <div className="loading-message">載入訂單中...</div>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="order-page">
        <div className="error-container">
          <div className="error-message">找不到訂單</div>
        </div>
      </div>
    );
  }

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

  return (
    <div className="order-page">
      <div className="order-container">
        <div className="order-header">
          <div className="order-title">
            <h1>{order.menu.name}</h1>
            {order.menu.restaurantName && (
              <p className="restaurant-name">{order.menu.restaurantName}</p>
            )}
            <p className="order-code">訂單代碼: <strong>{order.code}</strong></p>
          </div>
          <div className={`order-status ${getStatusClass(order.status)}`}>
            {getStatusText(order.status)}
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="order-summary">
          <div className="summary-item">
            <span className="label">參與人數</span>
            <span className="value">{order.participantCount}</span>
          </div>
          <div className="summary-item">
            <span className="label">總金額</span>
            <span className="value">${order.totalAmount}</span>
          </div>
          {order.deadline && (
            <div className="summary-item">
              <span className="label">截止時間</span>
              <span className="value">
                {new Date(order.deadline).toLocaleString('zh-TW')}
              </span>
            </div>
          )}
        </div>

        <div className="participants-section">
          <h2>參與者訂單</h2>
          {order.participants.length === 0 ? (
            <div className="empty-state">
              <p>還沒有人參與訂餐</p>
            </div>
          ) : (
            <div className="participants-list">
              {order.participants.map((participant, index) => (
                <div key={index} className="participant-card">
                  <div className="participant-header">
                    <h3>{participant.nickname}</h3>
                    <span className="participant-total">${participant.totalAmount}</span>
                  </div>
                  <div className="participant-items">
                    {participant.items.map((item, itemIndex) => (
                      <div key={itemIndex} className="participant-item">
                        <span className="item-name">{item.itemName}</span>
                        <span className="item-quantity">x{item.quantity}</span>
                        {item.options.length > 0 && (
                          <span className="item-options">
                            ({item.options.join(', ')})
                          </span>
                        )}
                        <span className="item-price">${item.totalPrice}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="menu-section">
          <h2>菜單</h2>
          <div className="menu-items">
            {order.menu.items.map((item, index) => (
              <div key={index} className="menu-item">
                <div className="item-info">
                  <h4>{item.name}</h4>
                  {item.description && <p className="item-description">{item.description}</p>}
                  <span className="item-price">${item.price}</span>
                </div>
                {item.options && item.options.length > 0 && (
                  <div className="item-options">
                    <strong>加量選項：</strong>
                    {item.options.map((option, optIndex) => (
                      <span key={optIndex} className="option-tag">
                        {option.name} (+${option.price})
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderDetailPage;