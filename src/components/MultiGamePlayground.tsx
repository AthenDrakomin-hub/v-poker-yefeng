import React, { useState, useEffect } from "react";
import {
  Sparkles,
  Trophy,
  Layers,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  Coins,
  Send,
  Eye,
  EyeOff,
  Flame,
  Crown,
  Zap,
  Check
} from "lucide-react";
import { Card, GameMode, GameSettleRequest, GameType, PlayerNetResult, Suit } from "../types";
import { createStandardDeck, getRankLabel, getSuitSymbol, isRedSuit } from "../gameEngine/deck";
import { evaluateNiuNiu, evaluateSanGong, evaluateTexas7Cards, evaluateZhaJinHua } from "../gameEngine/evaluators";
import { sandbox } from "../mockEngine";

interface GameOption {
  id: string;
  game_type: GameType;
  mode: GameMode;
  name: string;
  badge: string;
  cardCount: number;
  description: string;
}

const GAME_OPTIONS: GameOption[] = [
  {
    id: "texas_holdem_fixed",
    game_type: "texas_holdem",
    mode: "fixed",
    name: "德州扑克",
    badge: "2底牌+5公共牌",
    cardCount: 2,
    description: "4轮下注圈 (翻牌/转牌/河牌)，7选5最大牌型，多边池争夺"
  },
  {
    id: "zha_jin_hua_normal",
    game_type: "zha_jin_hua",
    mode: "normal",
    name: "炸金花",
    badge: "3张牌·暗注/明注",
    cardCount: 3,
    description: "暗牌闷注半价，明牌看注翻倍，豹子>顺金>金花>顺子>对子"
  },
  {
    id: "niu_niu_qiang_zhuang",
    game_type: "niu_niu",
    mode: "qiang_zhuang",
    name: "抢庄牛牛",
    badge: "5张牌·抢庄1~4倍",
    cardCount: 5,
    description: "3张凑10整数倍，2张看点数，庄家与闲家按倍数1对1比拼"
  },
  {
    id: "niu_niu_tong_bi",
    game_type: "niu_niu",
    mode: "tong_bi",
    name: "通比牛牛",
    badge: "5张牌·无庄全场比",
    cardCount: 5,
    description: "无庄家争夺，全场入局玩家统一按底分与牛牛牌型倍数通吃结算"
  },
  {
    id: "san_gong_qiang_zhuang",
    game_type: "san_gong",
    mode: "qiang_zhuang",
    name: "抢庄三公",
    badge: "3张牌·抢庄对决",
    cardCount: 3,
    description: "JQK公牌算0点，大三公>小三公>混三公>9点，庄闲倍数对决"
  },
  {
    id: "san_gong_tong_bi",
    game_type: "san_gong",
    mode: "tong_bi",
    name: "通比三公",
    badge: "3张牌·无庄全场比",
    cardCount: 3,
    description: "全员固定底注，按三公牌力最高者通吃或按排位分差结算"
  }
];

interface PlayerSeat {
  userId: string;
  name: string;
  avatar: string;
  cards: Card[];
  isBanker: boolean;
  bankerMultiplier: number;
  betMultiplier: number;
  hasViewed: boolean;
  status: "playing" | "folded" | "out";
  handName: string;
  score: number;
  multiplier: number;
}

export const MultiGamePlayground: React.FC = () => {
  const [selectedGame, setSelectedGame] = useState<GameOption>(GAME_OPTIONS[0]);
  const [phase, setPhase] = useState<"WAITING" | "DEALING" | "BETTING" | "SHOWDOWN" | "SETTLED">("WAITING");
  const [baseScore, setBaseScore] = useState<number>(200);
  const [communityCards, setCommunityCards] = useState<Card[]>([]);
  const [deck, setDeck] = useState<Card[]>([]);
  const [players, setPlayers] = useState<PlayerSeat[]>([
    { userId: "p_alice", name: "Alice (玩家1)", avatar: "👩‍💼", cards: [], isBanker: false, bankerMultiplier: 1, betMultiplier: 1, hasViewed: true, status: "playing", handName: "", score: 0, multiplier: 1 },
    { userId: "p_bob", name: "Bob (玩家2)", avatar: "👨‍💻", cards: [], isBanker: false, bankerMultiplier: 2, betMultiplier: 1, hasViewed: true, status: "playing", handName: "", score: 0, multiplier: 1 },
    { userId: "p_charlie", name: "Charlie (玩家3)", avatar: "🧑‍🎨", cards: [], isBanker: false, bankerMultiplier: 0, betMultiplier: 2, hasViewed: true, status: "playing", handName: "", score: 0, multiplier: 1 },
    { userId: "p_david", name: "David (玩家4)", avatar: "🤵", cards: [], isBanker: false, bankerMultiplier: 1, betMultiplier: 1, hasViewed: true, status: "playing", handName: "", score: 0, multiplier: 1 }
  ]);

  const [settleRequest, setSettleRequest] = useState<GameSettleRequest | null>(null);
  const [settleResult, setSettleResult] = useState<any | null>(null);
  const [texasStreet, setTexasStreet] = useState<number>(0); // 0=preflop, 1=flop, 2=turn, 3=river
  const [notification, setNotification] = useState<string | null>(null);

  const showNotice = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };

  // 保证玩家钱包充足
  useEffect(() => {
    players.forEach((p) => {
      const w = sandbox.getWallet(p.userId);
      if (w.balance < 5000) {
        sandbox.mint(`init_${p.userId}_${Date.now()}`, "u_admin_root", p.userId, 100000, "Playground Auto-Fund");
      }
    });
  }, []);

  // 切换游戏重置
  const handleSelectGame = (opt: GameOption) => {
    setSelectedGame(opt);
    setPhase("WAITING");
    setCommunityCards([]);
    setTexasStreet(0);
    setSettleRequest(null);
    setSettleResult(null);
    setPlayers((prev) =>
      prev.map((p) => ({
        ...p,
        cards: [],
        isBanker: false,
        status: "playing",
        handName: "",
        score: 0,
        multiplier: 1
      }))
    );
  };

  // 1. 发牌
  const handleDeal = () => {
    const freshDeck = createStandardDeck();
    setSettleRequest(null);
    setSettleResult(null);
    setCommunityCards([]);
    setTexasStreet(0);

    const updatedPlayers = [...players];
    const cardCount = selectedGame.cardCount;

    // 定庄 (抢庄模式下选 bankerMultiplier 最高者，或轮转)
    if (selectedGame.mode === "qiang_zhuang") {
      const highest = Math.max(...updatedPlayers.map((p) => p.bankerMultiplier));
      const candidates = updatedPlayers.filter((p) => p.bankerMultiplier === highest);
      const chosenBanker = candidates[Math.floor(Math.random() * candidates.length)];
      updatedPlayers.forEach((p) => {
        p.isBanker = p.userId === chosenBanker.userId;
      });
    } else {
      updatedPlayers.forEach((p) => (p.isBanker = false));
    }

    // 分发手牌
    updatedPlayers.forEach((p) => {
      p.status = "playing";
      p.cards = [];
      for (let i = 0; i < cardCount; i++) {
        p.cards.push(freshDeck.pop()!);
      }
    });

    setDeck(freshDeck);

    // 初始评牌
    updatedPlayers.forEach((p) => {
      const evalRes = evaluatePlayerHand(selectedGame.game_type, p.cards, []);
      p.handName = evalRes.name;
      p.score = evalRes.score;
      p.multiplier = evalRes.multiplier;
    });

    setPlayers(updatedPlayers);
    setPhase("BETTING");
    showNotice(`【${selectedGame.name}】发牌完毕！进入对局阶段。`);
  };

  // 评牌辅助函数
  const evaluatePlayerHand = (gameType: GameType, cards: Card[], comm: Card[]) => {
    if (gameType === "niu_niu") {
      return evaluateNiuNiu(cards);
    }
    if (gameType === "san_gong") {
      return evaluateSanGong(cards);
    }
    if (gameType === "zha_jin_hua") {
      return evaluateZhaJinHua(cards);
    }
    if (gameType === "texas_holdem") {
      return evaluateTexas7Cards(cards, comm);
    }
    return { name: "未知", score: 0, multiplier: 1 };
  };

  // 德州扑克推进公共牌
  const handleTexasNextStreet = () => {
    if (selectedGame.game_type !== "texas_holdem") return;
    const currentDeck = [...deck];
    const newComm = [...communityCards];

    if (texasStreet === 0) {
      // 翻牌 Flop (3张)
      for (let i = 0; i < 3; i++) newComm.push(currentDeck.pop()!);
      setTexasStreet(1);
      showNotice("德州扑克：发出翻牌圈 (Flop) 3张公共牌");
    } else if (texasStreet === 1) {
      // 转牌 Turn (1张)
      newComm.push(currentDeck.pop()!);
      setTexasStreet(2);
      showNotice("德州扑克：发出转牌圈 (Turn) 第4张公共牌");
    } else if (texasStreet === 2) {
      // 河牌 River (1张)
      newComm.push(currentDeck.pop()!);
      setTexasStreet(3);
      showNotice("德州扑克：发出河牌圈 (River) 第5张公共牌");
    }

    setDeck(currentDeck);
    setCommunityCards(newComm);

    // 重新评估手牌
    setPlayers((prev) =>
      prev.map((p) => {
        const evalRes = evaluateTexas7Cards(p.cards, newComm);
        return {
          ...p,
          handName: evalRes.name,
          score: evalRes.score,
          multiplier: evalRes.multiplier
        };
      })
    );
  };

  // 2. 比牌并计算净输赢 (PlayerNetResult[])
  const handleShowdown = () => {
    setPhase("SHOWDOWN");

    const activePlayers = players.filter((p) => p.status === "playing");
    if (activePlayers.length === 0) return;

    // 确保德州公共牌发齐
    let finalComm = [...communityCards];
    let curDeck = [...deck];
    if (selectedGame.game_type === "texas_holdem" && finalComm.length < 5) {
      while (finalComm.length < 5 && curDeck.length > 0) {
        finalComm.push(curDeck.pop()!);
      }
      setCommunityCards(finalComm);
      setDeck(curDeck);
      setTexasStreet(3);
    }

    // 重新评牌
    const evaluated = activePlayers.map((p) => {
      const evalRes = evaluatePlayerHand(selectedGame.game_type, p.cards, finalComm);
      return {
        ...p,
        handName: evalRes.name,
        score: evalRes.score,
        multiplier: evalRes.multiplier
      };
    });

    // 排序
    evaluated.sort((a, b) => b.score - a.score);

    // 计算净输赢 net_amount
    const results: Record<string, number> = {};
    activePlayers.forEach((p) => (results[p.userId] = 0));

    if (selectedGame.mode === "qiang_zhuang") {
      // 抢庄模式：庄家与每位闲家单独算输赢
      const banker = evaluated.find((p) => p.isBanker) || evaluated[0];
      const bankerMult = Math.max(1, banker.bankerMultiplier || 1);

      evaluated.forEach((p) => {
        if (p.userId === banker.userId) return;

        const playerWins = p.score > banker.score;
        const winMult = playerWins ? p.multiplier : banker.multiplier;
        const exchange = baseScore * bankerMult * Math.max(1, p.betMultiplier) * winMult;

        if (playerWins) {
          results[p.userId] += exchange;
          results[banker.userId] -= exchange;
        } else {
          results[p.userId] -= exchange;
          results[banker.userId] += exchange;
        }
      });
    } else {
      // 通比/池模式 (德州、炸金花、通比牛牛、通比三公)：第一名通吃闲家
      const winner = evaluated[0];
      const winMult = winner.multiplier || 1;

      evaluated.forEach((p) => {
        if (p.userId === winner.userId) return;
        const loss = baseScore * winMult;
        results[p.userId] -= loss;
        results[winner.userId] += loss;
      });
    }

    const playerResults: PlayerNetResult[] = Object.entries(results).map(([userId, net]) => {
      const p = evaluated.find((x) => x.userId === userId);
      return {
        user_id: userId,
        net_amount: net,
        hand_name: p?.handName || "未知"
      };
    });

    // 组装标准 GameSettleRequest
    const grossTotal = playerResults.filter((p) => p.net_amount > 0).reduce((s, p) => s + p.net_amount, 0);
    const txId = `round_888_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const req: GameSettleRequest = {
      transaction_id: txId,
      game_type: selectedGame.game_type,
      room_id: "room_vip_888",
      total_pot: grossTotal * 2, // 模拟总流水
      platform_fee_rate: 0.0500,  // 平台抽水 5%
      agent_commission_rate: 0.0300, // 代理佣金 3%
      agent_ids: ["agt_room_03", "agt_sub_02", "agt_top_01"],
      player_results: playerResults
    };

    setSettleRequest(req);
    showNotice(`比牌完成！赢家为【${evaluated[0].name}】(${evaluated[0].handName})，已生成结算契约。`);
  };

  // 3. 执行原子结算 (POST /api/wallet/game_settle)
  const handleExecuteSettle = () => {
    if (!settleRequest) return;
    try {
      const result = sandbox.settleFromGameEngine(settleRequest);
      setSettleResult(result);
      setPhase("SETTLED");
      showNotice("钱包原子结算成功！抽水、代理分润、筹码变动全部完成，能量严格守恒。");
    } catch (e: any) {
      alert(`结算失败: ${e.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* 顶部通告 */}
      {notification && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 px-4 py-2.5 rounded-lg flex items-center justify-between text-sm shadow-sm animate-fade-in">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span className="font-medium">{notification}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-emerald-600 hover:text-emerald-900 text-xs">
            ✕
          </button>
        </div>
      )}

      {/* 游戏规则插件选择器 */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                平台核心 + 6 规则插件
              </span>
              <h2 className="text-lg font-bold text-slate-800">游戏模式切换 (Multi-Game Selector)</h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              底层复用统一房间、座位、状态机与钱包桥接层，规则通过插件接口严格隔离
            </p>
          </div>

          {/* 底分与房间控制 */}
          <div className="flex items-center space-x-3 bg-slate-50 p-2 rounded-lg border border-slate-200">
            <span className="text-xs text-slate-600 font-medium">底分基数:</span>
            <select
              value={baseScore}
              onChange={(e) => setBaseScore(Number(e.target.value))}
              disabled={phase === "DEALING" || phase === "BETTING"}
              className="bg-white border border-slate-300 rounded text-xs px-2 py-1 font-semibold text-slate-700"
            >
              <option value={100}>100 筹码</option>
              <option value={200}>200 筹码</option>
              <option value={500}>500 筹码</option>
              <option value={1000}>1000 筹码</option>
            </select>
          </div>
        </div>

        {/* 6款游戏卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {GAME_OPTIONS.map((opt) => {
            const isSelected = selectedGame.id === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => handleSelectGame(opt)}
                className={`p-3 rounded-lg border text-left transition-all ${
                  isSelected
                    ? "border-indigo-600 bg-indigo-50/70 shadow-sm ring-2 ring-indigo-500/20"
                    : "border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-sm font-bold ${isSelected ? "text-indigo-900" : "text-slate-800"}`}>
                    {opt.name}
                  </span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                </div>
                <div className="inline-block px-1.5 py-0.5 text-[10px] font-medium rounded bg-slate-100 text-slate-600 border border-slate-200 mb-1.5">
                  {opt.badge}
                </div>
                <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                  {opt.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* 虚拟牌桌区域 */}
      <div className="bg-gradient-to-b from-slate-900 via-emerald-950 to-slate-900 rounded-2xl border border-slate-800 p-6 shadow-xl relative overflow-hidden text-white">
        {/* 牌桌顶部信息 */}
        <div className="flex items-center justify-between border-b border-emerald-900/60 pb-4 mb-6">
          <div className="flex items-center space-x-3">
            <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse"></span>
            <div>
              <span className="text-xs uppercase tracking-wider text-emerald-400 font-semibold">
                ROOM #vip_888 · {selectedGame.name} ({selectedGame.mode})
              </span>
              <div className="text-sm font-bold text-slate-100 flex items-center space-x-2">
                <span>底分: {baseScore} 筹码</span>
                <span className="text-slate-500">|</span>
                <span>平台抽水: 5%</span>
                <span className="text-slate-500">|</span>
                <span>代理返佣: 3%</span>
              </div>
            </div>
          </div>

          {/* 状态徽章与操作控制 */}
          <div className="flex items-center space-x-2">
            <span className="px-3 py-1 rounded-full text-xs font-bold tracking-wide bg-emerald-900/80 border border-emerald-500/40 text-emerald-300">
              阶段: {phase}
            </span>

            {phase === "WAITING" || phase === "SETTLED" ? (
              <button
                onClick={handleDeal}
                className="flex items-center space-x-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-md transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>开始发牌 (Deal)</span>
              </button>
            ) : null}

            {phase === "BETTING" && selectedGame.game_type === "texas_holdem" && texasStreet < 3 ? (
              <button
                onClick={handleTexasNextStreet}
                className="flex items-center space-x-1.5 px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold shadow-md"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>
                  {texasStreet === 0 ? "发翻牌(Flop)" : texasStreet === 1 ? "发转牌(Turn)" : "发河牌(River)"}
                </span>
              </button>
            ) : null}

            {phase === "BETTING" ? (
              <button
                onClick={handleShowdown}
                className="flex items-center space-x-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold shadow-md transition-colors"
              >
                <Trophy className="w-3.5 h-3.5" />
                <span>亮牌比分 (Showdown)</span>
              </button>
            ) : null}
          </div>
        </div>

        {/* 牌桌中央：公共牌区 (德州) 或 平台荷官状态 */}
        <div className="flex flex-col items-center justify-center my-6 py-4 bg-emerald-900/20 rounded-xl border border-emerald-800/40">
          {selectedGame.game_type === "texas_holdem" ? (
            <div className="flex flex-col items-center space-y-2">
              <span className="text-[11px] font-semibold text-emerald-300 tracking-wider">
                德州扑克公共牌区 (Community Cards: 5选3)
              </span>
              <div className="flex items-center space-x-2">
                {communityCards.length === 0 ? (
                  <span className="text-xs text-emerald-400/60 py-4">等待翻牌圈 (Flop) 发牌...</span>
                ) : (
                  communityCards.map((c, i) => (
                    <div
                      key={i}
                      className={`w-11 h-16 bg-white rounded-md shadow-md flex flex-col items-center justify-center border font-bold text-sm ${
                        isRedSuit(c.suit) ? "text-red-600 border-red-200" : "text-slate-900 border-slate-300"
                      }`}
                    >
                      <span className="text-xs">{getRankLabel(c.rank)}</span>
                      <span className="text-base">{getSuitSymbol(c.suit)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-2">
              <span className="text-xs text-emerald-300 font-medium">
                {selectedGame.name} · 规则引擎驱动中
              </span>
              <p className="text-[11px] text-emerald-400/70 mt-0.5">
                {selectedGame.mode === "qiang_zhuang"
                  ? "抢庄模式：庄家与各闲家根据牌型倍数分别结算"
                  : selectedGame.mode === "tong_bi"
                  ? "通比模式：全场横向比牌，牌型最高者通吃"
                  : "标准博弈模式"}
              </p>
            </div>
          )}
        </div>

        {/* 4 位玩家座位展示 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          {players.map((p, idx) => {
            const wallet = sandbox.getWallet(p.userId);
            const netResult = settleRequest?.player_results.find((r) => r.user_id === p.userId);

            return (
              <div
                key={p.userId}
                className={`bg-slate-800/80 rounded-xl p-4 border transition-all ${
                  p.isBanker
                    ? "border-amber-500/80 shadow-lg shadow-amber-500/10"
                    : "border-slate-700/80"
                }`}
              >
                {/* 玩家头像与身份 */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <span className="text-2xl">{p.avatar}</span>
                    <div>
                      <div className="flex items-center space-x-1.5">
                        <span className="text-xs font-bold text-slate-100">{p.name}</span>
                        {p.isBanker && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 text-[10px] font-black flex items-center space-x-0.5">
                            <Crown className="w-2.5 h-2.5 inline" />
                            <span>庄家</span>
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center space-x-1">
                        <Coins className="w-3 h-3 text-amber-400" />
                        <span>钱包: {wallet.balance.toLocaleString()} 筹码</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 抢庄与下注倍数调节 (WAITING阶段可选) */}
                {phase === "WAITING" && selectedGame.mode === "qiang_zhuang" && (
                  <div className="bg-slate-900/60 p-2 rounded border border-slate-700/60 mb-3 text-[11px] space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">抢庄意愿:</span>
                      <select
                        value={p.bankerMultiplier}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setPlayers((prev) =>
                            prev.map((x) => (x.userId === p.userId ? { ...x, bankerMultiplier: val } : x))
                          );
                        }}
                        className="bg-slate-800 text-slate-200 border border-slate-600 rounded px-1.5 py-0.5 text-xs font-semibold"
                      >
                        <option value={0}>不抢</option>
                        <option value={1}>抢1倍</option>
                        <option value={2}>抢2倍</option>
                        <option value={3}>抢3倍</option>
                        <option value={4}>抢4倍</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* 玩家手牌渲染 */}
                <div className="min-h-[70px] flex items-center justify-center space-x-1.5 bg-slate-900/40 p-2 rounded-lg border border-slate-800">
                  {p.cards.length === 0 ? (
                    <span className="text-[11px] text-slate-500">待发牌</span>
                  ) : (
                    p.cards.map((c, i) => (
                      <div
                        key={i}
                        className={`w-9 h-14 bg-white rounded shadow flex flex-col items-center justify-center font-bold text-xs ${
                          isRedSuit(c.suit) ? "text-red-600 border border-red-200" : "text-slate-900 border border-slate-300"
                        }`}
                      >
                        <span className="text-[11px] leading-none">{getRankLabel(c.rank)}</span>
                        <span className="text-sm leading-none mt-1">{getSuitSymbol(c.suit)}</span>
                      </div>
                    ))
                  )}
                </div>

                {/* 牌型与倍数结果 */}
                {p.handName && (
                  <div className="mt-3 flex items-center justify-between bg-emerald-950/60 border border-emerald-700/50 px-2.5 py-1.5 rounded text-xs">
                    <span className="text-emerald-300 font-semibold">{p.handName}</span>
                    <span className="text-amber-400 font-mono font-bold">{p.multiplier}x 倍数</span>
                  </div>
                )}

                {/* 结算输赢结果 */}
                {netResult && (
                  <div
                    className={`mt-2 px-2.5 py-1.5 rounded text-xs font-bold flex items-center justify-between ${
                      netResult.net_amount > 0
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                        : netResult.net_amount < 0
                        ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                        : "bg-slate-700 text-slate-300"
                    }`}
                  >
                    <span>净输赢 (Net):</span>
                    <span className="font-mono">
                      {netResult.net_amount > 0 ? `+${netResult.net_amount}` : netResult.net_amount}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 结算契约与执行面板 */}
      {settleRequest && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center space-x-2">
              <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
                <Send className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-800">
                  统一钱包结算契约 (GameSettleRequest Payload)
                </h3>
                <p className="text-xs text-slate-500">
                  游戏引擎计算出的 player_results 净输赢将直接传入 wallet-service
                </p>
              </div>
            </div>

            {phase === "SHOWDOWN" && (
              <button
                onClick={handleExecuteSettle}
                className="flex items-center space-x-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-md transition-colors"
              >
                <Zap className="w-4 h-4" />
                <span>调用钱包原子结算 (Submit Settle)</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* JSON 请求契约预览 */}
            <div className="bg-slate-900 rounded-lg p-3 text-emerald-400 font-mono text-[11px] overflow-x-auto">
              <pre>{JSON.stringify(settleRequest, null, 2)}</pre>
            </div>

            {/* 结算回执与能量守恒指标 */}
            <div className="space-y-3">
              {settleResult ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-800 flex items-center space-x-1">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      <span>钱包微服务结算成功 (POST /api/wallet/game_settle)</span>
                    </span>
                    <span className="text-[10px] bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded font-mono font-bold">
                      200 OK
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-white p-2 rounded border border-emerald-100">
                      <span className="text-slate-500">总流水彩池:</span>
                      <p className="font-bold font-mono text-slate-800">
                        {settleResult.totalPot.toLocaleString()} 筹码
                      </p>
                    </div>
                    <div className="bg-white p-2 rounded border border-emerald-100">
                      <span className="text-slate-500">平台总抽水 (5%):</span>
                      <p className="font-bold font-mono text-emerald-700">
                        {settleResult.totalRake.toLocaleString()} 筹码
                      </p>
                    </div>
                    <div className="bg-white p-2 rounded border border-emerald-100">
                      <span className="text-slate-500">代理佣金池 (3%):</span>
                      <p className="font-bold font-mono text-indigo-700">
                        {settleResult.agentPool.toLocaleString()} 筹码
                      </p>
                    </div>
                    <div className="bg-white p-2 rounded border border-emerald-100">
                      <span className="text-slate-500">平台留存净收益:</span>
                      <p className="font-bold font-mono text-slate-800">
                        {settleResult.platformRevenue.toLocaleString()} 筹码
                      </p>
                    </div>
                  </div>

                  {/* 代理分成链 */}
                  <div className="bg-white p-2.5 rounded border border-emerald-100 text-xs space-y-1">
                    <span className="font-semibold text-slate-700">三级代理返佣到账详情:</span>
                    {settleResult.agentShares.map((agt: any) => (
                      <div key={agt.agent_id} className="flex justify-between text-slate-600 text-[11px]">
                        <span>
                          {agt.agent_id} (Level {agt.level}, 比率 {(agt.r_ratio * 100).toFixed(0)}%):
                        </span>
                        <span className="font-mono font-bold text-indigo-600">
                          +{agt.commission_amount} 筹码
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* 守恒对账 */}
                  <div className="bg-emerald-100/70 p-2.5 rounded flex items-center justify-between text-xs text-emerald-900 font-bold">
                    <span>系统能量守恒状态 (Audit):</span>
                    <span className="font-mono text-emerald-700">
                      {settleResult.audit.is_conserved ? "✓ 严格守恒 (Diff: 0)" : "✕ 守恒异常"}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-slate-200 rounded-lg text-slate-400 text-xs">
                  <Coins className="w-8 h-8 text-slate-300 mb-2" />
                  <span>点击右上角「调用钱包原子结算」</span>
                  <span className="text-[11px] text-slate-400 mt-1">
                    系统将验证扣水、三级代理佣金分润与全局能量守恒
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
