# V-POKER 游戏规格说明书

## 模式分类（6种）

| 模式 | 说明 | 超时 | 结算方式 |
|---|---|---|---|
| `fixed_limit` | 限注扑克：盲注+多轮下注 | 30s | 底池型，赢家通吃扣抽水 |
| `banker` | 抢庄：一人当庄，闲家比庄 | 20s | 交换型，庄闲直接转账×手牌倍数 |
| `free_compare` | 通比：无人当庄，互相比 | 15s | 交换型，牌力最高者收注 |
| `compare` | 比牌：下注后摊牌比大小 | 25s | 底池型，赢家通吃 |
| `split_hand` | 分道：13张分3道逐道比 | 15s | 交换型，逐道计分零和 |
| `trick_taking` | 出牌：叫分后轮流出牌 | 30s | 交换型，地主/农民对赌×炸弹倍数 |

## 游戏清单

### 1. 德州扑克 (texas_holdem)
- **模式**: fixed_limit | **牌数**: 2底牌+5公共
- **流程**: WAITING→DEALING→PRE_FLOP(下注)→FLOP(发3公共)→TURN→RIVER→SHOWDOWN→SETTLING
- **规则**: SB/BB盲注，4轮下注，边池支持all-in
- **结算**: 底池型，赢家拿池扣5%抽水

### 2. 奥马哈 (omaha)
- **模式**: fixed_limit | **牌数**: 4底牌+5公共
- **规则**: 必须选2张底牌+3张公共牌组合(C(4,2)×C(5,3)=60种)

### 3. 短牌德州 (short_deck)
- **模式**: fixed_limit | **牌数**: 36张(去2-5)
- **牌型差异**: 同花>葫芦，三条>顺子，A-6-7-8-9最小顺

### 4. 鱿鱼模式 (squid_game)
- **模式**: fixed_limit | **牌数**: 2底牌+公共
- **规则**: 德州变体+玻璃桥/死亡牌机制

### 5. 牛牛 (niu_niu)
- **模式**: banker / free_compare | **牌数**: 5张
- **倍数表**:

| 牌型 | 倍数 |
|---|---|
| 五小牛(5张≤4且总点≤10) | 8倍 |
| 五花牛(5张JQK) | 5倍 |
| 炸弹牛(4同点) | 4倍 |
| 四花牛(4张JQK+1张10) | 4倍 |
| 牛牛 | 3倍 |
| 牛8/牛9 | 2倍 |
| 牛1~牛7/无牛 | 1倍 |

- **流程**: 发牌→抢庄(QIANG_ZHUANG)→下注(BETTING)→比牌→结算
- **结算**: 交换型，庄闲比牌，赢注×手牌倍数

### 6. 三公 (san_gong)
- **模式**: banker / free_compare | **牌数**: 3张
- **倍数表**:

| 牌型 | 倍数 |
|---|---|
| 大三公(KKK/QQQ/JJJ) | 9倍 |
| 小三公(其他3同点) | 7倍 |
| 混三公(3张JQK不全同) | 5倍 |
| 点数比大小 | 1倍 |

### 7. 炸金花 (zha_jin_hua)
- **模式**: compare | **牌数**: 3张
- **牌型**: 豹子>顺金>金花>顺子>对子>单张(235杀豹子)
- **结算**: 底池型，下注后摊牌，赢家通吃

### 8. 炸弹 (fight_bomb)
- **模式**: compare | **牌数**: 3张
- **规则**: 复用炸金花评估器

### 9. 十三水 (thirteen_water)
- **模式**: split_hand | **牌数**: 13张分3道(头3/中5/尾5)
- **规则**: 头≤中≤尾，逐道比牌，赢1道得1单位
- **结算**: 交换型，零和：每赢1道+1单位，每输1道-1单位

### 10. 菠萝OFC (pineapple)
- **模式**: split_hand | **牌数**: 13张分3道
- **规则**: 同十三水，头≤中≤尾，逐道比
- **结算**: 交换型，零和逐道计分

### 11. 斗地主 (doudizhu)
- **模式**: trick_taking | **牌数**: 54张(含大小王)
- **流程**: 发牌(各17)→叫分(QIANG_ZHUANG)→地主拿3底牌(20张)→出牌→结算
- **牌型**: 火箭(双王)>炸弹(4同点)>单张>对子>三张>三带一>三带二>顺子>连对>飞机
- **牌点**: 大王>小王>2>A>K>...>3
- **结算**: 交换型，地主vs农民，炸弹/火箭翻倍

### 12. 掼蛋 (guandan)
- **模式**: trick_taking | **牌数**: 27张(两副牌)
- **规则**: 牌力评估(天王炸>炸弹>同花顺>大牌)

### 13. 双扣 (double_kong)
- **模式**: trick_taking | **牌数**: 27张(两副牌)
- **规则**: 牌力评估(炸弹>顺子>连对)

### 14. 红五 (hong_wu)
- **模式**: trick_taking | **牌数**: 27张(两副牌)
- **规则**: 红桃5/方块5最大，牌力评估

## 状态机流转

```
WAITING → DEALING → [模式特定阶段] → SHOWDOWN → SETTLING → FINISHED
```

- **fixed_limit**: DEALING→BETTING(PRE_FLOP)→发FLOP→BETTING→发TURN→BETTING→发RIVER→BETTING→SHOWDOWN
- **banker**: DEALING→QIANG_ZHUANG(抢庄)→BETTING(闲家下注)→SHOWDOWN
- **free_compare**: DEALING→BETTING→SHOWDOWN
- **compare**: DEALING→BETTING→SHOWDOWN
- **split_hand**: DEALING→SHOWDOWN(无下注)
- **trick_taking**: DEALING→QIANG_ZHUANG(叫分)→BETTING→SHOWDOWN

## 结算原则

1. **零和**: sum(net_amount) = 0，抽水由wallet_service统一扣
2. **底池型**(fixed_limit/compare): 赢家拿total_pot，wallet_service扣平台费
3. **交换型**(banker/free_compare/split_hand/trick_taking): 先退款所有下注，再按net_amount在玩家间直接转账
4. **倍数**: banker模式下赢注×手牌倍数(牛牛1-8倍，三公1-9倍)
5. **超时**: 按模式15-30s，超时自动check/fold
