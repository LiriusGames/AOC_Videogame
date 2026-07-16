// ============================================================================
// AGE OF COMICS — chiptune SFX + lo-fi swing loop (WebAudio, no samples)
// ============================================================================
"use strict";

const SFX = (() => {
  let ctx = null, master = null, musicGain = null, enabled = true, musicTimer = null;

  function ensure() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
      musicGain = ctx.createGain(); musicGain.gain.value = 0.16; musicGain.connect(master);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function beep(freq, dur = 0.08, type = "square", vol = 0.4, when = 0, slide = 0) {
    if (!enabled) return;
    ensure();
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur = 0.15, vol = 0.3, when = 0, lp = 3000) {
    if (!enabled) return;
    ensure();
    const t = ctx.currentTime + when;
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = lp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t);
  }

  const fx = {
    click:   () => beep(880, 0.05, "square", 0.25),
    hover:   () => beep(440, 0.03, "square", 0.08),
    cash:    () => { beep(1245, 0.07, "square", 0.3); beep(1660, 0.1, "square", 0.3, 0.06); },
    coin:    () => { beep(988, 0.05, "square", 0.3); beep(1319, 0.12, "square", 0.3, 0.05); },
    print:   () => { noise(0.12, 0.4, 0, 900); beep(110, 0.15, "sawtooth", 0.3, 0.02, -40); noise(0.2, 0.3, 0.14, 700); },
    paper:   () => noise(0.1, 0.22, 0, 4500),
    fan:     () => { beep(660, 0.06, "triangle", 0.35); beep(880, 0.06, "triangle", 0.35, 0.06); beep(1100, 0.1, "triangle", 0.35, 0.12); },
    fanloss: () => beep(300, 0.2, "triangle", 0.3, 0, -120),
    stamp:   () => { noise(0.05, 0.5, 0, 1200); beep(150, 0.1, "square", 0.3, 0.01, -60); },
    walk:    () => noise(0.06, 0.2, 0, 800),
    cab:     () => { beep(520, 0.08, "sawtooth", 0.2, 0, 140); beep(390, 0.1, "sawtooth", 0.18, 0.1, -60); },
    error:   () => { beep(220, 0.12, "square", 0.3); beep(165, 0.2, "square", 0.3, 0.1); },
    mastery: () => [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.14, "square", 0.3, i * 0.09)),
    fanfare: () => [523, 523, 523, 659, 784, 1047].forEach((f, i) => beep(f, i >= 4 ? 0.4 : 0.12, "square", 0.32, i * 0.13)),
    taunt:   () => { beep(330, 0.1, "sawtooth", 0.2); beep(311, 0.14, "sawtooth", 0.2, 0.1); },
    turn:    () => beep(700, 0.06, "triangle", 0.25),
    tada:    () => { [523, 659, 784, 988, 1319].forEach((f, i) => beep(f, i === 4 ? 0.35 : 0.11, "square", 0.32, i * 0.08)); noise(0.3, 0.12, 0.4, 8000); },
    womp:    () => { beep(392, 0.2, "sawtooth", 0.28, 0, -80); beep(311, 0.34, "sawtooth", 0.26, 0.18, -90); },
    whoosh:  () => noise(0.32, 0.24, 0, 2400),
    // one restrained teleprinter clack + faint bell (throttled by the caller)
    wire:    () => { noise(0.03, 0.14, 0, 2200); beep(1760, 0.08, "triangle", 0.09, 0.03); },
    // a full line printing: a burst of typebar clacks, then the carriage bell
    teletype:() => {
      for (let i = 0; i < 9; i++) noise(0.022, 0.13, i * 0.055 + (i % 3) * 0.012, 2400);
      beep(1760, 0.1, "triangle", 0.1, 0.52);
    },
    drumroll:() => { for (let i = 0; i < 8; i++) noise(0.04, 0.25, i * 0.05, 1400); beep(880, 0.2, "square", 0.3, 0.42); },
  };

  // ---------------------------------------------- 1940s swing combo (chiptune)
  // Walking bass + brushed ride with swing eighths + comp stabs on 2 & 4 +
  // a sparse muted-trumpet lead. Classic A-section changes: I vi ii V ...
  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
  // chords as midi pitch classes [bass root, chord tones for comp/lead]
  const CHANGES = [
    { root: 48, tones: [60, 64, 67, 69] },   // C6
    { root: 45, tones: [60, 64, 67, 69] },   // Am7 (C E G over A)
    { root: 50, tones: [62, 65, 69, 72] },   // Dm7
    { root: 43, tones: [59, 62, 65, 67] },   // G7
    { root: 48, tones: [60, 64, 67, 70] },   // C7
    { root: 53, tones: [60, 65, 69, 74] },   // F6
    { root: 50, tones: [62, 65, 69, 72] },   // Dm7
    { root: 43, tones: [59, 62, 65, 67] },   // G7
  ];
  const BEAT = 60 / 138;          // ~138 bpm
  const SWING = BEAT * 0.66;      // swung off-beat
  let beat = 0;

  function brush(t, vol, freq = 7000, dur = 0.06) {
    const buf = ctx.createBuffer(1, (ctx.sampleRate * dur) | 0, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(musicGain); src.start(t);
  }
  function bassNote(t, m, dur = BEAT * 0.9) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "triangle"; o.frequency.value = midi(m);
    g.gain.setValueAtTime(0.55, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(musicGain); o.start(t); o.stop(t + dur + 0.03);
  }
  function compChord(t, tones, vol = 0.055, dur = 0.16) {
    for (const m of tones.slice(0, 3)) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 1800;
      o.type = "square"; o.frequency.value = midi(m);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(f); f.connect(g); g.connect(musicGain); o.start(t); o.stop(t + dur + 0.03);
    }
  }
  function trumpet(t, m, dur) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 1400; f.Q.value = 4;
    const vib = ctx.createOscillator(), vibGain = ctx.createGain();
    vib.frequency.value = 5.5; vibGain.gain.value = 6;
    vib.connect(vibGain); vibGain.connect(o.frequency);
    o.type = "sawtooth"; o.frequency.value = midi(m);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.04);
    g.gain.setValueAtTime(0.09, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f); f.connect(g); g.connect(musicGain);
    o.start(t); vib.start(t); o.stop(t + dur + 0.05); vib.stop(t + dur + 0.05);
  }

  let phrase = null; // active trumpet phrase {notes:[...], i}
  function musicTick() {
    if (!enabled || !ctx) return;
    const t = ctx.currentTime + 0.03;
    const bar = (beat / 4) | 0;
    const inBar = beat % 4;
    const ch = CHANGES[bar % CHANGES.length];
    const next = CHANGES[(bar + 1) % CHANGES.length];

    // walking bass: root / 3rd / 5th / chromatic approach to next root
    const third = ch.tones[1] - 12, fifth = ch.root + 7;
    const approach = next.root + (Math.random() < 0.5 ? 1 : -1);
    bassNote(t, [ch.root, third, fifth, approach][inBar]);

    // brushed ride: swing pattern (ding ... ding-a) + hats on 2 & 4
    brush(t, 0.09);
    if (inBar === 1 || inBar === 3) {
      brush(t + SWING, 0.05);
      brush(t, 0.05, 9500, 0.12); // brush sweep
    }

    // comp stabs on 2 and 4 (slightly behind the beat, like a rhythm guitar)
    if (inBar === 1 || inBar === 3) compChord(t + 0.02, ch.tones);

    // sparse muted trumpet: start a 3-5 note phrase now and then
    if (!phrase && inBar === 0 && Math.random() < 0.3) {
      const pool = ch.tones.concat([ch.tones[0] + 12]);
      const len = 3 + ((Math.random() * 3) | 0);
      phrase = { notes: Array.from({ length: len }, () => pool[(Math.random() * pool.length) | 0] + 12), i: 0 };
    }
    if (phrase) {
      const dur = Math.random() < 0.3 ? BEAT * 1.4 : BEAT * 0.55;
      trumpet(t + (Math.random() < 0.4 ? SWING : 0), phrase.notes[phrase.i], dur);
      if (++phrase.i >= phrase.notes.length) phrase = null;
    }
    beat++;
  }
  function startMusic() {
    ensure();
    if (musicTimer) return;
    musicTimer = setInterval(musicTick, BEAT * 1000);
  }
  function stopMusic() { clearInterval(musicTimer); musicTimer = null; }

  return {
    play(name) { try { if (fx[name]) fx[name](); } catch (e) {} },
    startMusic, stopMusic,
    toggle() {
      enabled = !enabled;
      if (!enabled) stopMusic(); else startMusic();
      return enabled;
    },
    get enabled() { return enabled; },
    unlock() { try { ensure(); } catch (e) {} },
  };
})();
