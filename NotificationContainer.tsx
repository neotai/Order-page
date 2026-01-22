import React from 'react';
import { useNotification } from '../contexts/NotificationContext';
import './NotificationContainer.css';

const NotificationContainer: React.FC = () => {
  const { notifications, removeNotification } = useNotification();

  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className="notification-container">
      {notifications.map(notification => (
        <div
          key={notification.id}
          className={`notification notification-${notification.type}`}
          onClick={() => removeNotification(notification.id)}
        >
          <div className="notification-content">
            <div className="notification-header">
              <h4 className="notification-title">{notification.title}</h4>
              <button
                className="notification-close"
                onClick={(e) => {
                  e.stopPropagation();
                  removeNotification(notification.id);
                }}
              >
                ×
              </button>
            </div>
            {notification.message && (
              <p className="notification-message">{notification.message}</p>
            )}
          </div>
          <div className="notification-progress">
            <div 
              className="notification-progress-bar"
              style={{
                animationDuration: `${notification.duration}ms`
              }}
            ></div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default NotificationContainer;