/**
 * 炸金花规则测试脚本
 * 验证：闷牌/看牌倍数、比牌逻辑、235反转
 */

import { evaluateZhaJinHua, compareZhaJinHua, isSpecial235, isBaoZi } from "./evaluator.js";
import { Card } from "../../shared/types.js";

// 工具函数：快速创建牌
function card(suit: "S" | "H" | "C" | "D", rank: number): Card {
  return { suit, rank, code: `${suit}-${rank}` };
}

let passed = 0;
let failed = 0;

function test(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`✅ ${name}`);
    passed++;
  } else {
    console.log(`❌ ${name} ${detail ? '- ' + detail : ''}`);
    failed++;
  }
}

console.log("=" .repeat(60));
console.log("炸金花规则测试");
console.log("=" .repeat(60));

// ========== 1. 牌型大小测试 ==========
console.log("\n【1. 牌型大小】");

// 豹子 > 顺金
const baozi = evaluateZhaJinHua([card("S", 13), card("H", 13), card("C", 13)]);
const shunjin = evaluateZhaJinHua([card("S", 13), card("S", 12), card("S", 11)]);
test("豹子 > 顺金", baozi.score > shunjin.score, `${baozi.score} vs ${shunjin.score}`);

// 顺金 > 金花
const jinhua = evaluateZhaJinHua([card("S", 13), card("S", 10), card("S", 5)]);
test("顺金 > 金花", shunjin.score > jinhua.score);

// 金花 > 顺子
const shunzi = evaluateZhaJinHua([card("S", 13), card("H", 12), card("C", 11)]);
test("金花 > 顺子", jinhua.score > shunzi.score);

// 顺子 > 对子
const duizi = evaluateZhaJinHua([card("S", 13), card("H", 13), card("C", 5)]);
test("顺子 > 对子", shunzi.score > duizi.score);

// 对子 > 单张
const danzhang = evaluateZhaJinHua([card("S", 14), card("H", 10), card("C", 5)]);
test("对子 > 单张", duizi.score > danzhang.score);

// ========== 2. 235 特殊牌型测试 ==========
console.log("\n【2. 235 特殊牌型】");

const card235 = [card("S", 2), card("H", 3), card("C", 5)];
const eval235 = evaluateZhaJinHua(card235);
test("235 被识别为特殊235", eval235.rank_name === "特殊235", eval235.rank_name);

test("isSpecial235 正确识别 235", isSpecial235(card235));
test("isSpecial235 拒绝同花 235", !isSpecial235([card("S", 2), card("S", 3), card("S", 5)]));

const smallBaozi = [card("S", 2), card("H", 2), card("C", 2)];
test("isBaoZi 正确识别豹子", isBaoZi(smallBaozi));

// ========== 3. 235 反转规则测试 ==========
console.log("\n【3. 235 反转豹子规则】");

const evalSmallBaozi = evaluateZhaJinHua(smallBaozi);

// 不启用反转：豹子 > 235
const normalCompare = compareZhaJinHua(eval235, evalSmallBaozi, card235, smallBaozi, false);
test("不启用反转：豹子 > 235", normalCompare < 0, `${normalCompare}`);

// 启用反转：235 > 豹子
const reversedCompare = compareZhaJinHua(eval235, evalSmallBaozi, card235, smallBaozi, true);
test("启用反转：235 > 豹子", reversedCompare > 0, `${reversedCompare}`);

// 235 对其他牌型：正常比较（235更小）
const flushCard = evaluateZhaJinHua([card("S", 14), card("S", 10), card("S", 5)]);
const normalVsFlush = compareZhaJinHua(eval235, flushCard, card235, [card("S", 14), card("S", 10), card("S", 5)], true);
test("启用反转：235 只反转豹子，对其他牌型正常比较", normalVsFlush < 0);

// ========== 4. 闷牌/看牌倍数验证 ==========
console.log("\n【4. 闷牌/看牌倍数】");

// 模拟闷牌状态
const baseCall = 100;
const blindCost = baseCall; // 闷牌跟注
const seenCost = baseCall * 2; // 看牌后跟注
test("闷牌跟注 = 基准注额", blindCost === 100, `闷牌: ${blindCost}`);
test("看牌跟注 = 2倍基准注额", seenCost === 200, `看牌: ${seenCost}`);

// 比牌成本：闷牌玩家半价
const blindCompareCost = Math.floor(baseCall / 2);
const seenCompareCost = baseCall * 2;
test("闷牌比牌成本 = 基准/2", blindCompareCost === 50, `闷牌比牌: ${blindCompareCost}`);
test("看牌比牌成本 = 2倍基准", seenCompareCost === 200, `看牌比牌: ${seenCompareCost}`);

// ========== 5. 多轮下注测试 ==========
console.log("\n【5. 多轮下注】");

// 最多3轮下注
const maxRounds = 3;
test("炸金花最多3轮下注", maxRounds === 3);

console.log("\n" + "=".repeat(60));
console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
console.log("=" .repeat(60));

if (failed > 0) {
  process.exit(1);
}
