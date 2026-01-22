import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import './MenuPages.css';

interface MenuItem {
  name: string;
  price: number;
  description?: string;
  options?: Array<{
    name: string;
    price: number;
  }>;
}

interface Menu {
  _id: string;
  name: string;
  restaurantName?: string;
  items: MenuItem[];
}

const MenuEditPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [menu, setMenu] = useState<Menu | null>(null);
  const [menuName, setMenuName] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [items, setItems] = useState<MenuItem[]>([]);
  const [currentItem, setCurrentItem] = useState<MenuItem>({
    name: '',
    price: 0,
    description: '',
    options: []
  });
  const [currentOption, setCurrentOption] = useState({ name: '', price: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchMenu = async () => {
      try {
        const response = await axios.get(`/api/menu/${id}`);
        if (response.data.success) {
          const menuData = response.data.menu;
          setMenu(menuData);
          setMenuName(menuData.name);
          setRestaurantName(menuData.restaurantName || '');
          setItems(menuData.items);
        }
      } catch (error: any) {
        setError('載入菜單失敗');
        console.error('Error fetching menu:', error);
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchMenu();
    }
  }, [id]);

  const addOption = () => {
    if (currentOption.name && currentOption.price > 0) {
      setCurrentItem(prev => ({
        ...prev,
        options: [...(prev.options || []), currentOption]
      }));
      setCurrentOption({ name: '', price: 0 });
    }
  };

  const removeOption = (index: number) => {
    setCurrentItem(prev => ({
      ...prev,
      options: prev.options?.filter((_, i) => i !== index) || []
    }));
  };

  const addItem = () => {
    if (currentItem.name && currentItem.price > 0) {
      setItems(prev => [...prev, currentItem]);
      setCurrentItem({
        name: '',
        price: 0,
        description: '',
        options: []
      });
    }
  };

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!menuName || items.length === 0) {
      setError('請填寫菜單名稱並至少保留一個菜單項目');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const response = await axios.put(`/api/menu/${id}`, {
        name: menuName,
        restaurantName,
        items
      });

      if (response.data.success) {
        navigate('/order/manage');
      }
    } catch (error: any) {
      setError(error.response?.data?.error || '更新菜單失敗');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="menu-page">
        <div className="loading-container">
          <div className="loading-message">載入菜單中...</div>
        </div>
      </div>
    );
  }

  if (!menu) {
    return (
      <div className="menu-page">
        <div className="error-container">
          <div className="error-message">找不到菜單</div>
        </div>
      </div>
    );
  }

  return (
    <div className="menu-page">
      <div className="menu-container">
        <h1>✏️ 編輯菜單</h1>

        <form onSubmit={handleSubmit} className="menu-form">
          {error && <div className="error-message">{error}</div>}

          <div className="form-section">
            <h2>基本資訊</h2>
            <div className="form-group">
              <label htmlFor="menuName">菜單名稱</label>
              <input
                type="text"
                id="menuName"
                value={menuName}
                onChange={(e) => setMenuName(e.target.value)}
                required
                placeholder="例：午餐菜單"
              />
            </div>

            <div className="form-group">
              <label htmlFor="restaurantName">餐廳名稱</label>
              <input
                type="text"
                id="restaurantName"
                value={restaurantName}
                onChange={(e) => setRestaurantName(e.target.value)}
                placeholder="例：美味小館"
              />
            </div>
          </div>

          <div className="form-section">
            <h2>菜單項目</h2>
            
            <div className="item-form">
              <div className="form-row">
                <div className="form-group">
                  <label>項目名稱</label>
                  <input
                    type="text"
                    value={currentItem.name}
                    onChange={(e) => setCurrentItem(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="例：牛肉麵"
                  />
                </div>
                <div className="form-group">
                  <label>價格</label>
                  <input
                    type="number"
                    value={currentItem.price}
                    onChange={(e) => setCurrentItem(prev => ({ ...prev, price: Number(e.target.value) }))}
                    placeholder="0"
                    min="0"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>描述（可選）</label>
                <input
                  type="text"
                  value={currentItem.description}
                  onChange={(e) => setCurrentItem(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="例：香濃湯頭，嫩牛肉片"
                />
              </div>

              <div className="options-section">
                <h3>加量選項</h3>
                <div className="form-row">
                  <div className="form-group">
                    <input
                      type="text"
                      value={currentOption.name}
                      onChange={(e) => setCurrentOption(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="例：加麵"
                    />
                  </div>
                  <div className="form-group">
                    <input
                      type="number"
                      value={currentOption.price}
                      onChange={(e) => setCurrentOption(prev => ({ ...prev, price: Number(e.target.value) }))}
                      placeholder="0"
                      min="0"
                    />
                  </div>
                  <button type="button" onClick={addOption} className="add-option-btn">
                    新增選項
                  </button>
                </div>

                {currentItem.options && currentItem.options.length > 0 && (
                  <div className="options-list">
                    {currentItem.options.map((option, index) => (
                      <div key={index} className="option-item">
                        <span>{option.name} (+${option.price})</span>
                        <button type="button" onClick={() => removeOption(index)} className="remove-btn">
                          移除
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button type="button" onClick={addItem} className="add-item-btn">
                新增項目
              </button>
            </div>

            {items.length > 0 && (
              <div className="items-list">
                <h3>菜單項目</h3>
                {items.map((item, index) => (
                  <div key={index} className="item-card">
                    <div className="item-info">
                      <h4>{item.name} - ${item.price}</h4>
                      {item.description && <p>{item.description}</p>}
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
                    <button type="button" onClick={() => removeItem(index)} className="remove-btn">
                      移除
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="form-actions">
            <button type="button" onClick={() => navigate('/order/manage')} className="cancel-btn">
              取消
            </button>
            <button type="submit" disabled={saving} className="submit-btn">
              {saving ? '儲存中...' : '儲存變更'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MenuEditPage;