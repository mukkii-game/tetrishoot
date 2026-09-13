import {
  shoot_arc_b64,
  damage_arc_b64,
  score_arc_b64,
  boss_lfo1_b64,
  boss_lfo2_b64,
  boss_warning_b64,
  player_death_b64,
  enemy_kill1_b64,
  enemy_kill2_b64,
  enemy_kill3_b64,
  enemy_kill4_b64,
  enemy_kill5_b64,
} from '../audio/audioData';

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
  private bossWarningBuffer: AudioBuffer | null = null;
  private playerDeathBuffer: AudioBuffer | null = null;

  // ユーザー提供：気持ちいいレトロ敵ヤラレ音・ダメージ音バッファ5種
  private enemyKillBuffers: (AudioBuffer | null)[] = [null, null, null, null, null];

  // ボスLFO再生用ループノード
  private activeBossLfoSource: AudioBufferSourceNode | null = null;
  private activeBossLfoGain: GainNode | null = null;

  // ボス予告サイレン再生ノード
  private activeBossWarningSource: AudioBufferSourceNode | null = null;
  private activeBossWarningGain: GainNode | null = null;

  // ショット音の過剰な重なり防止用（スロットリング＆ボイススティーリング）
  private lastShootTime = 0;
  private shootVoiceIndex = 0;
  private shootSources: (AudioBufferSourceNode | null)[] = [null, null, null, null];

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
    decode(boss_warning_b64, buf => { this.bossWarningBuffer = buf; });
    decode(player_death_b64, buf => { this.playerDeathBuffer = buf; });

    // ユーザー提供の敵ヤラレ・ダメージ音5種をデコード
    decode(enemy_kill1_b64, buf => { this.enemyKillBuffers[0] = buf; });
    decode(enemy_kill2_b64, buf => { this.enemyKillBuffers[1] = buf; });
    decode(enemy_kill3_b64, buf => { this.enemyKillBuffers[2] = buf; });
    decode(enemy_kill4_b64, buf => { this.enemyKillBuffers[3] = buf; });
    decode(enemy_kill5_b64, buf => { this.enemyKillBuffers[4] = buf; });
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      this.stopBGM();
      this.stopBossLfo();
      this.stopBossWarning();
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
  // 「発射音の数が少ない気がする。間引きすぎ？」
  // スロットリング間隔を 0.075s (75ms) から 0.022s (22ms) に大幅短縮し、
  // 4ボイスのラウンドロビン再生により前の音を切断せず重ねて発音。連射時の抜けを完全解消！
  public playShoot(pieceType?: string): void {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;

    // 1. 極小間隔スロットリング（同一フレーム内での超過剰重なり22msのみガード）
    if (now - this.lastShootTime < 0.022) return;
    this.lastShootTime = now;

    // 2. 4ボイス・ラウンドロビン（前の音を急停止させず自然に重ねる）
    const voiceIdx = this.shootVoiceIndex;
    this.shootVoiceIndex = (this.shootVoiceIndex + 1) % this.shootSources.length;

    // I, L, J, T, S, Z ミノにより発射音の音色・ピッチバリエーションを展開
    // I, T, S は OtoLogicのリアルアーケードショット音 (Arcade-Shooter01-1)
    // L, J, Z, O は レトロ矩形波レーザー音
    const useOtoLogicSample = pieceType === 'I' || pieceType === 'T' || pieceType === 'S';

    if (useOtoLogicSample && this.shootBuffer) {
      try {
        const src = this.ctx.createBufferSource();
        src.buffer = this.shootBuffer;
        // テトリミノに応じたピッチの微差（Iは高め、Tは標準、Sは鋭く）
        if (pieceType === 'I') src.playbackRate.value = 1.2;
        else if (pieceType === 'S') src.playbackRate.value = 1.1;
        else src.playbackRate.value = 1.0;

        const dur = 0.11;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.28, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

        src.connect(gain);
        gain.connect(this.ctx.destination);
        src.start(now);
        src.stop(now + dur + 0.01);

        this.shootSources[voiceIdx] = src;
        return;
      } catch {
        // フォールバック
      }
    }

    // レトロチップチューン音（ピッチを変調 & 短くキレよく）
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
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.08);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.09);
  }

  // 4. ムーンクレスタ ドッキング成功音（ピロリロリロリロピロピロ〜ン！）
  public playDock(): void {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
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

    // ユーザー提供のヤラレ音バッファを爆発音の核として合成再生
    const sampleIdx = big ? 4 : Math.floor(Math.random() * 3);
    const sample = this.enemyKillBuffers[sampleIdx];
    if (sample) {
      try {
        const src = this.ctx.createBufferSource();
        src.buffer = sample;
        src.playbackRate.value = big ? 0.85 : (0.95 + (Math.random() - 0.5) * 0.1);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(big ? 0.75 : 0.50, this.ctx.currentTime);
        src.connect(gain);
        gain.connect(this.ctx.destination);
        src.start(0);
      } catch {}
    }

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
      const raw = Math.random() * 2 - 1;
      const stepped = Math.round(raw * 4) / 4;
      data[i] = stepped * Math.exp(-i / (bufferSize * (big ? 0.35 : 0.25)));
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

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

  // ★ ユーザー要望：ザコ敵撃破時の小気味良いポップ音（ユーザー提供のレトロアーケード撃破音5種）
  // 敵のランクやサイズによって音色を自動選定し、ピッチも微妙に変調させて爽快感を最大化！
  public playEnemyPop(rank?: string): void {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    let bufferIndex = 0;
    if (rank === 'GREEN_DRONE' || rank === 'FOUR_FLY' || rank === 'MINI_EYE') {
      bufferIndex = Math.random() < 0.5 ? 0 : 1;
    } else if (rank === 'RED_GUARD' || rank === 'GRADIUS_FAN' || rank === 'FAST_FLYBY') {
      bufferIndex = Math.random() < 0.5 ? 1 : 2;
    } else if (rank === 'YELLOW_COMMANDER' || rank === 'STARFORCE_GARI' || rank === 'ATOMIC_PHANTOM' || rank === 'TOROID_SCOUT') {
      bufferIndex = Math.random() < 0.5 ? 2 : 3;
    } else if (rank === 'METEOR_ROCK' || rank === 'SPLITTING_EYE' || rank === 'BETA_PHANTOM' || rank === 'DART_MISSILE') {
      bufferIndex = Math.random() < 0.5 ? 3 : 4;
    } else {
      bufferIndex = Math.floor(Math.random() * 5);
    }

    const buf = this.enemyKillBuffers[bufferIndex];
    if (buf) {
      try {
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        // 微小なランダムピッチ変調で連続撃破の快感を演出
        src.playbackRate.value = 0.96 + Math.random() * 0.10;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.60, this.ctx.currentTime);
        src.connect(gain);
        gain.connect(this.ctx.destination);
        src.start(0);
        return;
      } catch {}
    }

    this.playExplosion(false);
  }

  // ★ ボス専用：轟音連続爆発サウンド！（ユーザー提供のヤラレ音群を多段炸裂）
  public playBossExplosion(): void {
    this.playExplosion(true);
    [0.08, 0.18, 0.30, 0.44].forEach((delay, i) => {
      window.setTimeout(() => {
        const buf = this.enemyKillBuffers[i % 5];
        if (buf && this.ctx && !this.isMuted) {
          try {
            const src = this.ctx.createBufferSource();
            src.buffer = buf;
            src.playbackRate.value = 0.8 + i * 0.08;
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.7, this.ctx.currentTime);
            src.connect(gain);
            gain.connect(this.ctx.destination);
            src.start(0);
          } catch {}
        }
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

  // ★ ユーザー要望：敵・ボスダメージ音
  // ユーザー提供の硬質で気持ちいい撃破・ダメージ音バッファを活用！
  public playEnemyDamage(isBoss = false): void {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const buf = isBoss
      ? (this.enemyKillBuffers[4] || this.damageBuffer)
      : (this.enemyKillBuffers[1] || this.damageBuffer);

    if (buf) {
      try {
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.playbackRate.value = isBoss ? (1.15 + (Math.random() - 0.5) * 0.1) : (1.05 + Math.random() * 0.08);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(isBoss ? 0.70 : 0.45, this.ctx.currentTime);
        src.connect(gain);
        gain.connect(this.ctx.destination);
        src.start(0);

        if (isBoss) {
          this.playBossMetallicClang();
        }
        return;
      } catch {}
    }
    this.playHit();
  }

  // ボス装甲被弾時の高音クリスプな金属音・衝撃クリック音（威力と装甲感を強調）
  private playBossMetallicClang(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    // 鋭い高域下降（2400Hz -> 850Hz）でキリッとした金属装甲の手応え
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(2400, now);
    osc.frequency.exponentialRampToValueAtTime(750, now + 0.045);

    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.05);
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

  // ★ ユーザー要望：宇宙基地サイレンはボス登場時に鳴らす、予告として
  public playBossWarning(): void {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;
    this.stopBossWarning();

    if (this.bossWarningBuffer) {
      try {
        const src = this.ctx.createBufferSource();
        src.buffer = this.bossWarningBuffer;
        src.loop = false;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.75, this.ctx.currentTime);

        src.connect(gain);
        gain.connect(this.ctx.destination);
        src.start(0);

        this.activeBossWarningSource = src;
        this.activeBossWarningGain = gain;
        return;
      } catch (e) {
        console.warn('playBossWarning error:', e);
      }
    }

    // フォールバック（サイレン調ピッチベンド）
    this.playPhaseAlert('shooting');
  }

  public stopBossWarning(): void {
    if (this.activeBossWarningGain && this.ctx) {
      try {
        const now = this.ctx.currentTime;
        this.activeBossWarningGain.gain.cancelScheduledValues(now);
        this.activeBossWarningGain.gain.setValueAtTime(this.activeBossWarningGain.gain.value, now);
        this.activeBossWarningGain.gain.linearRampToValueAtTime(0.001, now + 0.35);
      } catch {
        // ignore
      }
    }
    if (this.activeBossWarningSource) {
      try {
        this.activeBossWarningSource.stop(this.ctx ? this.ctx.currentTime + 0.4 : 0);
      } catch {
        // ignore
      }
      this.activeBossWarningSource = null;
    }
    this.activeBossWarningGain = null;
  }

  // ★ ユーザー要望：プレイヤがーやられたときの音は添付の爆発のどれかを使って
  public playPlayerDeath(): void {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    if (this.playerDeathBuffer) {
      try {
        const src = this.ctx.createBufferSource();
        src.buffer = this.playerDeathBuffer;
        src.playbackRate.value = 1.0;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.95, this.ctx.currentTime);

        src.connect(gain);
        gain.connect(this.ctx.destination);
        src.start(0);
        return;
      } catch (e) {
        console.warn('playPlayerDeath error:', e);
      }
    }

    // フォールバック（通常大爆発）
    this.playExplosion(true);
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
