import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';

interface SocketContextType {
  socket: Socket | null;
  connected: boolean;
  joinOrderRoom: (orderCode: string) => void;
  leaveOrderRoom: (orderCode: string) => void;
  joinGroupRoom: (groupId: string) => void;
  leaveGroupRoom: (groupId: string) => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

interface SocketProviderProps {
  children: ReactNode;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const { token, user } = useAuth();

  useEffect(() => {
    if (token && user) {
      const newSocket = io('http://localhost:3001', {
        auth: {
          token
        }
      });

      newSocket.on('connect', () => {
        console.log('Connected to server');
        setConnected(true);
      });

      newSocket.on('disconnect', () => {
        console.log('Disconnected from server');
        setConnected(false);
      });

      newSocket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        setConnected(false);
      });

      setSocket(newSocket);

      return () => {
        newSocket.close();
        setSocket(null);
        setConnected(false);
      };
    } else {
      if (socket) {
        socket.close();
        setSocket(null);
        setConnected(false);
      }
    }
  }, [token, user]);

  const joinOrderRoom = (orderCode: string) => {
    if (socket) {
      socket.emit('join-order', orderCode);
    }
  };

  const leaveOrderRoom = (orderCode: string) => {
    if (socket) {
      socket.emit('leave-order', orderCode);
    }
  };

  const joinGroupRoom = (groupId: string) => {
    if (socket) {
      socket.emit('join-group', groupId);
    }
  };

  const leaveGroupRoom = (groupId: string) => {
    if (socket) {
      socket.emit('leave-group', groupId);
    }
  };

  const value = {
    socket,
    connected,
    joinOrderRoom,
    leaveOrderRoom,
    joinGroupRoom,
    leaveGroupRoom
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};