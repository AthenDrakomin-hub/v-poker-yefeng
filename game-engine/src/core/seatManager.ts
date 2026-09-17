/**
 * 平台核心座位管理器 (SeatManager)
 * 职责：座位分配、离座、切态、携带筹码与重置
 */

import { Seat } from "../shared/types.js";

export class SeatManager {
  private seats: Seat[];

  constructor(maxSeats: number) {
    this.seats = Array.from({ length: maxSeats }, (_, i) => ({
      seat_index: i,
      user_id: null,
      chips: 0,
      current_bet: 0,
      status: "empty",
      cards: [],
      is_banker: false,
      banker_multiplier: 0,
      bet_multiplier: 1,
      has_acted: false,
      has_viewed_cards: false
    }));
  }

  getSeats(): Seat[] {
    return this.seats;
  }

  getSeat(seatIndex: number): Seat | undefined {
    return this.seats[seatIndex];
  }

  findUserSeat(userId: string): Seat | undefined {
    return this.seats.find((s) => s.user_id === userId);
  }

  sitDown(seatIndex: number, userId: string, initialChips: number): boolean {
    const seat = this.seats[seatIndex];
    if (!seat || seat.status !== "empty") return false;

    // 检查该用户是否已经在其他席位
    if (this.findUserSeat(userId)) return false;

    seat.user_id = userId;
    seat.chips = initialChips;
    seat.status = "ready";
    return true;
  }

  standUp(seatIndex: number): boolean {
    const seat = this.seats[seatIndex];
    if (!seat || seat.status === "empty") return false;

    seat.user_id = null;
    seat.chips = 0;
    seat.status = "empty";
    seat.cards = [];
    seat.is_banker = false;
    seat.has_acted = false;
    seat.has_viewed_cards = false;
    seat.hand_result = undefined;
    return true;
  }

  resetRoundState(): void {
    this.seats.forEach((seat) => {
      if (seat.user_id) {
        seat.status = "ready";
        seat.cards = [];
        seat.current_bet = 0;
        seat.is_banker = false;
        seat.banker_multiplier = 0;
        seat.bet_multiplier = 1;
        seat.has_acted = false;
        seat.has_viewed_cards = false;
        seat.hand_result = undefined;
      }
    });
  }

  getActivePlayersCount(): number {
    return this.seats.filter((s) => s.status === "ready" || s.status === "playing").length;
  }
}
