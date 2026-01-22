import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

const MenuCreatePage: React.FC = () => {
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
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ocrLoading, setOcrLoading] = useState(false);
  const navigate = useNavigate();

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageFile(file);
    setOcrLoading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await axios.post('/api/menu/ocr', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      if (response.data.success && response.data.items) {
        setItems(response.data.items);
        if (response.data.restaurantName) {
          setRestaurantName(response.data.restaurantName);
        }
      }
    } catch (error: any) {
      setError('圖片辨識失敗，請手動輸入菜單項目');
      console.error('OCR error:', error);
    } finally {
      setOcrLoading(false);
    }
  };

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
      setError('請填寫菜單名稱並至少新增一個菜單項目');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await axios.post('/api/menu', {
        name: menuName,
        restaurantName,
        items
      });

      if (response.data.success) {
        navigate('/order/manage');
      }
    } catch (error: any) {
      setError(error.response?.data?.error || '建立菜單失敗');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="menu-page">
      <div className="menu-container">
        <h1>📋 建立菜單</h1>

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

            <div className="form-group">
              <label htmlFor="image">上傳菜單圖片（可選）</label>
              <input
                type="file"
                id="image"
                accept="image/*"
                onChange={handleImageUpload}
                className="file-input"
              />
              {ocrLoading && <div className="loading-message">正在辨識圖片...</div>}
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
                <h3>已新增的項目</h3>
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

          <button type="submit" disabled={loading} className="submit-btn">
            {loading ? '建立中...' : '建立菜單'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default MenuCreatePage;