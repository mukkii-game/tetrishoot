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
  private audioUnavailable = false; // Web Audio が使えない環境（生成失敗）では以降一切触らない
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

  // ★ クリア画面BGM（public/audio/game_clear.mp3 を実行時に読み込み）
  private clearMusicBuffer: AudioBuffer | null = null;
  private clearMusicLoading = false;
  private clearMusicRequested = false;
  private activeClearMusicSource: AudioBufferSourceNode | null = null;
  private activeClearMusicGain: GainNode | null = null;

  // ★ ステージBGM（public/audio/stage_bgm.mp3 があればそれをループ再生。無ければ従来の合成BGM）
  //   お試し版ブランチにだけ mp3 を置く運用。本番ビルドにはファイルが無いので自動的に合成BGMになる
  private stageMusicBuffer: AudioBuffer | null = null;
  private stageMusicState: 'unknown' | 'loading' | 'ready' | 'missing' = 'unknown';
  private stageMusicSource: AudioBufferSourceNode | null = null;
  private stageMusicGain: GainNode | null = null;
  private stageMusicStartedAt = 0;
  private stageMusicOffset = 0;

  // ショット音の同時発音管理（間引きはせず、同時に鳴る数だけ上限3で古い音から消す）
  private static readonly MAX_SHOT_VOICES = 6;
  private shootVoices: { gain: GainNode; endTime: number }[] = [];
  // ショット音専用バス（コンプレッサーで多砲門同時発射時のクリップ・濁りを防止）
  private shotBus: DynamicsCompressorNode | null = null;

  constructor() {
    // ★ バグ修正：以前は初回のユーザー操作（クリック等）でAudioContextを作成し、
    //   そこから mp3 ステージBGM（数MB）のフェッチ＆デコードを始めていた。
    //   タイトル操作からドッキング完了までの数秒では読み込みが間に合わず、
    //   「合成音が鳴った後、数秒遅れて本物の曲が最初から割り込む」ように聞こえていた。
    //   AudioContext の生成・デコードはユーザー操作なしでも可能（resume() だけが操作を要求する）
    //   ため、ページ読み込み直後に前倒しで開始する。
    this.initContext();
  }

  public resumeAudio(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => { /* 次のユーザー操作で再挑戦するので無視 */ });
    }
  }

  // 爆発ノイズ波形のキャッシュ（種類ごとに数パターンを使い回す）
  private noiseBuffers = new Map<string, AudioBuffer[]>();
  private static readonly NOISE_VARIANTS = 3;

  private getNoiseBuffer(dur: number, big: boolean): AudioBuffer {
    const ctx = this.ctx!;
    const bufferSize = Math.floor(ctx.sampleRate * dur);
    const key = (big ? 'b' : 's') + bufferSize;
    let pool = this.noiseBuffers.get(key);
    if (!pool) {
      pool = [];
      this.noiseBuffers.set(key, pool);
    }
    if (pool.length < Sound.NOISE_VARIANTS) {
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      const decay = bufferSize * (big ? 0.35 : 0.25);
      for (let i = 0; i < bufferSize; i++) {
        const raw = Math.random() * 2 - 1;
        const stepped = Math.round(raw * 4) / 4;
        data[i] = stepped * Math.exp(-i / decay);
      }
      pool.push(buffer);
      return buffer;
    }
    return pool[Math.floor(Math.random() * pool.length)];
  }

  private initContext(): void {
    if (this.audioUnavailable) return;
    if (!this.ctx) {
      // ★ AudioContext の生成に失敗しても絶対にゲーム本体を巻き込まない。
      //   （コンストラクタで呼ぶため、ここで例外が漏れると GameManager が生成されず
      //     画面が真っ暗のまま何もできなくなる。各再生メソッドは ctx===null を見て無音で通す）
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) {
          this.audioUnavailable = true;
          return;
        }
        this.ctx = new AudioCtx();
      } catch (e) {
        console.warn('AudioContext unavailable:', e);
        this.audioUnavailable = true;
        this.ctx = null;
        return;
      }
      this.loadOtoLogicBuffers();
      this.loadStageMusic();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => { /* ユーザー操作前の resume 失敗は無視 */ });
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
      const wasClearMusic = this.clearMusicRequested;
      this.stopClearMusic();
      this.clearMusicRequested = wasClearMusic;
    } else if (this.clearMusicRequested) {
      this.playClearMusic();
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
  // 「発射している数の割に音が少ない。間引かないで出して。3つ以上被ったら消すなど、うるささを抑える処理はいる」
  // → 時間による間引きは廃止。弾1発ごとに必ず鳴らし、同時発音は最大3ボイス（超過時は最も古い音をフェードアウト）
  public playShootVolley(pieceTypes: (string | undefined)[]): void {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;
    // ★ ユーザー要望：基本は全部鳴らし、重なりが多い時だけ抑える
    //   ・1回の一斉発射は最大4発まで発音（5発目以降は省略）
    //   ・同時刻に同じ波形を重ねると濁るので、1発ごとに 28ms ずらして「ダダダッ」と粒立たせる
    //   ・発数が多いほど1発あたりの音量を下げ（1/√n）、ピッチも僅かにばらして位相干渉を回避
    // ★ ユーザー要望：音量は下げない。被りすぎた時（同時発音が上限超過）だけ新しい音を間引く
    const n = Math.min(4, pieceTypes.length);
    for (let i = 0; i < n; i++) {
      const detune = 1 + (Math.random() - 0.5) * 0.12;
      this.playShoot(pieceTypes[i], i * 0.028, 1.0, detune);
    }
  }

  private getShotBus(): AudioNode {
    if (!this.ctx) throw new Error('no ctx');
    if (!this.shotBus) {
      const comp = this.ctx.createDynamicsCompressor();
      // クリップ防止程度の軽いリミッター（強く潰すと連射時に音が痩せる）
      comp.threshold.value = -8;
      comp.knee.value = 6;
      comp.ratio.value = 3;
      comp.attack.value = 0.002;
      comp.release.value = 0.05;
      comp.connect(this.ctx.destination);
      this.shotBus = comp;
    }
    return this.shotBus;
  }

  private allocShotVoice(now: number, dur: number): GainNode | null {
    if (!this.ctx) return null;
    // 鳴り終わったボイスを除去
    this.shootVoices = this.shootVoices.filter(v => v.endTime > now);
    // 上限超過（被りすぎ）：鳴っている音は切らず、新しい音のほうを間引く
    if (this.shootVoices.length >= Sound.MAX_SHOT_VOICES) {
      return null;
    }
    const gain = this.ctx.createGain();
    gain.connect(this.getShotBus());
    this.shootVoices.push({ gain, endTime: now + dur });
    return gain;
  }

  public playShoot(pieceType?: string, delay = 0, volume = 1.0, detune = 1.0): void {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime + delay;

    // I, L, J, T, S, Z ミノにより発射音の音色・ピッチバリエーションを展開
    // I, T, S は OtoLogicのリアルアーケードショット音 (Arcade-Shooter01-1)
    // L, J, Z, O は レトロ矩形波レーザー音
    const useOtoLogicSample = pieceType === 'I' || pieceType === 'T' || pieceType === 'S';

    if (useOtoLogicSample && this.shootBuffer) {
      try {
        const dur = 0.16;
        const SHOOT_SAMPLE_OFFSET = 0.10; // サンプル先頭の無音（約105ms）をスキップ
        const gain = this.allocShotVoice(now, dur);
        if (!gain) return;
        const src = this.ctx.createBufferSource();
        src.buffer = this.shootBuffer;
        // ブロックパーツに応じたピッチの微差（Iは高め、Tは標準、Sは鋭く）
        if (pieceType === 'I') src.playbackRate.value = 1.2 * detune;
        else if (pieceType === 'S') src.playbackRate.value = 1.1 * detune;
        else src.playbackRate.value = 1.0 * detune;

        gain.gain.setValueAtTime(0.28 * volume, now);
        gain.gain.setValueAtTime(0.28 * volume, now + dur * 0.5);
        gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

        src.connect(gain);
        // ★ バグ修正：このサンプルは先頭約105msが無音で、従来は110msしか再生していなかったため
        //   実際の発射音がほぼ丸ごと切れていた（I/T/Sミノで「音が出ない」原因）。無音部分を飛ばして再生
        src.start(now, SHOOT_SAMPLE_OFFSET);
        src.stop(now + dur + 0.01);
        return;
      } catch {
        // フォールバック
      }
    }

    // レトロチップチューン音（ピッチを変調 & 短くキレよく）
    // ★ ユーザー要望：O/L/J/Z ミノの発射音がサンプル音より小さく埋もれていたので音量・長さを引き上げ
    const dur = 0.10;
    const gain = this.allocShotVoice(now, dur);
    if (!gain) return;
    const osc = this.ctx.createOscillator();

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

    osc.frequency.setValueAtTime(startFreq * detune, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq * detune, now + dur);

    gain.gain.setValueAtTime(0.26 * volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc.connect(gain);

    osc.start(now);
    osc.stop(now + dur + 0.01);
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
    // ★ 性能：以前は爆発のたびに数万サンプルのノイズを JS ループで合成していた
    //   （1回あたり 12,000〜23,000 回の Math.random + Math.exp と 50〜92KB の使い捨て配列）。
    //   ボス撃破では 440ms のあいだに5連発するため、描画フレームの合間に
    //   まとまった処理とゴミが発生して一瞬つっかえる原因になっていた。
    //   波形は毎回作り直す必要が無いので、種類ごとに数パターンだけ作って使い回す。
    //   （複数パターンからランダムに選ぶので、同じ音の繰り返しには聞こえない）
    const buffer = this.getNoiseBuffer(dur, big);

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

        // ★ ユーザー要望：死亡音が大きすぎたので音量を下げ、2秒でフェードアウト
        const gain = this.ctx.createGain();
        const t0 = this.ctx.currentTime;
        gain.gain.setValueAtTime(0.55, t0);
        gain.gain.setValueAtTime(0.55, t0 + 1.2);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + 2.0);

        src.connect(gain);
        gain.connect(this.ctx.destination);
        src.start(0);
        src.stop(t0 + 2.05);
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

  // ★ ユーザー要望：クリア画面で mp3 を流す（ループなし・一回のみ再生）
  // ファイルは public/audio/game_clear.mp3 に配置。読み込めない場合は従来の勝利ジングルにフォールバック。
  public playClearMusic(): void {
    this.stopBGM();
    this.stopBossLfo();
    this.stopBossWarning();
    this.clearMusicRequested = true;
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    if (this.clearMusicBuffer) {
      this.startClearMusicSource();
      return;
    }
    if (this.clearMusicLoading) return;
    this.clearMusicLoading = true;
    fetch('./audio/game_clear.mp3')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then(data => this.ctx!.decodeAudioData(data))
      .then(buf => {
        this.clearMusicBuffer = buf;
        this.clearMusicLoading = false;
        if (this.clearMusicRequested) this.startClearMusicSource();
      })
      .catch(err => {
        console.warn('Clear music load failed, falling back to jingle:', err);
        this.clearMusicLoading = false;
        if (this.clearMusicRequested) this.playVictory();
      });
  }

  private startClearMusicSource(): void {
    if (!this.ctx || !this.clearMusicBuffer || this.isMuted) return;
    this.stopClearMusic();
    this.clearMusicRequested = true;
    const src = this.ctx.createBufferSource();
    src.buffer = this.clearMusicBuffer;
    src.loop = false; // ★ ユーザー要望：ループせず一回だけ再生
    src.onended = () => {
      if (this.activeClearMusicSource === src) {
        this.activeClearMusicSource = null;
        this.activeClearMusicGain = null;
      }
    };
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.7, this.ctx.currentTime + 0.5);
    src.connect(gain);
    gain.connect(this.ctx.destination);
    src.start();
    this.activeClearMusicSource = src;
    this.activeClearMusicGain = gain;
  }

  public stopClearMusic(): void {
    this.clearMusicRequested = false;
    if (this.activeClearMusicSource) {
      try {
        if (this.activeClearMusicGain && this.ctx) {
          this.activeClearMusicGain.gain.cancelScheduledValues(this.ctx.currentTime);
          this.activeClearMusicGain.gain.setValueAtTime(this.activeClearMusicGain.gain.value, this.ctx.currentTime);
          this.activeClearMusicGain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.3);
        }
        this.activeClearMusicSource.stop(this.ctx ? this.ctx.currentTime + 0.3 : 0);
      } catch {
        /* already stopped */
      }
      this.activeClearMusicSource = null;
      this.activeClearMusicGain = null;
    }
  }

  // BGM
  private loadStageMusic(): void {
    if (!this.ctx || this.stageMusicState !== 'unknown') return;
    this.stageMusicState = 'loading';
    fetch('./audio/stage_bgm.mp3')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then(data => this.ctx!.decodeAudioData(data))
      .then(buf => {
        this.stageMusicBuffer = buf;
        this.stageMusicState = 'ready';
        // 読み込み完了時に既にシューティング中なら、合成BGMから mp3 に切り替える
        if (this.currentBgmPhase === 'shooting' && this.bgmIntervalId !== null) {
          clearInterval(this.bgmIntervalId);
          this.bgmIntervalId = null;
          this.startStageMusic(0);
        }
      })
      .catch(() => {
        this.stageMusicState = 'missing';
      });
  }

  private startStageMusic(offset: number): void {
    if (!this.ctx || !this.stageMusicBuffer || this.isMuted) return;
    this.stopStageMusicSource();
    const src = this.ctx.createBufferSource();
    src.buffer = this.stageMusicBuffer;
    src.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.65, this.ctx.currentTime);
    src.connect(gain);
    gain.connect(this.ctx.destination);
    const startOffset = offset % this.stageMusicBuffer.duration;
    src.start(0, startOffset);
    this.stageMusicSource = src;
    this.stageMusicGain = gain;
    this.stageMusicStartedAt = this.ctx.currentTime - startOffset;
  }

  private stopStageMusicSource(fadeSec = 0): void {
    if (this.stageMusicSource && this.ctx) {
      try {
        if (fadeSec > 0 && this.stageMusicGain) {
          const t = this.ctx.currentTime;
          this.stageMusicGain.gain.cancelScheduledValues(t);
          this.stageMusicGain.gain.setValueAtTime(this.stageMusicGain.gain.value, t);
          this.stageMusicGain.gain.exponentialRampToValueAtTime(0.001, t + fadeSec);
          this.stageMusicSource.stop(t + fadeSec);
        } else {
          this.stageMusicSource.stop();
        }
      } catch {
        /* already stopped */
      }
    }
    this.stageMusicSource = null;
    this.stageMusicGain = null;
  }

  // mp3 ステージBGMが使える状態か（ゲーム側の「ドッキング後3秒イントロ」判定に使用）
  public hasStageMusic(): boolean {
    return this.stageMusicState === 'ready';
  }

  // ボス撃破時：ステージBGM（mp3）をフェードアウトして止める。合成BGMは従来どおりクリア処理で止まる
  public stopStageMusicOnBossDefeat(): void {
    if (this.stageMusicSource) {
      this.stopStageMusicSource(1.0);
      this.currentBgmPhase = 'none';
    }
  }

  public startBGM(phase: 'tetris' | 'shooting'): void {
    if (this.currentBgmPhase === phase) return;
    this.stopBGM();
    this.currentBgmPhase = phase;
    if (this.isMuted) return;
    this.initContext();
    // ★ ユーザー要望：mp3 ステージBGMはドッキング完了（シューティング開始）の瞬間から鳴らす。
    //   ドッキング中は従来の合成BGMのまま
    if (this.stageMusicState === 'ready' && phase === 'shooting') {
      this.startStageMusic(0);
      return;
    }

    // ドッキング時はムーンクレスタ風の静寂と推進エンジンパルス、シューティング時は緊張感あるベースライン
    const tetrisNotes = [130.81, 164.81, 196.00, 164.81];
    const shootBass = [130, 130, 195, 130, 164, 130, 174, 195];
    const beat = (phase === 'tetris' ? 220 : 125) / 1000; // 1音の長さ（秒）

    // ★ 重要（スマホでBGMが遅く聞こえる問題の修正）
    //   以前は setInterval が発火した「その瞬間」に音を鳴らしていた。
    //   setInterval はメインスレッドが混むと平気で遅延するため、
    //   描画が重い場面＝スマホほどテンポがずるずる遅れて聞こえていた。
    //   （＝BGMの遅さは、そのまま画面の負荷メーターになっていた）
    //   そこで「オーディオ時計を正として先読みで予約する」方式に変更する。
    //   タイマーはあくまで“予約しに行くきっかけ”でしかないので、
    //   多少遅れて起きても、音そのものは正確な時刻に鳴る＝テンポが崩れない。
    const LOOKAHEAD = 0.18; // 何秒先まで予約しておくか
    let step = 0;
    let nextNoteTime = this.ctx ? this.ctx.currentTime + 0.06 : 0;

    this.bgmIntervalId = window.setInterval(() => {
      const ctx = this.ctx;
      if (this.isMuted || !ctx) return;

      // タブ復帰などで大きく取り残された場合は現在時刻へ貼り直す（早送りで追いつかない）
      if (nextNoteTime < ctx.currentTime - 0.3) nextNoteTime = ctx.currentTime + 0.03;

      while (nextNoteTime < ctx.currentTime + LOOKAHEAD) {
        const at = nextNoteTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = phase === 'tetris' ? 'triangle' : 'square';
        const freq = phase === 'tetris'
          ? tetrisNotes[step % tetrisNotes.length]
          : shootBass[step % shootBass.length];
        osc.frequency.setValueAtTime(freq, at);
        gain.gain.setValueAtTime(phase === 'tetris' ? 0.018 : 0.038, at);
        gain.gain.exponentialRampToValueAtTime(0.002, at + 0.14);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(at);
        osc.stop(at + 0.13);

        step++;
        nextNoteTime += beat;
      }
    }, 40); // 先読み幅より十分短い間隔で予約しに行く
  }

  public pauseBGM(): void {
    if (this.bgmIntervalId !== null) {
      clearInterval(this.bgmIntervalId);
      this.bgmIntervalId = null;
    }
    if (this.stageMusicSource && this.ctx) {
      this.stageMusicOffset = this.ctx.currentTime - this.stageMusicStartedAt;
      this.stopStageMusicSource();
    }
    this.stopBossLfo();
  }

  public resumeBGM(): void {
    if (this.currentBgmPhase === 'none') return;
    if (this.stageMusicState === 'ready' && this.currentBgmPhase === 'shooting') {
      if (!this.stageMusicSource) this.startStageMusic(this.stageMusicOffset);
      return;
    }
    if (this.bgmIntervalId === null) {
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
    this.stopStageMusicSource();
    this.stageMusicOffset = 0;
    this.currentBgmPhase = 'none';
    this.stopBossLfo();
  }
}
