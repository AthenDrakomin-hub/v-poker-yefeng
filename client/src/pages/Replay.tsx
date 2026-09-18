import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * V-POKER 战绩回放页面
 */

interface GameRecord {
  replay_id: string;
  room_id: string;
  game_type: string;
  round_no: number;
  players: { user_id: string; username: string; result: number }[];
  duration_sec: number;
  created_at: number;
  total_pot: number;
}

export default function Replay() {
  const navigate = useNavigate();
  const [records, setRecords] = useState<GameRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<GameRecord | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadRecords();
  }, []);

  const loadRecords = async () => {
    setLoading(true);
    // 模拟数据
    setTimeout(() => {
      setRecords([
        {
          replay_id: 'replay_001',
          room_id: '888888',
          game_type: 'texas_holdem',
          round_no: 3,
          players: [
            { user_id: 'player_alice', username: 'Alice', result: 25000 },
            { user_id: 'player_bob', username: 'Bob', result: -10000 },
            { user_id: 'player_charlie', username: 'Charlie', result: -15000 },
          ],
          duration_sec: 180,
          created_at: Date.now() - 3600000,
          total_pot: 50000,
        },
        {
          replay_id: 'replay_002',
          room_id: '666666',
          game_type: 'zha_jin_hua',
          round_no: 5,
          players: [
            { user_id: 'player_alice', username: 'Alice', result: -10000 },
            { user_id: 'player_bob', username: 'Bob', result: 30000 },
            { user_id: 'player_charlie', username: 'Charlie', result: -20000 },
          ],
          duration_sec: 240,
          created_at: Date.now() - 7200000,
          total_pot: 60000,
        },
      ]);
      setLoading(false);
    }, 500);
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getGameName = (type: string) => {
    const map: Record<string, string> = {
      texas_holdem: '德州扑克',
      zha_jin_hua: '炸金花',
      niu_niu: '牛牛',
      san_gong: '三公',
    };
    return map[type] || type;
  };

  return (
    <div className="min-h-screen bg-vp-black p-6">
      <div className="max-w-4xl mx-auto">
        {/* 头部 */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/')}
            className="text-vp-text-muted hover:text-vp-gold transition-colors mb-4"
          >
            ← 返回大厅
          </button>
          <h1 className="text-3xl font-bold text-vp-gold">🎬 战绩回放</h1>
          <p className="text-vp-text-muted mt-2">查看历史对局记录，复盘每局操作</p>
        </div>

        {/* 记录列表 */}
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-12 text-vp-text-muted">加载中...</div>
          ) : records.length === 0 ? (
            <div className="glass-card p-12 text-center">
              <p className="text-vp-text-muted">暂无对局记录</p>
            </div>
          ) : (
            records.map((record) => (
              <div
                key={record.replay_id}
                className="glass-card p-4 hover:border-vp-gold/30 transition-colors cursor-pointer"
                onClick={() => setSelectedRecord(record)}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">
                      {record.game_type === 'texas_holdem' ? '♠️' : record.game_type === 'zha_jin_hua' ? '🃏' : record.game_type === 'niu_niu' ? '🐂' : '🎴'}
                    </span>
                    <div>
                      <h3 className="font-bold">{getGameName(record.game_type)}</h3>
                      <p className="text-sm text-vp-text-muted">
                        房间 #{record.room_id} · 第 {record.round_no} 局
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-vp-text-muted">{formatTime(record.created_at)}</p>
                    <p className="text-sm text-vp-text-muted">时长: {Math.floor(record.duration_sec / 60)}分{record.duration_sec % 60}秒</p>
                  </div>
                </div>

                {/* 玩家结果 */}
                <div className="flex gap-4 flex-wrap">
                  {record.players.map((player) => (
                    <div
                      key={player.user_id}
                      className={`px-3 py-1 rounded-lg text-sm ${
                        player.result > 0
                          ? 'bg-vp-success/20 text-vp-success'
                          : 'bg-vp-danger/20 text-vp-danger'
                      }`}
                    >
                      {player.username}: {player.result > 0 ? '+' : ''}{player.result.toLocaleString()}
                    </div>
                  ))}
                </div>

                <div className="mt-3 pt-3 border-t border-white/10 flex justify-between items-center">
                  <span className="text-sm text-vp-text-muted">
                    底池: {record.total_pot.toLocaleString()}
                  </span>
                  <button className="text-vp-gold text-sm hover:underline">
                    回放 →
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 回放详情弹窗（简化版） */}
      {selectedRecord && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
          onClick={() => setSelectedRecord(null)}
        >
          <div
            className="glass-card p-6 w-full max-w-2xl mx-4 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-bold text-vp-gold mb-4">
              {getGameName(selectedRecord.game_type)} - 第 {selectedRecord.round_no} 局
            </h2>

            <div className="space-y-4">
              <div className="glass-card p-4">
                <h3 className="font-bold mb-2">📊 对局信息</h3>
                <p className="text-sm text-vp-text-muted">房间: #{selectedRecord.room_id}</p>
                <p className="text-sm text-vp-text-muted">时间: {formatTime(selectedRecord.created_at)}</p>
                <p className="text-sm text-vp-text-muted">底池: {selectedRecord.total_pot.toLocaleString()}</p>
              </div>

              <div className="glass-card p-4">
                <h3 className="font-bold mb-2">👥 玩家结果</h3>
                {selectedRecord.players.map((player) => (
                  <div key={player.user_id} className="flex justify-between py-2 border-b border-white/10 last:border-0">
                    <span>{player.username}</span>
                    <span className={player.result > 0 ? 'text-vp-success' : 'text-vp-danger'}>
                      {player.result > 0 ? '+' : ''}{player.result.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => setSelectedRecord(null)}
              className="w-full mt-6 px-4 py-3 bg-white/5 border border-white/20 rounded-lg hover:bg-white/10 transition-colors"
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
