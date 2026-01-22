import React, { useEffect } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { useNotification } from '../contexts/NotificationContext';

const RealTimeNotifications: React.FC = () => {
  const { socket } = useSocket();
  const { addNotification } = useNotification();

  useEffect(() => {
    if (!socket) return;

    // 用戶加入訂單通知
    const handleUserJoined = (data: { nickname: string; orderCode: string }) => {
      addNotification({
        type: 'info',
        title: '新用戶加入',
        message: `${data.nickname} 加入了訂單 ${data.orderCode}`,
        duration: 3000
      });
    };

    // 訂單更新通知
    const handleOrderUpdated = (data: { orderCode: string; totalAmount: number; participantCount: number }) => {
      addNotification({
        type: 'success',
        title: '訂單已更新',
        message: `訂單 ${data.orderCode} 已更新 - ${data.participantCount} 人參與，總金額 $${data.totalAmount}`,
        duration: 4000
      });
    };

    // 訂單結束通知
    const handleOrderClosed = (data: { orderCode: string; finalAmount: number }) => {
      addNotification({
        type: 'warning',
        title: '訂單已結束',
        message: `訂單 ${data.orderCode} 已結束，最終金額 $${data.finalAmount}`,
        duration: 5000
      });
    };

    // 群族訊息通知
    const handleGroupMessage = (data: { groupName: string; senderName: string; message: string }) => {
      addNotification({
        type: 'info',
        title: `群族訊息 - ${data.groupName}`,
        message: `${data.senderName}: ${data.message.substring(0, 50)}${data.message.length > 50 ? '...' : ''}`,
        duration: 4000
      });
    };

    // 連接狀態通知
    const handleConnect = () => {
      addNotification({
        type: 'success',
        title: '已連接',
        message: '即時功能已啟用',
        duration: 2000
      });
    };

    const handleDisconnect = () => {
      addNotification({
        type: 'warning',
        title: '連接中斷',
        message: '即時功能暫時無法使用',
        duration: 3000
      });
    };

    const handleReconnect = () => {
      addNotification({
        type: 'success',
        title: '重新連接',
        message: '即時功能已恢復',
        duration: 2000
      });
    };

    // 註冊事件監聽器
    socket.on('user-joined-order', handleUserJoined);
    socket.on('order-updated', handleOrderUpdated);
    socket.on('order-closed', handleOrderClosed);
    socket.on('new-group-message', handleGroupMessage);
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('reconnect', handleReconnect);

    // 清理事件監聽器
    return () => {
      socket.off('user-joined-order', handleUserJoined);
      socket.off('order-updated', handleOrderUpdated);
      socket.off('order-closed', handleOrderClosed);
      socket.off('new-group-message', handleGroupMessage);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('reconnect', handleReconnect);
    };
  }, [socket, addNotification]);

  return null; // 這個組件不渲染任何內容，只處理事件
};

export default RealTimeNotifications;