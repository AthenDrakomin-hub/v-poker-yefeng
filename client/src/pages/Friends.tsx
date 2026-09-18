import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * V-POKER 好友系统页面
 */

interface Friend {
  id: string;
  user_id: string;
  username: string;
  avatar?: string;
  status: 'online' | 'offline' | 'playing';
  balance?: number;
  note?: string;
}

export default function Friends() {
  const navigate = useNavigate();
  const userId = localStorage.getItem('vp_user_id') || '';
  const [friends, setFriends] = useState<Friend[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [searchResult, setSearchResult] = useState<Friend | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadFriends();
  }, [userId]);

  const loadFriends = async () => {
    try {
      // 这里调用后端 API，暂时用模拟数据
      setFriends([
        { id: '1', user_id: 'player_alice', username: 'Alice', status: 'playing', balance: 50000 },
        { id: '2', user_id: 'player_bob', username: 'Bob', status: 'online', balance: 30000 },
        { id: '3', user_id: 'player_charlie', username: 'Charlie', status: 'offline', balance: 80000 },
      ]);
    } catch (err) {
      console.error('Failed to load friends:', err);
    }
  };

  const handleSearch = async () => {
    if (!searchValue.trim()) return;
    setLoading(true);
    try {
      // 这里调用后端 API，暂时用模拟数据
      setTimeout(() => {
        setSearchResult({
          id: '4',
          user_id: searchValue,
          username: searchValue,
          status: 'offline',
        });
        setLoading(false);
      }, 500);
    } catch (err) {
      setLoading(false);
    }
  };

  const handleAddFriend = async (_friendId: string) => {
    try {
      // 这里调用后端 API
      alert('好友请求已发送');
      setShowAddModal(false);
      setSearchResult(null);
      setSearchValue('');
    } catch (err) {
      alert('添加好友失败');
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      online: '#10b981',
      offline: '#6b7280',
      playing: '#f59e0b',
    };
    const labels: Record<string, string> = {
      online: '在线',
      offline: '离线',
      playing: '游戏中',
    };
    return (
      <span
        className="px-2 py-0.5 rounded-full text-xs"
        style={{
          background: `${colors[status]}20`,
          color: colors[status],
          border: `1px solid ${colors[status]}40`,
        }}
      >
        {labels[status]}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-vp-black p-6">
      {/* 头部 */}
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <button
              onClick={() => navigate('/')}
              className="text-vp-text-muted hover:text-vp-gold transition-colors mb-4"
            >
              ← 返回大厅
            </button>
            <h1 className="text-3xl font-bold text-vp-gold">👥 好友列表</h1>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="btn-gold"
          >
            + 添加好友
          </button>
        </div>

        {/* 好友列表 */}
        <div className="space-y-4">
          {friends.length === 0 ? (
            <div className="glass-card p-12 text-center">
              <p className="text-vp-text-muted mb-4">还没有好友，快去添加吧</p>
              <button
                onClick={() => setShowAddModal(true)}
                className="btn-gold"
              >
                添加第一个好友
              </button>
            </div>
          ) : (
            friends.map((friend) => (
              <div
                key={friend.id}
                className="glass-card p-4 flex items-center justify-between hover:border-vp-gold/30 transition-colors"
              >
                <div className="flex items-center gap-4">
                  {/* 头像 */}
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold"
                    style={{
                      background: 'linear-gradient(135deg, #d4af3740, #d4af3720)',
                      border: '2px solid #d4af3760',
                    }}
                  >
                    {friend.username[0]}
                  </div>

                  {/* 用户信息 */}
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-lg">{friend.username}</span>
                      {getStatusBadge(friend.status)}
                    </div>
                    <p className="text-sm text-vp-text-muted mt-1">
                      ID: {friend.user_id}
                      {friend.balance !== undefined && (
                        <span className="ml-4">筹码: {friend.balance.toLocaleString()}</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* 操作按钮 */}
                <div className="flex gap-2">
                  {friend.status === 'online' || friend.status === 'playing' ? (
                    <button className="px-4 py-2 bg-vp-gold/20 border border-vp-gold/50 rounded-lg text-vp-gold hover:bg-vp-gold/30 transition-colors text-sm">
                      邀请游戏
                    </button>
                  ) : (
                    <button className="px-4 py-2 bg-white/5 border border-white/20 rounded-lg text-vp-text-muted transition-colors text-sm" disabled>
                      离线
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 添加好友弹窗 */}
      {showAddModal && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="glass-card p-6 w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-vp-gold mb-4">添加好友</h2>

            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                placeholder="输入玩家 ID 或昵称"
                className="flex-1 px-4 py-3 bg-white/5 border border-white/20 rounded-lg focus:border-vp-gold/50 outline-none"
              />
              <button
                onClick={handleSearch}
                disabled={loading}
                className="px-6 py-3 bg-vp-gold/20 border border-vp-gold/50 rounded-lg text-vp-gold hover:bg-vp-gold/30 transition-colors"
              >
                {loading ? '搜索中...' : '搜索'}
              </button>
            </div>

            {searchResult && (
              <div className="glass-card p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-vp-gold/20 flex items-center justify-center font-bold">
                      {searchResult.username[0]}
                    </div>
                    <div>
                      <div className="font-semibold">{searchResult.username}</div>
                      <div className="text-sm text-vp-text-muted">{searchResult.user_id}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleAddFriend(searchResult.user_id)}
                    className="btn-gold text-sm px-4 py-2"
                  >
                    发送请求
                  </button>
                </div>
              </div>
            )}

            <button
              onClick={() => setShowAddModal(false)}
              className="w-full mt-4 px-4 py-2 bg-white/5 border border-white/20 rounded-lg hover:bg-white/10 transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
