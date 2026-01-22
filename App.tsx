import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';
import { NotificationProvider } from './contexts/NotificationContext';
import Navbar from './components/Navbar';
import NotificationContainer from './components/NotificationContainer';
import RealTimeNotifications from './components/RealTimeNotifications';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import MenuCreatePage from './pages/MenuCreatePage';
import MenuEditPage from './pages/MenuEditPage';
import OrderManagePage from './pages/OrderManagePage';
import OrderDetailPage from './pages/OrderDetailPage';
import ParticipantPage from './pages/ParticipantPage';
import CommunityPage from './pages/CommunityPage';
import GroupPage from './pages/GroupPage';
import './App.css';

function App() {
  return (
    <NotificationProvider>
      <AuthProvider>
        <SocketProvider>
          <Router>
            <div className="App">
              <Navbar />
              <NotificationContainer />
              <RealTimeNotifications />
              <main className="main-content">
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/register" element={<RegisterPage />} />
                  <Route path="/menu/create" element={<MenuCreatePage />} />
                  <Route path="/menu/edit/:id" element={<MenuEditPage />} />
                  <Route path="/order/manage" element={<OrderManagePage />} />
                  <Route path="/order/:code" element={<OrderDetailPage />} />
                  <Route path="/participant/:code" element={<ParticipantPage />} />
                  <Route path="/community" element={<CommunityPage />} />
                  <Route path="/group" element={<GroupPage />} />
                </Routes>
              </main>
            </div>
          </Router>
        </SocketProvider>
      </AuthProvider>
    </NotificationProvider>
  );
}

export default App;