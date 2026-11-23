// 互動音樂：完全用 Web Audio 即時合成，不需要任何音檔。
// - 撥弦（類似古箏）：龍珠移動越快，音符越密；龍珠在畫面越高，音越高。音階是 D 宮五聲音階。
// - 低音持續音：D 與 A 的五度，隨速度變亮。
// - 銅鑼：突然加速衝刺時敲一下。
// 所有聲音都送到 master，同時接一份到 recordDest，給錄影用。
export class DragonMusic {
  constructor() {
    this.ctx = null; this.on = false;
    this.acc = 0; this.lastY = 0; this.lastNote = -1; this.prevSpeed = 0; this.gongCooldown = 0;
  }
  start() {
    if (!this.ctx) this._build();
    this.ctx.resume(); this.on = true;
    this.master.gain.setTargetAtTime(0.9, this.ctx.currentTime, 0.4);
  }
  stop() {
    if (!this.ctx) return;
    this.on = false;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
  }
  get stream() { if (!this.ctx) this._build(); return this.recordDest.stream; }

  _build() {
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = ctx.createGain(); this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.recordDest = ctx.createMediaStreamDestination(); comp.connect(this.recordDest);
    // hall reverb from a generated impulse response
    this.reverb = ctx.createConvolver();
    const len = ctx.sampleRate * 3.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    this.reverb.buffer = ir;
    const wet = ctx.createGain(); wet.gain.value = 0.38; this.reverb.connect(wet); wet.connect(this.master);
    this.dry = ctx.createGain(); this.dry.gain.value = 0.8; this.dry.connect(this.master); this.dry.connect(this.reverb);

    // drone: D2 + A2 + D3, through a lowpass that opens with speed
    this.droneFilter = ctx.createBiquadFilter(); this.droneFilter.type = 'lowpass'; this.droneFilter.frequency.value = 300;
    this.droneGain = ctx.createGain(); this.droneGain.gain.value = 0.07;
    this.droneFilter.connect(this.droneGain); this.droneGain.connect(this.dry);
    [73.42, 110.0, 146.83].forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = i === 1 ? 'triangle' : 'sawtooth'; o.frequency.value = f;
      o.detune.value = (i - 1) * 4; const g = ctx.createGain(); g.gain.value = i === 2 ? 0.25 : 0.5;
      o.connect(g); g.connect(this.droneFilter); o.start();
    });
  }

  // D major pentatonic over three octaves (D E F# A B)
  _freq(step) {
    const pent = [0, 2, 4, 7, 9];
    const oct = Math.floor(step / 5), semi = pent[((step % 5) + 5) % 5] + 12 * oct;
    return 146.83 * Math.pow(2, semi / 12);   // D3 base
  }
  _pluck(freq, vel) {
    const ctx = this.ctx, t = ctx.currentTime;
    const out = ctx.createGain(); out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(0.22 * vel, t + 0.005); out.gain.exponentialRampToValueAtTime(0.0008, t + 1.8);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(freq * 9, t); lp.frequency.exponentialRampToValueAtTime(freq * 1.5, t + 0.6);
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    [[1, 'triangle', 1], [2, 'sine', 0.35], [3, 'sine', 0.12]].forEach(([m, type, a]) => {
      const o = ctx.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(freq * m * 1.012, t); o.frequency.exponentialRampToValueAtTime(freq * m, t + 0.08);  // string "bend"
      const g = ctx.createGain(); g.gain.value = a; o.connect(g); g.connect(lp); o.start(t); o.stop(t + 2);
    });
    lp.connect(out);
    if (pan) { pan.pan.value = (Math.random() - 0.5) * 0.8; out.connect(pan); pan.connect(this.dry); } else out.connect(this.dry);
  }
  _gong() {
    const ctx = this.ctx, t = ctx.currentTime;
    const out = ctx.createGain(); out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.35, t + 0.03); out.gain.exponentialRampToValueAtTime(0.0005, t + 4.5);
    [[73.4, 1], [113, 0.6], [161, 0.45], [227, 0.3], [301, 0.2]].forEach(([f, a]) => {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(f * 1.03, t); o.frequency.exponentialRampToValueAtTime(f, t + 1.2);
      const g = ctx.createGain(); g.gain.value = a; o.connect(g); g.connect(out); o.start(t); o.stop(t + 5);
    });
    out.connect(this.dry);
  }

  // called every frame: y01 = pearl height on screen (0 bottom .. 1 top), speed in scene units / s
  update(dt, y01, speed) {
    if (!this.on || !this.ctx) return;
    const now = this.ctx.currentTime, sp = Math.min(speed / 25, 1);
    this.droneFilter.frequency.setTargetAtTime(260 + 1400 * sp, now, 0.3);
    // notes: one every ~1.6 units of travel
    this.acc += speed * dt;
    if (this.acc > 1.6 && speed > 1.5) {
      this.acc = 0;
      let step = Math.round(Math.max(0, Math.min(1, y01)) * 13);
      if (step === this.lastNote) step += Math.random() < 0.5 ? 1 : -1;   // avoid repeating the same string
      this.lastNote = step;
      this._pluck(this._freq(Math.max(0, step)), 0.6 + 0.4 * sp);
    }
    // sudden dash -> gong
    this.gongCooldown -= dt;
    if (speed - this.prevSpeed > 14 * dt * 10 && speed > 18 && this.gongCooldown <= 0) { this._gong(); this.gongCooldown = 4; }
    this.prevSpeed = speed;
  }
}
