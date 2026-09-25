# V-POKER UniApp-X 移动端

## 环境要求
- HBuilderX 5.25+（蒸汽模式/Vapor Mode）
- uni-app-x 运行时 5.0+

## 运行
1. HBuilderX → 文件 → 打开目录 → 选择本文件夹
2.  manifest.json 中已勾选 `uni-app-x.vapor = true`
3. 运行 → 运行到手机或模拟器 → 选择Android/iOS

## 配置
修改 `common/api.uts` 中的：
- `BFF_URL` = 后端BFF地址（生产改为https://api.yourdomain.com）
- `ENGINE_URL` = 游戏引擎HTTP地址
- `ws.uts` 中 `ENGINE_WS` = 游戏引擎WS地址

## 页面
- pages/login — 登录
- pages/lobby — 游戏大厅（8款游戏入口）
- pages/table — 通用牌桌（自动适配扑克类/出牌类）
- pages/wallet — 钱包余额+流水

## 技术要点
- 全部使用 `<script setup>` 组合式API
- `flatten="true"` 拍平组件提升性能
- rpx单位适配屏幕
- WebSocket自动重连
