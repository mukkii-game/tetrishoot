import { shoot_arc_b64, damage_arc_b64, score_arc_b64, boss_lfo1_b64, boss_lfo2_b64 } from '../audio/audioData';

// ムーンクレスタ風 往年チップチューン音源（Web Audio API）＋ OtoLogic効果音
export class Sound {
  private ctx: AudioContext | null = null;
  public isMuted = false;
  private bgmIntervalId: number | null = null;
  private currentBgmPhase: 'tetris' | 'shooting' | 'none' = 'none';

  // OtoLogic音声バッファ
  private shootBuffer: AudioBuffer | null = null;
  private damageBuffer: AudioBuffer | null = null;
  private scoreBuffer: AudioBuffer | null = null;
  private bossLfo1Buffer: AudioBuffer | null = null;
  private bossLfo2Buffer: AudioBuffer | null = null;

  // ボスLFO再生用ループノード
  private activeBossLfoSource: AudioBufferSourceNode | null = null;
  private activeBossLfoGain: GainNode | null = null;

  constructor() {
    // 遅延デコード（ユーザー操作時に初期化）
  }

  private initContext(): void {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.loadOtoLogicBuffers();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  private loadOtoLogicBuffers(): void {
    if (!this.ctx) return;
    const decode = (b64: string, callback: (buf: AudioBuffer) => void) => {
      try {
        const bin = atob(b64);
        const len = bin.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = bin.charCodeAt(i);
        }
        this.ctx!.decodeAudioData(bytes.buffer.slice(0), buf => {
          callback(buf);
        }, err => {
          console.warn('Audio decode failed:', err);
        });
      } catch (e) {
        console.warn('Base64 decode failed:', e);
      }
    };

    decode(shoot_arc_b64, buf => { this.shootBuffer = buf; });
    decode(damage_arc_b64, buf => { this.damageBuffer = buf; });
    decode(score_arc_b64, buf => { this.scoreBuffer = buf; });
    decode(boss_lfo1_b64, buf => { this.bossLfo1Buffer = buf; });
    decode(boss_lfo2_b64, buf => { this.bossLfo2Buffer = buf; });
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      this.stopBGM();
      this.stopBossLfo();
    }
    return this.isMuted;
  }

  // 1. ムーンクレスタ ゲーム開始ファンファーレ（実機準拠の高速上昇アルペジオ: ピロリロリロリロ〜〜ン♪）
  public playStartJingle(): void {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    // ムーンクレスタ実機準拠の超高速ペンタトニック上昇音階
    const notes = [
      261.63, 329.63, 392.00, 523.25,
      659.25, 783.99, 1046.50, 1318.51,
      1567.98, 2093.00
    ];

    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      const startTime = now + idx * 0.042;
      const isLast = idx === notes.length - 1;
      const dur = isLast ? 0.48 : 0.04;

      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, startTime);

      if (isLast) {
        // 頂点で澄んだ美しいピッチヴィブラート
        osc.frequency.setValueAtTime(freq, startTime);
        osc.frequency.linearRampToValueAtTime(freq * 1.025, startTime + 0.12);
        osc.frequency.linearRampToValueAtTime(freq * 0.985, startTime + 0.24);
        osc.frequency.linearRampToValueAtTime(freq, startTime + 0.36);
      }

      gain.gain.setValueAtTime(0.20, startTime);
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
    this.stopBossLfo();
  }

  // 3. ショット音
  // ユーザー要望：
  // 「Arcade-Shooter01-1(Shoot) 玉発射音
  //  これだけだと単調かも。テトリミノにより音が違う、今使ってるのと2種類あってもいい」
  public playShoot(pieceType?: string): void {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    // I, L, J, T, S, Z ミノにより発射音の音色・ピッチバリエーションを展開
    // I, T, S は OtoLogicのリアルアーケードショット音 (Arcade-Shooter01-1)
    // L, J, Z, O は レトロ矩形波レーザー音（ピッチを変えて音色に変化を付加）
    const useOtoLogicSample = pieceType === 'I' || pieceType === 'T' || pieceType === 'S';

    if (useOtoLogicSample && this.shootBuffer) {
      try {
        const src = this.ctx.createBufferSource();
        src.buffer = this.shootBuffer;
        // テトリミノに応じたピッチの微差（Iは高め、Tは標準、Sは鋭く）
        if (pieceType === 'I') src.playbackRate.value = 1.15;
        else if (pieceType === 'S') src.playbackRate.value = 1.05;
        else src.playbackRate.value = 0.95;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.65, this.ctx.currentTime);
        src.connect(gain);
        gain.connect(this.ctx.destination);
        src.start(0);
        return;
      } catch {
        // フォールバック
      }
    }

    // レトロチップチューン音（ピッチを変調）
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    let startFreq = 1400;
    let endFreq = 180;
    if (pieceType === 'L' || pieceType === 'J') {
      startFreq = 1750;
      endFreq = 240;
    } else if (pieceType === 'Z') {
      startFreq = 1100;
      endFreq = 140;
    }

    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.1);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.005, now + 0.1);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.11);
  }

  // 4. ムーンクレスタ ドッキング成功音（ピロリロリロリロピロピロ〜ン！）
  public playDock(): void {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    // ムーンクレスタ実機準拠のドッキング成功チャープ（急上昇→高音反復トリル）
    const freqs = [
      523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98, 2093.00,
      1567.98, 2093.00
    ];
    freqs.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      const st = now + idx * 0.038;
      const isLast = idx >= freqs.length - 2;
      const dur = isLast ? 0.20 : 0.055;

      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, st);

      gain.gain.setValueAtTime(0.20, st);
      gain.gain.exponentialRampToValueAtTime(0.005, st + dur);

      osc.connect(gain);
      gain.connect(this.ctx!.destination);

      osc.start(st);
      osc.stop(st + dur + 0.01);
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

    oscGain.gain.setValueAtTime(big ? 0.32 : 0.14, now);
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
    noiseGain.gain.setValueAtTime(big ? 0.38 : 0.18, now);
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

  // ★ ユーザー要望：Arcade-Shooter01-2(Damage) 敵・ボスダメージに使う
  public playEnemyDamage(isBoss = false): void {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    if (this.damageBuffer) {
      try {
        const src = this.ctx.createBufferSource();
        src.buffer = this.damageBuffer;
        // ボス時は少し低音ピッチ（0.90）で重厚感、通常敵はピッチ（1.02）で歯切れの良いヒット音
        src.playbackRate.value = isBoss ? (0.90 + Math.random() * 0.04) : (1.02 + Math.random() * 0.08);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(isBoss ? 0.90 : 0.78, this.ctx.currentTime);
        src.connect(gain);
        gain.connect(this.ctx.destination);
        src.start(0);

        if (isBoss) {
          // ボス時は重厚な衝撃サブベースを薄くブレンドして手応えを極大化
          this.playBossSubThump();
        }
        return;
      } catch {
        // fallback
      }
    }
    this.playHit();
  }

  // ボス被弾時の手応えを重厚にするサブウーファー的低域アタック音
  private playBossSubThump(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(130, now);
    osc.frequency.exponentialRampToValueAtTime(32, now + 0.09);
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.005, now + 0.09);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  // ★ ユーザー要望：Arcade-Shooter01-6(Score) アイテム採った時（5秒間無敵等）
  public playItemScore(): void {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    if (this.scoreBuffer) {
      try {
        const src = this.ctx.createBufferSource();
        src.buffer = this.scoreBuffer;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.78, this.ctx.currentTime);
        src.connect(gain);
        gain.connect(this.ctx.destination);
        src.start(0);
        return;
      } catch {
        // fallback
      }
    }

    // フォールバック：軽快なレトロ上昇チャイム
    const now = this.ctx.currentTime;
    const notes = [587.33, 880.00, 1174.66, 1760.00];
    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      const st = now + idx * 0.045;
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, st);
      gain.gain.setValueAtTime(0.18, st);
      gain.gain.exponentialRampToValueAtTime(0.005, st + 0.09);
      osc.connect(gain);
      gain.connect(this.ctx!.destination);
      osc.start(st);
      osc.stop(st + 0.1);
    });
  }

  // ★ ユーザー要望：レーザー 高速で突っ込んでくるメテオタイプの敵の突っ込んでくる時に出す
  public playMeteorLaser(): void {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const dur = 0.18;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(2600, now);
    osc.frequency.exponentialRampToValueAtTime(280, now + dur);

    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.002, now + dur);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + dur + 0.01);
  }

  // ★ ユーザー要望：
  // 「Arcade-Shooter01-4(LFO) ボス出現中の音1
  //   Arcade-Shooter01-5(LFO) ボス出現中の音2 ボスにより替える なんとなくカテゴリ分けして」
  public startBossLfo(category: 1 | 2): void {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;
    this.stopBossLfo();

    const buf = category === 1 ? this.bossLfo1Buffer : this.bossLfo2Buffer;
    if (!buf) return;

    try {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;

      const gain = this.ctx.createGain();
      // 適正音量バランス（BGMや効果音と美しく調和しつつ存在感あるLFO）
      gain.gain.setValueAtTime(category === 1 ? 0.48 : 0.44, this.ctx.currentTime);

      src.connect(gain);
      gain.connect(this.ctx.destination);
      src.start(0);

      this.activeBossLfoSource = src;
      this.activeBossLfoGain = gain;
    } catch (e) {
      console.warn('startBossLfo error:', e);
    }
  }

  public stopBossLfo(): void {
    if (this.activeBossLfoSource) {
      try {
        this.activeBossLfoSource.stop();
        this.activeBossLfoSource.disconnect();
      } catch {
        // ignore
      }
      this.activeBossLfoSource = null;
    }
    if (this.activeBossLfoGain) {
      try {
        this.activeBossLfoGain.disconnect();
      } catch {
        // ignore
      }
      this.activeBossLfoGain = null;
    }
  }

  // ★ ユーザー要望：R-TYPEのフォースをぶち当てているような「ジャシシッ！」「ガガッ」という重厚な破壊ヒット音
  public playBossHit(): void {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const dur = 0.12;

    // レイヤー1: 低域の重い矩形波ディストーション（ガシッ！）
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + dur);

    oscGain.gain.setValueAtTime(0.28, now);
    oscGain.gain.exponentialRampToValueAtTime(0.005, now + dur);

    osc.connect(oscGain);
    oscGain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.01);

    // レイヤー2: 粗いビットクラッシュ調バンドパスノイズ（ジャシシッ！）
    const bufferSize = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const raw = Math.random() * 2 - 1;
      // 粗い量子化でジャリジャリ感を強調
      const quantized = Math.round(raw * 3) / 3;
      // 高速な小刻みパルス変調（ジャ・シ・シ・シ）
      const flutter = (Math.sin(i * 0.18) > 0 ? 1.0 : 0.45);
      data[i] = quantized * flutter * Math.exp(-i / (bufferSize * 0.45));
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, now);
    filter.frequency.exponentialRampToValueAtTime(450, now + dur);
    filter.Q.setValueAtTime(2.2, now);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.38, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.005, now + dur);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);

    noise.start(now);
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
      osc.stop(st + 0.06);
    }
  }

  // 6.7. ムーンクレスタ名物・コールドアイ分裂音（ピキィィン！と鋭く弾ける高周波ポップ音）
  public playMoonSplit(): void {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(1750, now);
    osc.frequency.exponentialRampToValueAtTime(360, now + 0.12);

    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.005, now + 0.12);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.13);
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
    // ドッキング時はムーンクレスタ風の静寂と推進エンジンパルス、シューティング時は緊張感あるベースライン
    const tetrisNotes = [130.81, 164.81, 196.00, 164.81];
    const shootBass = [130, 130, 195, 130, 164, 130, 174, 195];
    const tempo = phase === 'tetris' ? 220 : 125;

    this.bgmIntervalId = window.setInterval(() => {
      if (this.isMuted || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = phase === 'tetris' ? 'triangle' : 'square';
      const freq = phase === 'tetris' ? tetrisNotes[step % tetrisNotes.length] : shootBass[step % shootBass.length];
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(phase === 'tetris' ? 0.018 : 0.038, now);
      gain.gain.exponentialRampToValueAtTime(0.002, now + 0.14);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.13);
      step++;
    }, tempo);
  }

  public pauseBGM(): void {
    if (this.bgmIntervalId !== null) {
      clearInterval(this.bgmIntervalId);
      this.bgmIntervalId = null;
    }
    this.stopBossLfo();
  }

  public resumeBGM(): void {
    if (this.currentBgmPhase !== 'none' && this.bgmIntervalId === null) {
      const p = this.currentBgmPhase;
      this.currentBgmPhase = 'none'; // reset to force re-start
      this.startBGM(p);
    }
  }

  public stopBGM(): void {
    if (this.bgmIntervalId !== null) {
      clearInterval(this.bgmIntervalId);
      this.bgmIntervalId = null;
    }
    this.currentBgmPhase = 'none';
    this.stopBossLfo();
  }
}
