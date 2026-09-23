/**
 * 平台核心 WebSocket 协议封包/解包 (WSProtocol)
 * 标准协议：{ op: string, req_id?: string, data: any, code?: number, message?: string }
 */

export type ClientOp = "join_room" | "leave_room" | "player_action" | "sync_state" | "ping";
export type ServerOp = "room_state" | "phase_changed" | "action_broadcast" | "settlement_payout" | "pong" | "error";

export interface WsClientMessage<T = any> {
  op: ClientOp;
  req_id?: string;
  data: T;
}

export interface WsServerMessage<T = any> {
  op: ServerOp;
  req_id?: string;
  code: number; // 0=成功
  message?: string;
  data?: T;
  timestamp: number;
}

export class WSProtocol {
  public static pack<T>(op: ServerOp, data?: T, code = 0, message = "OK", req_id?: string): string {
    const payload: WsServerMessage<T> = {
      op,
      req_id,
      code,
      message,
      data,
      timestamp: Date.now()
    };
    return JSON.stringify(payload);
  }

  public static unpack(raw: string): WsClientMessage | null {
    try {
      const parsed = JSON.parse(raw);
      if (!parsed.op) return null;
      return parsed as WsClientMessage;
    } catch {
      return null;
    }
  }
}
