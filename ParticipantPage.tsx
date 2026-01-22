import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { useSocket } from '../contexts/SocketContext';
import './ParticipantPage.css';

interface MenuItem {
  name: string;
  price: number;
  description?: string;
  options?: Array<{
    name: string;
    price: number;
  }>;
}

interface OrderInfo {
  _id: string;
  code: string;
  menu: {
    name: string;
    restaurantName?: string;
    items: MenuItem[];
  };
  status: 'active' | 'closed' | 'expired';
  deadline?: string;
}

interface OrderItem {
  itemName: string;
  quantity: number;
  options: string[];
  totalPrice: number;
}

const ParticipantPage: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [nickname, setNickname] = useState('');
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const { socket, joinOrderRoom, leaveOrderRoom } = useSocket();

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const response = await axios.get(`/api/participant/order/${code}`);
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

  const addToCart = (item: MenuItem, selectedOptions: string[] = []) => {
    const optionPrices = selectedOptions.reduce((total, optionName) => {
      const option = item.options?.find(opt => opt.name === optionName);
      return total + (option?.price || 0);
    }, 0);

    const totalPrice = item.price + optionPrices;
    const existingItemIndex = cart.findIndex(
      cartItem => 
        cartItem.itemName === item.name && 
        JSON.stringify(cartItem.options.sort()) === JSON.stringify(selectedOptions.sort())
    );

    if (existingItemIndex >= 0) {
      const newCart = [...cart];
      newCart[existingItemIndex].quantity += 1;
      newCart[existingItemIndex].totalPrice += totalPrice;
      setCart(newCart);
    } else {
      setCart(prev => [...prev, {
        itemName: item.name,
        quantity: 1,
        options: selectedOptions,
        totalPrice
      }]);
    }
  };

  const removeFromCart = (index: number) => {
    setCart(prev => prev.filter((_, i) => i !== index));
  };

  const updateQuantity = (index: number, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeFromCart(index);
      return;
    }

    const newCart = [...cart];
    const item = newCart[index];
    const unitPrice = item.totalPrice / item.quantity;
    item.quantity = newQuantity;
    item.totalPrice = unitPrice * newQuantity;
    setCart(newCart);
  };

  const getTotalAmount = () => {
    return cart.reduce((total, item) => total + item.totalPrice, 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim()) {
      setError('請輸入您的暱稱');
      return;
    }

    if (cart.length === 0) {
      setError('請至少選擇一個餐點');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const response = await axios.post(`/api/participant/order/${code}`, {
        nickname: nickname.trim(),
        items: cart
      });

      if (response.data.success) {
        setSuccess('訂單提交成功！');
        setCart([]);
        setNickname('');
      }
    } catch (error: any) {
      setError(error.response?.data?.error || '提交訂單失敗');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="participant-page">
        <div className="loading-container">
          <div className="loading-message">載入中...</div>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="participant-page">
        <div className="error-container">
          <div className="error-message">找不到訂單或訂單已結束</div>
        </div>
      </div>
    );
  }

  if (order.status !== 'active') {
    return (
      <div className="participant-page">
        <div className="error-container">
          <div className="error-message">此訂單已結束，無法參與</div>
        </div>
      </div>
    );
  }

  return (
    <div className="participant-page">
      <div className="participant-container">
        <div className="order-header">
          <h1>{order.menu.name}</h1>
          {order.menu.restaurantName && (
            <p className="restaurant-name">{order.menu.restaurantName}</p>
          )}
          <p className="order-code">訂單代碼: {order.code}</p>
          {order.deadline && (
            <p className="deadline">
              截止時間: {new Date(order.deadline).toLocaleString('zh-TW')}
            </p>
          )}
        </div>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        <div className="menu-section">
          <h2>菜單</h2>
          <div className="menu-items">
            {order.menu.items.map((item, index) => (
              <MenuItemCard 
                key={index} 
                item={item} 
                onAddToCart={addToCart}
              />
            ))}
          </div>
        </div>

        {cart.length > 0 && (
          <div className="cart-section">
            <h2>我的訂單</h2>
            <div className="cart-items">
              {cart.map((item, index) => (
                <div key={index} className="cart-item">
                  <div className="item-info">
                    <h4>{item.itemName}</h4>
                    {item.options.length > 0 && (
                      <p className="item-options">加量: {item.options.join(', ')}</p>
                    )}
                  </div>
                  <div className="item-controls">
                    <button 
                      onClick={() => updateQuantity(index, item.quantity - 1)}
                      className="quantity-btn"
                    >
                      -
                    </button>
                    <span className="quantity">{item.quantity}</span>
                    <button 
                      onClick={() => updateQuantity(index, item.quantity + 1)}
                      className="quantity-btn"
                    >
                      +
                    </button>
                  </div>
                  <div className="item-price">${item.totalPrice}</div>
                  <button 
                    onClick={() => removeFromCart(index)}
                    className="remove-btn"
                  >
                    移除
                  </button>
                </div>
              ))}
            </div>
            <div className="cart-total">
              <strong>總計: ${getTotalAmount()}</strong>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="order-form">
          <div className="form-group">
            <label htmlFor="nickname">您的暱稱</label>
            <input
              type="text"
              id="nickname"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              required
              placeholder="請輸入您的暱稱"
            />
          </div>

          <button 
            type="submit" 
            disabled={submitting || cart.length === 0}
            className="submit-btn"
          >
            {submitting ? '提交中...' : `提交訂單 ($${getTotalAmount()})`}
          </button>
        </form>
      </div>
    </div>
  );
};

interface MenuItemCardProps {
  item: MenuItem;
  onAddToCart: (item: MenuItem, options: string[]) => void;
}

const MenuItemCard: React.FC<MenuItemCardProps> = ({ item, onAddToCart }) => {
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);

  const handleOptionChange = (optionName: string, checked: boolean) => {
    if (checked) {
      setSelectedOptions(prev => [...prev, optionName]);
    } else {
      setSelectedOptions(prev => prev.filter(name => name !== optionName));
    }
  };

  const getTotalPrice = () => {
    const optionPrices = selectedOptions.reduce((total, optionName) => {
      const option = item.options?.find(opt => opt.name === optionName);
      return total + (option?.price || 0);
    }, 0);
    return item.price + optionPrices;
  };

  const handleAddToCart = () => {
    onAddToCart(item, selectedOptions);
    setSelectedOptions([]);
  };

  return (
    <div className="menu-item-card">
      <div className="item-header">
        <h3>{item.name}</h3>
        <span className="item-price">${item.price}</span>
      </div>
      
      {item.description && (
        <p className="item-description">{item.description}</p>
      )}

      {item.options && item.options.length > 0 && (
        <div className="item-options">
          <h4>加量選項</h4>
          {item.options.map((option, index) => (
            <label key={index} className="option-checkbox">
              <input
                type="checkbox"
                checked={selectedOptions.includes(option.name)}
                onChange={(e) => handleOptionChange(option.name, e.target.checked)}
              />
              <span>{option.name} (+${option.price})</span>
            </label>
          ))}
        </div>
      )}

      <div className="item-footer">
        <span className="total-price">總計: ${getTotalPrice()}</span>
        <button onClick={handleAddToCart} className="add-to-cart-btn">
          加入訂單
        </button>
      </div>
    </div>
  );
};

export default ParticipantPage;