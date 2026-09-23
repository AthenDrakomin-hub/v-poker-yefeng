/**
 * 共享类型定义
 */

export interface Card {
  rank: string;
  suit: 'spades' | 'hearts' | 'diamonds' | 'clubs';
}

export interface PlayerSeat {
  userId: string | null;
  chips: number;
  currentBet: number;
  status: 'empty' | 'ready' | 'playing' | 'folded' | 'allin';
  isWinner: boolean;
  isDisconnected?: boolean;
}

export interface GameState {
  roomId: string;
  pot: number;
  seats: PlayerSeat[];
  communityCards: Card[];
  currentTurn?: number;
  actionDeadline?: number;
  phase?: 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
}

export interface GameAction {
  type: 'action';
  action: 'fold' | 'check' | 'call' | 'raise' | 'allin' | 'see_cards' | 'compare';
  amount?: number;
  targetUserId?: string;
}
