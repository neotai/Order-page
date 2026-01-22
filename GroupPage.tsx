import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useSocket } from '../contexts/SocketContext';
import './GroupPage.css';

interface Group {
  _id: string;
  name: string;
  description?: string;
  memberCount: number;
  isOwner: boolean;
  createdAt: string;
}

interface Message {
  _id: string;
  content: string;
  sender: {
    defaultNickname: string;
  };
  createdAt: string;
}

const GroupPage: React.FC = () => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { socket, joinGroupRoom, leaveGroupRoom } = useSocket();

  useEffect(() => {
    const fetchGroups = async () => {
      try {
        const response = await axios.get('/api/group');
        if (response.data.success) {
          setGroups(response.data.groups);
        }
      } catch (error: any) {
        setError('載入群族失敗');
        console.error('Error fetching groups:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchGroups();
  }, []);

  useEffect(() => {
    if (selectedGroup) {
      fetchMessages(selectedGroup._id);
      joinGroupRoom(selectedGroup._id);
    }

    return () => {
      if (selectedGroup) {
        leaveGroupRoom(selectedGroup._id);
      }
    };
  }, [selectedGroup, joinGroupRoom, leaveGroupRoom]);

  useEffect(() => {
    if (socket && selectedGroup) {
      const handleNewMessage = (message: Message) => {
        setMessages(prev => [...prev, message]);
      };

      socket.on('new-group-message', handleNewMessage);

      return () => {
        socket.off('new-group-message', handleNewMessage);
      };
    }
  }, [socket, selectedGroup]);

  const fetchMessages = async (groupId: string) => {
    try {
      const response = await axios.get(`/api/group-message/${groupId}`);
      if (response.data.success) {
        setMessages(response.data.messages);
      }
    } catch (error: any) {
      console.error('Error fetching messages:', error);
    }
  };

  const createGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;

    try {
      const response = await axios.post('/api/group', {
        name: newGroupName.trim(),
        description: newGroupDescription.trim() || undefined
      });

      if (response.data.success) {
        setGroups(prev => [...prev, response.data.group]);
        setNewGroupName('');
        setNewGroupDescription('');
        setShowCreateForm(false);
      }
    } catch (error: any) {
      setError(error.response?.data?.error || '建立群族失敗');
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedGroup) return;

    try {
      const response = await axios.post(`/api/group-message/${selectedGroup._id}`, {
        content: newMessage.trim()
      });

      if (response.data.success) {
        setNewMessage('');
      }
    } catch (error: any) {
      setError(error.response?.data?.error || '發送訊息失敗');
    }
  };

  if (loading) {
    return (
      <div className="group-page">
        <div className="loading-container">
          <div className="loading-message">載入群族中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="group-page">
      <div className="group-container">
        <div className="groups-sidebar">
          <div className="sidebar-header">
            <h2>我的群族</h2>
            <button 
              onClick={() => setShowCreateForm(true)}
              className="create-group-btn"
            >
              + 建立群族
            </button>
          </div>

          {showCreateForm && (
            <form onSubmit={createGroup} className="create-group-form">
              <input
                type="text"
                placeholder="群族名稱"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                required
              />
              <textarea
                placeholder="群族描述（可選）"
                value={newGroupDescription}
                onChange={(e) => setNewGroupDescription(e.target.value)}
                rows={3}
              />
              <div className="form-actions">
                <button type="submit" className="submit-btn">建立</button>
                <button 
                  type="button" 
                  onClick={() => setShowCreateForm(false)}
                  className="cancel-btn"
                >
                  取消
                </button>
              </div>
            </form>
          )}

          <div className="groups-list">
            {groups.length === 0 ? (
              <div className="empty-state">
                <p>您還沒有加入任何群族</p>
              </div>
            ) : (
              groups.map(group => (
                <div 
                  key={group._id} 
                  className={`group-item ${selectedGroup?._id === group._id ? 'active' : ''}`}
                  onClick={() => setSelectedGroup(group)}
                >
                  <h3>{group.name}</h3>
                  <p className="group-meta">
                    👥 {group.memberCount} 人
                    {group.isOwner && <span className="owner-badge">管理員</span>}
                  </p>
                  {group.description && (
                    <p className="group-description">{group.description}</p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="chat-area">
          {selectedGroup ? (
            <>
              <div className="chat-header">
                <h2>{selectedGroup.name}</h2>
                <p>👥 {selectedGroup.memberCount} 位成員</p>
              </div>

              {error && <div className="error-message">{error}</div>}

              <div className="messages-container">
                {messages.length === 0 ? (
                  <div className="empty-messages">
                    <p>還沒有訊息，開始聊天吧！</p>
                  </div>
                ) : (
                  messages.map(message => (
                    <div key={message._id} className="message">
                      <div className="message-header">
                        <span className="sender">{message.sender.defaultNickname}</span>
                        <span className="timestamp">
                          {new Date(message.createdAt).toLocaleString('zh-TW')}
                        </span>
                      </div>
                      <div className="message-content">{message.content}</div>
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={sendMessage} className="message-form">
                <input
                  type="text"
                  placeholder="輸入訊息..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  className="message-input"
                />
                <button type="submit" className="send-btn">
                  發送
                </button>
              </form>
            </>
          ) : (
            <div className="no-group-selected">
              <h2>選擇一個群族開始聊天</h2>
              <p>從左側選擇一個群族，或建立新的群族</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GroupPage;