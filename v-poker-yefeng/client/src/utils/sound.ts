/**
 * V-POKER 音效系统
 * 使用 Web Audio API 生成音效，无需外部文件
 */

class SoundManager {
  private ctx: AudioContext | null = null;
  private enabled: boolean = true;

  constructor() {
    // 初始化音频上下文
    try {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (e) {
      console.log('Web Audio API not supported');
    }
  }

  /** 播放指定频率的音效 */
  private playTone(frequency: number, duration: number, type: OscillatorType = 'sine', volume: number = 0.3) {
    if (!this.enabled || !this.ctx) return;

    const oscillator = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.ctx.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = type;

    gainNode.gain.setValueAtTime(volume, this.ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

    oscillator.start(this.ctx.currentTime);
    oscillator.stop(this.ctx.currentTime + duration);
  }

  /** 发牌音效 */
  playDealCard() {
    this.playTone(800, 0.1, 'sine', 0.2);
    setTimeout(() => this.playTone(1000, 0.1, 'sine', 0.15), 50);
  }

  /** 下注音效 */
  playChipBet() {
    this.playTone(600, 0.15, 'triangle', 0.3);
  }

  /** 赢牌音效 */
  playWin() {
    this.playTone(523, 0.2, 'sine', 0.3); // C5
    setTimeout(() => this.playTone(659, 0.2, 'sine', 0.3), 150); // E5
    setTimeout(() => this.playTone(784, 0.4, 'sine', 0.3), 300); // G5
  }

  /** 输牌音效 */
  playLose() {
    this.playTone(400, 0.3, 'sawtooth', 0.2);
    setTimeout(() => this.playTone(300, 0.5, 'sawtooth', 0.2), 200);
  }

  /** 按钮点击音效 */
  playClick() {
    this.playTone(1200, 0.05, 'square', 0.1);
  }

  /** 翻转牌音效 */
  playFlipCard() {
    this.playTone(900, 0.08, 'sine', 0.25);
  }

  /** 结算音效 */
  playSettle() {
    this.playTone(523, 0.15, 'sine', 0.25);
    setTimeout(() => this.playTone(659, 0.15, 'sine', 0.25), 100);
    setTimeout(() => this.playTone(784, 0.15, 'sine', 0.25), 200);
    setTimeout(() => this.playTone(1047, 0.3, 'sine', 0.25), 300);
  }

  /** 开启/关闭音效 */
  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  /** 是否开启 */
  isEnabled() {
    return this.enabled;
  }
}

// 导出单例
export const soundManager = new SoundManager();
