#!/usr/bin/env node
/**
 * Generates simple synthesised WAV files and writes them to assets/sounds/.
 * Run: node scripts/gen-sounds.js
 */

const fs   = require('fs');
const path = require('path');

const SAMPLE_RATE = 22050;
const OUT_DIR = path.join(__dirname, '..', 'assets', 'sounds');
fs.mkdirSync(OUT_DIR, { recursive: true });

function buildWav(samples) {
  const n = samples.length;
  const dataSize = n * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);          // PCM
  buf.writeUInt16LE(1, 22);          // mono
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buf;
}

/** Ball land/pour: short descending "blop" */
function makePour() {
  const dur = 0.12;
  const n = Math.floor(SAMPLE_RATE * dur);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const freq = 420 - 140 * (t / dur);
    const phase = 2 * Math.PI * freq * t;
    const env = Math.exp(-t * 30);
    s[i] = (Math.sin(phase) * 0.6 + Math.sin(phase * 2) * 0.15) * env;
  }
  return buildWav(s);
}

/** Level complete fanfare: C5→E5→G5 arpeggio */
function makeWin() {
  const dur = 0.55;
  const n = Math.floor(SAMPLE_RATE * dur);
  const s = new Float32Array(n);
  const notes = [523.25, 659.25, 783.99];
  const nd = dur / notes.length;
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const ni = Math.min(Math.floor(t / nd), notes.length - 1);
    const lt = t - ni * nd;
    const f = notes[ni];
    let env = Math.exp(-lt * 4);
    if (lt < 0.01) env *= lt / 0.01;
    s[i] = (Math.sin(2 * Math.PI * f * t) * 0.5 +
             Math.sin(2 * Math.PI * f * 2 * t) * 0.2 +
             Math.sin(2 * Math.PI * f * 3 * t) * 0.1) * env * 0.7;
  }
  return buildWav(s);
}

/** Coin earn: bright C6 chime */
function makeCoin() {
  const dur = 0.22;
  const n = Math.floor(SAMPLE_RATE * dur);
  const s = new Float32Array(n);
  const f = 1047;
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 14);
    s[i] = (Math.sin(2 * Math.PI * f * t) * 0.5 +
             Math.sin(2 * Math.PI * f * 2 * t) * 0.25 +
             Math.sin(2 * Math.PI * f * 3 * t) * 0.1) * env * 0.7;
  }
  return buildWav(s);
}

/** Hint whoosh: 200→900 Hz sweep */
function makeHint() {
  const dur = 0.18;
  const n = Math.floor(SAMPLE_RATE * dur);
  const s = new Float32Array(n);
  // Use a deterministic pseudo-random for reproducible output
  let seed = 42;
  const rand = () => { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed / 0x80000000) - 1; };
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const p = t / dur;
    const freq = 200 + 700 * p;
    const phase = 2 * Math.PI * freq * t;
    const env = p < 0.3 ? p / 0.3 : 1 - (p - 0.3) / 0.7;
    s[i] = (Math.sin(phase) * 0.5 + rand() * 0.15) * env * 0.55;
  }
  return buildWav(s);
}

const sounds = { pour: makePour(), win: makeWin(), coin: makeCoin(), hint: makeHint() };

for (const [name, buf] of Object.entries(sounds)) {
  const p = path.join(OUT_DIR, `${name}.wav`);
  fs.writeFileSync(p, buf);
  console.log(`Wrote ${p}  (${buf.length} bytes)`);
}
