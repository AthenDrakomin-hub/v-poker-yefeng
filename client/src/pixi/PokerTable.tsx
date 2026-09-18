/**
 * PixiJS 牌桌 React 组件
 * 接入真实 WebSocket 游戏状态
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { PixiTable } from './PixiTable';
import { gameClient, type RoomState } from '../ws/gameSocket';
import type { GameState } from '../shared/types';

interface PokerTableProps {
  roomId: string;
  userId: string;
}

export function PokerTable({ roomId, userId }: PokerTableProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pixiTableRef = useRef<PixiTable | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pot, setPot] = useState(0);

  // 将 RoomState 转换为 GameState
  const transformState = useCallback((roomState: RoomState): GameState => {
    return {
      roomId,
      pot: roomState.round_state?.pot || 0,
      seats: roomState.seats?.map((seat: any) => ({
        userId: seat.user_id || null,
        chips: seat.chips || 0,
        currentBet: seat.current_bet || 0,
        status: seat.status || 'empty',
        isWinner: seat.is_winner || false,
        isDisconnected: seat.is_disconnected || false,
      })) || [],
      communityCards: ((roomState as any).community_cards || []).map((card: string) => ({
        rank: card.slice(0, -1),
        suit: card.slice(-1) as any,
      })),
      currentTurn: roomState.round_state?.current_turn,
      actionDeadline: roomState.round_state?.action_deadline,
      phase: roomState.round_state?.phase,
    };
  }, [roomId]);

  // 初始化 PixiJS + WebSocket
  useEffect(() => {
    if (!canvasRef.current) return;

    let unsubscribe: (() => void) | undefined;

    const init = async () => {
      // 1. 初始化 PixiJS
      const pixiTable = new PixiTable();
      await pixiTable.init(canvasRef.current!);
      pixiTableRef.current = pixiTable;

      // 2. 连接 WebSocket
      gameClient.connect(roomId, userId);

      // 3. 订阅状态更新
      unsubscribe = gameClient.onStateUpdate((roomState: RoomState) => {
        const gameState = transformState(roomState);
        pixiTable.updateGameState(gameState);
        setPot(gameState.pot);
      });

      // 4. 首次加载获取状态（HTTP 降级）
      const state = await gameClient.getRoomState(roomId);
      if (state) {
        const gameState = transformState(state);
        pixiTable.updateGameState(gameState);
        setPot(gameState.pot);
      }

      setIsLoading(false);
    };

    init();

    return () => {
      unsubscribe?.();
      gameClient.disconnect();
      pixiTableRef.current?.destroy();
    };
  }, [roomId, userId, transformState]);

  // 动作处理
  const handleAction = useCallback(async (action: string, amount?: number) => {
    await gameClient.performAction(roomId, userId, {
      action_type: action as any,
      user_id: userId,
      amount,
    });
  }, [roomId, userId]);

  return (
    <div className="relative w-full h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* 加载中 */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-50">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-white text-xl">正在加载牌桌...</p>
          </div>
        </div>
      )}

      {/* PixiJS Canvas */}
      <canvas ref={canvasRef} className="w-full h-full" />

      {/* 顶栏 */}
      {!isLoading && (
        <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center bg-gradient-to-b from-black/60 to-transparent">
          <div className="flex items-center gap-3">
            <img src="/assets/ui/logo.png" alt="V-POKER" className="h-10" />
            <div className="text-white">
              <div className="text-xs opacity-70">房间号</div>
              <div className="text-xl font-bold">{roomId}</div>
            </div>
          </div>
          <div className="text-white text-right">
            <div className="text-xs opacity-70">玩家</div>
            <div className="text-xl font-bold">{userId}</div>
          </div>
        </div>
      )}

      {/* 底池显示 */}
      {!isLoading && (
        <div className="absolute top-1/3 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
          <div className="text-white/60 text-sm mb-1">底池</div>
          <div className="text-amber-400 text-4xl font-bold drop-shadow-lg">
            {pot.toLocaleString()}
          </div>
        </div>
      )}

      {/* 操作按钮层 */}
      {!isLoading && (
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex gap-4">
          <button
            onClick={() => handleAction('fold')}
            className="px-8 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-lg transition-all transform hover:scale-105 active:scale-95"
          >
            弃牌
          </button>
          <button
            onClick={() => handleAction('check')}
            className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg transition-all transform hover:scale-105 active:scale-95"
          >
            过牌
          </button>
          <button
            onClick={() => handleAction('call')}
            className="px-8 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-lg transition-all transform hover:scale-105 active:scale-95"
          >
            跟注
          </button>
          <button
            onClick={() => {
              const amount = prompt('请输入加注金额:', '100');
              if (amount) handleAction('raise', parseInt(amount));
            }}
            className="px-8 py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shadow-lg transition-all transform hover:scale-105 active:scale-95"
          >
            加注
          </button>
          <button
            onClick={() => handleAction('all_in')}
            className="px-8 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow-lg transition-all transform hover:scale-105 active:scale-95"
          >
            全下
          </button>
        </div>
      )}
    </div>
  );
}
