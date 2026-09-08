// ムーンクレスタ風 往年チップチューン音源（Web Audio API）
export class Sound {
  private ctx: AudioContext | null = null;
  public isMuted = false;
  private bgmIntervalId: number | null = null;
  private currentBgmPhase: 'tetris' | 'shooting' | 'none' = 'none';

  private initContext(): void {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      this.stopBGM();
    }
    return this.isMuted;
  }

  // 1. ムーンクレスタ風 開始ファンファーレ（超高速上昇アルペジオ: ピロリロリロリロ〜〜ン♪）
  public playStartJingle(): void {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    // C大調/ペンタトニックの超高速駆け上がり
    const notes = [
      261.63, 329.63, 392.00, 523.25,
      659.25, 783.99, 1046.50, 1318.51,
      1567.98, 2093.00
    ];

    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      const startTime = now + idx * 0.045;
      const isLast = idx === notes.length - 1;
      const dur = isLast ? 0.45 : 0.04;

      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, startTime);

      if (isLast) {
        // 頂点で少しヴィブラート
        osc.frequency.setValueAtTime(freq, startTime);
        osc.frequency.linearRampToValueAtTime(freq * 1.02, startTime + 0.15);
        osc.frequency.linearRampToValueAtTime(freq, startTime + 0.3);
      }

      gain.gain.setValueAtTime(0.18, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + dur);

      osc.connect(gain);
      gain.connect(this.ctx!.destination);

      osc.start(startTime);
      osc.stop(startTime + dur + 0.02);
    });
  }

  // 2. ゲームオーバー（ユーザー要望により無音に）
  public playGameOver(): void {
    this.stopBGM();
  }

  // 3. ムーンクレスタ風 ショット音（ピシューン！と響く矩形波レーザー）
  public playShoot(): void {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    // 鋭い周波数急降下ピッチベンド
    osc.frequency.setValueAtTime(1400, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.1);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.005, now + 0.1);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.11);
  }

  // 4. ムーンクレスタ合体成功チャープ音（ピロピロピロピロ！）
  public playDock(): void {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const freqs = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98];
    freqs.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      const st = now + idx * 0.035;

      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, st);

      gain.gain.setValueAtTime(0.18, st);
      gain.gain.exponentialRampToValueAtTime(0.005, st + 0.07);

      osc.connect(gain);
      gain.connect(this.ctx!.destination);

      osc.start(st);
      osc.stop(st + 0.08);
    });
  }

  // 5. 往年のアーケード爆発音（ナムコ・タイトー風：鋭いFMピッチベンド＋クラッシュノイズの痛快な炸裂音）
  public playExplosion(big = false): void {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const dur = big ? 0.48 : 0.26;

    // --- レイヤー1: 80年代アーケード特有の「ドギュゥゥン！」FM下降ピッチ音 ---
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = big ? 'sawtooth' : 'square';

    const startFreq = big ? 280 : 420;
    const endFreq = big ? 40 : 60;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + dur * 0.7);

    oscGain.gain.setValueAtTime(big ? 0.32 : 0.22, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + dur * 0.75);

    osc.connect(oscGain);
    oscGain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + dur * 0.8);

    // --- レイヤー2: 粒立ちの荒いパンチの効いた爆発クラッシュノイズ ---
    const bufferSize = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      // 80年代レトロノイズジェネレータ風（粗い量子化ビットクラッシュ調）
      const raw = Math.random() * 2 - 1;
      const stepped = Math.round(raw * 4) / 4;
      data[i] = stepped * Math.exp(-i / (bufferSize * (big ? 0.35 : 0.25)));
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    // バンドパス＋ローパスでナムコ・ムーンクレスタ風の「バギュッ」という歯切れの良さを実現
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(big ? 900 : 1400, now);
    filter.frequency.exponentialRampToValueAtTime(60, now + dur);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(big ? 0.38 : 0.28, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);

    noise.start(now);
  }

  // ザコ敵撃破時の小気味良いポップ音（ギャラガ/ゼビウス風）
  public playEnemyPop(): void {
    this.playExplosion(false);
  }

  // ★ ボス専用：轟音連続爆発サウンド！
  public playBossExplosion(): void {
    this.playExplosion(true);
    [0.08, 0.18, 0.30, 0.44].forEach(delay => {
      window.setTimeout(() => {
        this.playExplosion(true);
      }, delay * 1000);
    });
  }

  // 6. 被弾音
  public playHit(): void {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(350, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.09);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.09);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.09);
  }

  // 6.5. ギャラガ名物・急降下ダイブ警報（ピュロロロロ〜ン！と降下する電子音）
  public playDiveSiren(): void {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.28);

    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.005, now + 0.28);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.29);
  }

  // 6.6. ムーンクレスタ名物・メテオ・急襲アラート（ピヨピヨピヨピヨ！と高速変調する電子警告音）
  public playMeteorSiren(): void {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const st = now + i * 0.06;
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(1200, st);
      osc.frequency.exponentialRampToValueAtTime(300, st + 0.05);

      gain.gain.setValueAtTime(0.08, st);
      gain.gain.exponentialRampToValueAtTime(0.005, st + 0.05);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(st);
      osc.stop(st + 0.055);
    }
  }

  // 7. フェーズアラート
  public playPhaseAlert(phase: 'tetris' | 'shooting'): void {
    if (phase === 'tetris') {
      this.playStartJingle();
    } else {
      if (this.isMuted) return;
      this.initContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      [440, 880, 1320].forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        const st = now + idx * 0.06;
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, st);
        gain.gain.setValueAtTime(0.16, st);
        gain.gain.exponentialRampToValueAtTime(0.01, st + 0.08);
        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        osc.start(st);
        osc.stop(st + 0.09);
      });
    }
  }

  // 8. 勝利ファンファーレ
  public playVictory(): void {
    if (this.isMuted) return;
    this.stopBGM();
    this.initContext();
    if (!this.ctx) return;

    const notes = [523, 659, 784, 1046, 784, 1046, 1318];
    const now = this.ctx.currentTime;
    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      const st = now + idx * 0.11;
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, st);
      gain.gain.setValueAtTime(0.22, st);
      gain.gain.exponentialRampToValueAtTime(0.005, st + 0.22);
      osc.connect(gain);
      gain.connect(this.ctx!.destination);
      osc.start(st);
      osc.stop(st + 0.25);
    });
  }

  // BGM
  public startBGM(phase: 'tetris' | 'shooting'): void {
    if (this.currentBgmPhase === phase) return;
    this.stopBGM();
    this.currentBgmPhase = phase;
    if (this.isMuted) return;
    this.initContext();

    let step = 0;
    // 8-bitチップチューンフレーズ
    const tetrisNotes = [523, 659, 784, 659, 523, 784, 659, 523];
    const shootBass = [130, 130, 195, 130, 164, 130, 174, 195];
    const tempo = phase === 'tetris' ? 170 : 125;

    this.bgmIntervalId = window.setInterval(() => {
      if (this.isMuted || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'square';
      const freq = phase === 'tetris' ? tetrisNotes[step % tetrisNotes.length] : shootBass[step % shootBass.length];
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(phase === 'tetris' ? 0.025 : 0.038, now);
      gain.gain.exponentialRampToValueAtTime(0.002, now + 0.11);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.13);
      step++;
    }, tempo);
  }

  public stopBGM(): void {
    if (this.bgmIntervalId !== null) {
      clearInterval(this.bgmIntervalId);
      this.bgmIntervalId = null;
    }
    this.currentBgmPhase = 'none';
  }
}
