import React from 'react';
import './StatusIndicator.css';

interface StatusIndicatorProps {
  status: 'active' | 'closed' | 'expired' | 'loading' | 'success' | 'error';
  text?: string;
  size?: 'small' | 'medium' | 'large';
}

const StatusIndicator: React.FC<StatusIndicatorProps> = ({ 
  status, 
  text, 
  size = 'medium' 
}) => {
  const getStatusText = () => {
    if (text) return text;
    
    switch (status) {
      case 'active': return '進行中';
      case 'closed': return '已結束';
      case 'expired': return '已過期';
      case 'loading': return '載入中';
      case 'success': return '成功';
      case 'error': return '錯誤';
      default: return status;
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'active': return '🟢';
      case 'closed': return '🔵';
      case 'expired': return '🔴';
      case 'loading': return '⏳';
      case 'success': return '✅';
      case 'error': return '❌';
      default: return '⚪';
    }
  };

  return (
    <div className={`status-indicator status-${status} size-${size}`}>
      <span className="status-icon">{getStatusIcon()}</span>
      <span className="status-text">{getStatusText()}</span>
      {status === 'loading' && <div className="loading-dots"></div>}
    </div>
  );
};

export default StatusIndicator;