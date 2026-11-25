// Tiny synthesized sounds (WebAudio). Nothing is downloaded. Starts only after a user gesture.
let ctx;
function ac() { try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); } catch { ctx = null; } return ctx; }
function tone(f, t0, dur, type = 'sine', vol = 0.2, slide) {
  const c = ac(); if (!c) return; const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f, c.currentTime + t0); if (slide) o.frequency.exponentialRampToValueAtTime(slide, c.currentTime + t0 + dur);
  g.gain.setValueAtTime(0.0001, c.currentTime + t0); g.gain.exponentialRampToValueAtTime(vol, c.currentTime + t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + t0 + dur);
  o.connect(g).connect(c.destination); o.start(c.currentTime + t0); o.stop(c.currentTime + t0 + dur + 0.05);
}
function noise(t0, dur, vol = 0.12, hp = 4000) {
  const c = ac(); if (!c) return; const n = c.sampleRate * dur, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = b; f.type = 'highpass'; f.frequency.value = hp; g.gain.value = vol;
  s.connect(f).connect(g).connect(c.destination); s.start(c.currentTime + t0);
}
// Sound ids and the key of each one's name in strings.js (shown with t()).
export const BLOCK_SOUNDS = { drop: 'sDrop', bell: 'sBell', chime: 'sChime', cymbal: 'sCymbal', whoosh: 'sWhoosh' };
export const ALARM_SOUNDS = { clock: 'sClock', gong: 'sGong', grandfather: 'sGrand', beep: 'sBeep' };
export function play(name) {
  switch (name) {
    case 'drop': tone(900, 0, 0.25, 'sine', 0.25, 300); break;
    case 'bell': tone(880, 0, 1.2, 'sine', 0.2); tone(1760, 0, 0.8, 'sine', 0.08); break;
    case 'chime': tone(659, 0, 0.6, 'triangle', 0.18); tone(523, 0.3, 0.9, 'triangle', 0.18); break;
    case 'cymbal': noise(0, 1.1, 0.14, 5000); break;
    case 'whoosh': noise(0, 0.7, 0.1, 800); break;
    case 'clock': for (let i = 0; i < 8; i++) tone(i % 2 ? 1500 : 1300, i * 0.18, 0.1, 'square', 0.08); break;
    case 'gong': tone(110, 0, 3, 'sine', 0.3); tone(165, 0, 2.5, 'sine', 0.15); noise(0, 0.4, 0.05, 2000); break;
    case 'grandfather': for (let i = 0; i < 4; i++) { tone(196, i * 0.9, 0.8, 'triangle', 0.22); } break;
    case 'beep': for (let i = 0; i < 4; i++) tone(1000, i * 0.3, 0.15, 'square', 0.1); break;
  }
}
