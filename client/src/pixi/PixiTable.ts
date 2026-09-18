/**
 * PixiJS 牌桌渲染器
 * 素材驱动渲染：所有视觉元素都用 PNG/SVG 素材，代码只负责编排
 */

import { Application, Assets, Container, Sprite, Texture, BitmapText } from 'pixi.js';
import type { GameState, PlayerSeat, Card } from '../shared/types';

// 素材配置
interface AssetConfig {
  name: string;
  path: string;
  width?: number;
  height?: number;
}

// 素材清单（支持热替换，只需替换文件，不需要改代码）
const ASSETS: Record<string, AssetConfig> = {
  // 牌桌
  table_bg: { name: 'table_bg', path: '/assets/tables/table_bg.png', width: 1920, height: 1080 },
  table_felt: { name: 'table_felt', path: '/assets/tables/table_felt.png', width: 1600, height: 800 },
  
  // 卡牌
  card_back: { name: 'card_back', path: '/assets/cards/card_back.png', width: 200, height: 280 },
  
  // 筹码
  chip_red: { name: 'chip_red', path: '/assets/chips/chip_red.png', width: 128, height: 128 },
  chip_blue: { name: 'chip_blue', path: '/assets/chips/chip_blue.png', width: 128, height: 128 },
  chip_green: { name: 'chip_green', path: '/assets/chips/chip_green.png', width: 128, height: 128 },
  chip_stack: { name: 'chip_stack', path: '/assets/chips/chip_stack.png', width: 128, height: 128 },
  
  // 头像框
  frame_gold: { name: 'frame_gold', path: '/assets/avatars/frame_gold.png', width: 120, height: 120 },
  frame_silver: { name: 'frame_silver', path: '/assets/avatars/frame_silver.png', width: 120, height: 120 },
  frame_bronze: { name: 'frame_bronze', path: '/assets/avatars/frame_bronze.png', width: 120, height: 120 },
  
  // UI
  dialog_bg: { name: 'dialog_bg', path: '/assets/ui/dialog_bg.png', width: 800, height: 600 },
  panel_bg: { name: 'panel_bg', path: '/assets/ui/panel_bg.png', width: 400, height: 600 },
  logo: { name: 'logo', path: '/assets/ui/logo.png', width: 200, height: 60 },
};

// 座位位置配置（6 人桌）
const SEAT_POSITIONS = [
  { x: 960, y: 900 },   // 0: 底部中央
  { x: 400, y: 750 },   // 1: 左下
  { x: 400, y: 350 },   // 2: 左上
  { x: 960, y: 180 },   // 3: 顶部中央
  { x: 1520, y: 350 },  // 4: 右上
  { x: 1520, y: 750 },  // 5: 右下
];

export class PixiTable {
  private app: Application;
  private tableContainer: Container;
  private seatsContainer: Container;
  private cardsContainer: Container;
  private chipsContainer: Container;
  private potText: BitmapText | null = null;
  
  private textures: Map<string, Texture> = new Map();
  private seatSprites: Map<number, Container> = new Map();
  onActionCallback: ((action: string, amount?: number) => void) | null = null;

  constructor() {
    this.app = new Application();
    this.tableContainer = new Container();
    this.seatsContainer = new Container();
    this.cardsContainer = new Container();
    this.chipsContainer = new Container();
  }

  /**
   * 初始化 PixiJS 应用
   */
  async init(canvas: HTMLCanvasElement): Promise<void> {
    await this.app.init({
      canvas,
      width: 1920,
      height: 1080,
      backgroundColor: 0x1a1a2e,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    // 加载所有素材
    await this.loadAssets();

    // 渲染牌桌背景
    this.renderTable();

    // 添加容器到舞台
    this.app.stage.addChild(this.tableContainer);
    this.app.stage.addChild(this.seatsContainer);
    this.app.stage.addChild(this.cardsContainer);
    this.app.stage.addChild(this.chipsContainer);

    // 渲染底池文字
    this.renderPotText();
  }

  /**
   * 预加载所有素材
   */
  private async loadAssets(): Promise<void> {
    const assetEntries = Object.values(ASSETS);
    
    for (const asset of assetEntries) {
      try {
        const texture = await Assets.load(asset.path);
        this.textures.set(asset.name, texture);
        console.log(`[PixiTable] Loaded: ${asset.name}`);
      } catch (error) {
        console.warn(`[PixiTable] Failed to load: ${asset.name}, using placeholder`);
        // 使用占位纹理（纯色）
        const placeholder = this.createPlaceholderTexture(asset.width || 100, asset.height || 100, 0x666666);
        this.textures.set(asset.name, placeholder);
      }
    }
  }

  /**
   * 创建占位纹理（当素材不存在时使用）
   */
  private createPlaceholderTexture(width: number, height: number, color: number): Texture {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    ctx.fillRect(0, 0, width, height);
    return Texture.from(canvas);
  }

  /**
   * 渲染牌桌背景
   */
  private renderTable(): void {
    // 牌桌背景
    const tableBg = new Sprite(this.textures.get('table_bg'));
    tableBg.x = 960;
    tableBg.y = 540;
    tableBg.anchor.set(0.5);
    this.tableContainer.addChild(tableBg);

    // 桌面绒布
    const felt = new Sprite(this.textures.get('table_felt'));
    felt.x = 960;
    felt.y = 540;
    felt.anchor.set(0.5);
    this.tableContainer.addChild(felt);
  }

  /**
   * 渲染座位
   */
  renderSeats(seats: PlayerSeat[]): void {
    // 清除旧座位
    this.seatsContainer.removeChildren();
    this.seatSprites.clear();

    seats.forEach((seat, index) => {
      const position = SEAT_POSITIONS[index];
      if (!position) return;

      const seatContainer = new Container();
      seatContainer.x = position.x;
      seatContainer.y = position.y;

      // 头像框
      const frameTexture = this.textures.get(
        seat.isWinner ? 'frame_gold' : 'frame_silver'
      );
      const frame = new Sprite(frameTexture);
      frame.anchor.set(0.5);
      seatContainer.addChild(frame);

      // 昵称
      const nameText = new BitmapText(seat.userId || `Player ${index + 1}`, {
        fontFamily: 'Arial',
        fontSize: 24,
        fill: 0xffffff,
      });
      nameText.anchor.set(0.5);
      nameText.y = 70;
      seatContainer.addChild(nameText);

      // 筹码数
      const chipsText = new BitmapText(`${seat.chips}`, {
        fontFamily: 'Arial',
        fontSize: 20,
        fill: 0xffd700,
      });
      chipsText.anchor.set(0.5);
      chipsText.y = -70;
      seatContainer.addChild(chipsText);

      // 当前下注
      if (seat.currentBet > 0) {
        const betText = new BitmapText(`Bet: ${seat.currentBet}`, {
          fontFamily: 'Arial',
          fontSize: 18,
          fill: 0x00ff00,
        });
        betText.anchor.set(0.5);
        betText.y = 90;
        seatContainer.addChild(betText);
      }

      // 赢家高亮动画
      if (seat.isWinner) {
        frame.scale.set(1.2);
        frame.tint = 0xffd700;
      }

      this.seatsContainer.addChild(seatContainer);
      this.seatSprites.set(index, seatContainer);
    });
  }

  /**
   * 渲染公共牌
   */
  renderCommunityCards(cards: Card[]): void {
    this.cardsContainer.removeChildren();

    const startX = 960 - (cards.length * 110) / 2;
    const y = 540;

    cards.forEach((_card, index) => {
      const cardSprite = new Sprite(this.textures.get('card_back'));
      cardSprite.x = startX + index * 110;
      cardSprite.y = y;
      cardSprite.anchor.set(0.5);
      cardSprite.scale.set(0.5);
      this.cardsContainer.addChild(cardSprite);
    });
  }

  /**
   * 渲染玩家手牌
   */
  renderPlayerCards(seatIndex: number, cards: Card[]): void {
    const seatContainer = this.seatSprites.get(seatIndex);
    if (!seatContainer) return;

    // 清除旧手牌
    const oldCards = seatContainer.children.filter(child => child.name === 'player_card');
    oldCards.forEach(card => seatContainer.removeChild(card));

    cards.forEach((_card, index) => {
      const cardSprite = new Sprite(this.textures.get('card_back'));
      cardSprite.name = 'player_card';
      cardSprite.x = -30 + index * 60;
      cardSprite.y = -100;
      cardSprite.anchor.set(0.5);
      cardSprite.scale.set(0.3);
      seatContainer.addChild(cardSprite);
    });
  }

  /**
   * 渲染底池文字
   */
  private renderPotText(): void {
    this.potText = new BitmapText('Pot: 0', {
      fontFamily: 'Arial',
      fontSize: 32,
      fill: 0xffffff,
    });
    this.potText.x = 960;
    this.potText.y = 450;
    this.potText.anchor.set(0.5);
    this.tableContainer.addChild(this.potText);
  }

  /**
   * 更新底池金额
   */
  updatePot(amount: number): void {
    if (this.potText) {
      this.potText.text = `Pot: ${amount}`;
    }
  }

  /**
   * 发牌动画
   */
  async animateDealCard(seatIndex: number, _card: Card): Promise<void> {
    const seatContainer = this.seatSprites.get(seatIndex);
    if (!seatContainer) return;

    const cardSprite = new Sprite(this.textures.get('card_back'));
    cardSprite.anchor.set(0.5);
    cardSprite.scale.set(0.3);
    
    // 从牌堆位置开始
    cardSprite.x = 960;
    cardSprite.y = 540;
    cardSprite.rotation = 0;

    this.cardsContainer.addChild(cardSprite);

    // 动画飞到座位
    const targetX = seatContainer.x - 30;
    const targetY = seatContainer.y - 100;

    await this.animateSprite(cardSprite, {
      x: targetX,
      y: targetY,
      rotation: Math.PI * 2,
      duration: 500,
    });
  }

  /**
   * 筹码飞入动画
   */
  async animateChipFly(fromSeatIndex: number, toX: number, toY: number, _amount: number): Promise<void> {
    const seatContainer = this.seatSprites.get(fromSeatIndex);
    if (!seatContainer) return;

    const chipSprite = new Sprite(this.textures.get('chip_red'));
    chipSprite.anchor.set(0.5);
    chipSprite.scale.set(0.5);
    chipSprite.x = seatContainer.x;
    chipSprite.y = seatContainer.y;

    this.chipsContainer.addChild(chipSprite);

    // 弧线动画
    await this.animateSprite(chipSprite, {
      x: toX,
      y: toY,
      duration: 400,
    });

    // 飞完后移除
    setTimeout(() => {
      this.chipsContainer.removeChild(chipSprite);
    }, 100);
  }

  /**
   * 通用动画工具
   */
  private animateSprite(
    sprite: Sprite,
    target: { x?: number; y?: number; rotation?: number; duration: number }
  ): Promise<void> {
    return new Promise((resolve) => {
      const startX = sprite.x;
      const startY = sprite.y;
      const startRotation = sprite.rotation;
      const startTime = performance.now();

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / target.duration, 1);
        const ease = 1 - Math.pow(1 - progress, 3); // easeOutCubic

        if (target.x !== undefined) {
          sprite.x = startX + (target.x - startX) * ease;
        }
        if (target.y !== undefined) {
          sprite.y = startY + (target.y - startY) * ease;
        }
        if (target.rotation !== undefined) {
          sprite.rotation = startRotation + (target.rotation - startRotation) * ease;
        }

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          resolve();
        }
      };

      requestAnimationFrame(animate);
    });
  }

  /**
   * 更新游戏状态
   */
  updateGameState(state: GameState): void {
    this.renderSeats(state.seats);
    this.renderCommunityCards(state.communityCards);
    this.updatePot(state.pot);
  }

  /**
   * 赢家高亮动画
   */
  async animateWinnerHighlight(seatIndex: number): Promise<void> {
    const seatContainer = this.seatSprites.get(seatIndex);
    if (!seatContainer) return;

    // 找到头像框
    const frame = seatContainer.children[0] as Sprite;
    if (!frame) return;

    // 金色光环 + 放大动画
    const originalScale = frame.scale.x;
    const originalTint = frame.tint;

    frame.tint = 0xffd700;

    for (let i = 0; i < 3; i++) {
      await this.animateSprite(frame as any, {
        x: frame.x,
        y: frame.y,
        duration: 200,
      });
      frame.scale.set(originalScale * 1.3);
      await new Promise(resolve => setTimeout(resolve, 200));
      frame.scale.set(originalScale);
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // 恢复
    frame.tint = originalTint;
  }

  /**
   * 倒计时环形进度条
   */
  renderActionTimer(deadline: number): void {
    const now = Date.now();
    const remaining = Math.max(0, deadline - now);

    // 如果有倒计时组件，更新它
    console.log(`[Timer] Remaining: ${Math.ceil(remaining / 1000)}s`);
  }

  /**
   * 牌面翻转动画
   */
  async animateCardFlip(cardSprite: Sprite): Promise<void> {
    // 水平翻转效果
    for (let i = 0; i < 10; i++) {
      cardSprite.scale.x = Math.cos(i * Math.PI / 10) * 0.3;
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    cardSprite.scale.x = 0.3;
  }

  /**
   * 设置动作回调
   */
  setOnActionCallback(callback: (action: string, amount?: number) => void): void {
    this.onActionCallback = callback;
  }

  /**
   * 销毁
   */
  destroy(): void {
    this.app.destroy(true, { children: true });
  }
}
