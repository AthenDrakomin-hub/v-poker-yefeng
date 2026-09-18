import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import Lobby from './pages/Lobby';
import PokerTable from './pages/PokerTable';
import Wallet from './pages/Wallet';
import Friends from './pages/Friends';
import Leaderboard from './pages/Leaderboard';
import Achievements from './pages/Achievements';
import Replay from './pages/Replay';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';
import { getToken } from './api/client';
import './App.css';

// 路由守卫：未登录跳登录页
function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = getToken();
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 公开路由 */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />

        {/* 私有路由（需要登录） */}
        <Route path="/" element={
          <PrivateRoute>
            <Lobby />
          </PrivateRoute>
        } />
        <Route path="/room/:roomId" element={
          <PrivateRoute>
            <PokerTable />
          </PrivateRoute>
        } />
        <Route path="/wallet" element={
          <PrivateRoute>
            <Wallet />
          </PrivateRoute>
        } />
        <Route path="/friends" element={
          <PrivateRoute>
            <Friends />
          </PrivateRoute>
        } />
        <Route path="/leaderboard" element={
          <PrivateRoute>
            <Leaderboard />
          </PrivateRoute>
        } />
        <Route path="/achievements" element={
          <PrivateRoute>
            <Achievements />
          </PrivateRoute>
        } />
        <Route path="/replay" element={
          <PrivateRoute>
            <Replay />
          </PrivateRoute>
        } />

        {/* 兜底路由 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
