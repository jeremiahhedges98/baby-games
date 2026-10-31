'use strict';

/* =========================================================
   Play Time: ad-free learning games for little ones.
   Everything is local: no network calls, no links, no tracking.
   ========================================================= */

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => arr.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
const RAINBOW = ['#ff4d4d', '#ff9f1c', '#ffd60a', '#3ddc84', '#2ec4f1', '#4361ee', '#9b5de5', '#ff5ca8'];

// Re-trigger a CSS animation class on an element.
function animate(node, cls) {
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
}

/* ---------------- Sound (Web Audio, all synthesized) ---------------- */
const Sound = {
  ctx: null,
  unlock() {
    if (!this.ctx) {
      // Play through the iPad's silent switch.
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      const comp = this.ctx.createDynamicsCompressor();
      comp.connect(this.ctx.destination);
      this.out = this.ctx.createGain();
      this.out.gain.value = 0.9;
      this.out.connect(comp);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, len);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state !== 'running') this.ctx.resume();
  },
  env(gainNode, t, peak, attack, decay) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(peak, t + attack);
    g.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  },
  tone(freq, { type = 'sine', vol = 0.3, attack = 0.01, decay = 0.4, delay = 0, slideTo } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + attack + decay);
    this.env(g, t, vol, attack, decay);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + attack + decay + 0.05);
  },
  noise({ vol = 0.3, decay = 0.2, filter = 'highpass', freq = 1000, q = 1, delay = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    this.env(g, t, vol, 0.002, decay);
    s.connect(f).connect(g).connect(this.out);
    s.start(t);
    s.stop(t + decay + 0.05);
  },

  // Little effects
  pop() { this.tone(rand(500, 700), { slideTo: 1400, decay: 0.12, vol: 0.35, type: 'triangle' }); },
  boop() { this.tone(rand(300, 500), { slideTo: 200, decay: 0.15, vol: 0.2 }); },
  chime() { [0, 4, 7, 12].forEach((s, i) => this.tone(523 * 2 ** (s / 12), { delay: i * 0.09, decay: 0.5, vol: 0.2, type: 'triangle' })); },
  cheer() { [0, 4, 7, 12, 16].forEach((s, i) => this.tone(392 * 2 ** (s / 12), { delay: i * 0.08, decay: 0.6, vol: 0.22, type: 'square' })); },

  // Instruments
  piano(freq) {
    this.tone(freq, { type: 'triangle', vol: 0.45, attack: 0.005, decay: 1.4 });
    this.tone(freq * 2, { type: 'sine', vol: 0.12, attack: 0.005, decay: 0.8 });
  },
  kick() { this.tone(160, { slideTo: 40, decay: 0.45, vol: 0.9, attack: 0.002 }); },
  snare() { this.noise({ vol: 0.6, decay: 0.2, filter: 'bandpass', freq: 3000, q: 0.7 }); this.tone(190, { decay: 0.1, vol: 0.3, type: 'triangle' }); },
  hihat() { this.noise({ vol: 0.4, decay: 0.07, freq: 8000 }); },
  tom() { this.tone(240, { slideTo: 110, decay: 0.35, vol: 0.7, attack: 0.002 }); },
  crash() { this.noise({ vol: 0.45, decay: 1.4, freq: 5000 }); },
  clap() { [0, 0.012, 0.026].forEach((d) => this.noise({ vol: 0.5, decay: 0.09, filter: 'bandpass', freq: 1400, q: 1.2, delay: d })); },
};

/* ---------------- Voice (built-in speech) ---------------- */
const Voice = {
  voice: null,
  choose() {
    const voices = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
    const preferred = ['Samantha', 'Karen', 'Moira', 'Tessa', 'Google US English'];
    this.voice = preferred.map((n) => voices.find((v) => v.name.includes(n))).find(Boolean)
      || voices.find((v) => v.lang === 'en-US') || voices[0] || null;
  },
  say(text, { rate = 0.85, pitch = 1.2 } = {}) {
    if (!('speechSynthesis' in window)) return;
    if (!this.voice) this.choose();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (this.voice) u.voice = this.voice;
    u.lang = 'en-US';
    u.rate = rate;
    u.pitch = pitch;
    speechSynthesis.speak(u);
  },
};
if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => Voice.choose();

/* ---------------- Visual effects ---------------- */
const fx = $('#fx');
function sparkle(x, y, n = 7) {
  for (let i = 0; i < n; i++) {
    const s = el('span', 'spark');
    const a = (Math.PI * 2 * i) / n + rand(-0.3, 0.3);
    const d = rand(50, 110);
    s.style.left = x - 9 + 'px';
    s.style.top = y - 9 + 'px';
    s.style.background = pick(RAINBOW);
    s.style.setProperty('--dx', Math.cos(a) * d + 'px');
    s.style.setProperty('--dy', Math.sin(a) * d + 'px');
    s.addEventListener('animationend', () => s.remove());
    fx.appendChild(s);
  }
}
function confetti(n = 60) {
  for (let i = 0; i < n; i++) {
    const c = el('span', 'confetti');
    c.style.left = rand(0, 100) + 'vw';
    c.style.background = pick(RAINBOW);
    c.style.animationDuration = rand(1.4, 2.6) + 's';
    c.style.animationDelay = rand(0, 0.4) + 's';
    c.addEventListener('animationend', () => c.remove());
    fx.appendChild(c);
  }
}

/* ---------------- Games ----------------
   Each game builds into `root` and returns an optional cleanup function. */

// Cooldown so a flurry of taps doesn't cut the voice off every time.
function cooldown(ms) {
  let last = 0;
  return () => {
    const now = Date.now();
    if (now - last < ms) return false;
    last = now;
    return true;
  };
}

const LETTERS = [
  ['A', 'apple', '🍎'], ['B', 'banana', '🍌'], ['C', 'cat', '🐱'], ['D', 'dog', '🐶'], ['E', 'elephant', '🐘'],
  ['F', 'fish', '🐟'], ['G', 'grapes', '🍇'], ['H', 'hat', '🎩'], ['I', 'ice cream', '🍦'], ['J', 'juice', '🧃'],
  ['K', 'kite', '🪁'], ['L', 'lion', '🦁'], ['M', 'moon', '🌙'], ['N', 'nest', '🪺'], ['O', 'orange', '🍊'],
  ['P', 'pig', '🐷'], ['Q', 'queen', '👸'], ['R', 'rainbow', '🌈'], ['S', 'sun', '☀️'], ['T', 'tree', '🌳'],
  ['U', 'umbrella', '☂️'], ['V', 'van', '🚐'], ['W', 'whale', '🐳'], ['X', 'fox', '🦊'], ['Y', 'yo-yo', '🪀'], ['Z', 'zebra', '🦓'],
];

function lettersGame(root) {
  root.className = 'game letters';
  let i = 0;
  const ready = cooldown(1300);
  function render() {
    const [L, word, emoji] = LETTERS[i];
    root.innerHTML = '';
    const col = el('div', 'center-col pop-in');
    const letter = el('div', 'big-letter', `${L}<small>${L.toLowerCase()}</small>`);
    letter.style.color = RAINBOW[i % RAINBOW.length];
    col.append(letter, el('div', 'big-emoji', emoji));
    root.appendChild(col);
    const phrase = L === 'X' ? 'X! Fox ends with X.' : `${L}! ${L} is for ${word}.`;
    Voice.say(phrase);
  }
  render();
  root.addEventListener('pointerdown', () => {
    if (!ready()) { Sound.boop(); return; }
    Sound.pop();
    i = (i + 1) % LETTERS.length;
    render();
  });
}

const COUNT_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const COUNT_EMOJI = ['🦆', '🍎', '⭐', '🐟', '🎈', '🐞', '🍓', '🚗', '🌸', '🐥'];

function numbersGame(root) {
  root.className = 'game numbers';
  let n = 1;
  let counted = 0;
  let timer;
  function render() {
    counted = 0;
    root.innerHTML = '';
    const numeral = el('div', 'numeral pop-in', String(n));
    const row = el('div', 'count-row');
    const emoji = COUNT_EMOJI[n - 1];
    for (let k = 0; k < n; k++) {
      const item = el('div', 'count-item pop-in', emoji);
      item.style.animationDelay = k * 0.06 + 's';
      item.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        sparkle(e.clientX, e.clientY);
        if (item.classList.contains('counted') || counted >= n) { Sound.boop(); return; }
        counted++;
        item.classList.add('counted');
        item.appendChild(el('span', 'badge', String(counted)));
        animate(item, 'bounce');
        Sound.pop();
        if (counted === n) {
          Voice.say(`${COUNT_WORDS[counted - 1]}! ${n === 1 ? 'One' : COUNT_WORDS[n - 1]} ${n === 1 ? '' : 'altogether'}! Yay!`);
          Sound.cheer();
          confetti();
          animate(numeral, 'bounce');
          timer = setTimeout(() => { n = n % 10 + 1; render(); }, 2600);
        } else {
          Voice.say(COUNT_WORDS[counted - 1], { rate: 1 });
        }
      });
      row.appendChild(item);
    }
    root.append(numeral, row);
    Voice.say(`${COUNT_WORDS[n - 1]}! Let's count.`);
  }
  root.addEventListener('pointerdown', () => Sound.boop());
  render();
  return () => clearTimeout(timer);
}

const COLORS = [
  ['red', '#ff3b3b'], ['orange', '#ff9214'], ['yellow', '#ffd60a'], ['green', '#2fd36b'],
  ['blue', '#2b8cff'], ['purple', '#9b5de5'], ['pink', '#ff6fb5'], ['brown', '#9c6644'],
];

function colorsGame(root) {
  root.className = 'game colors';
  function spawn() {
    if (root.querySelectorAll('.bubble:not(.popped)').length >= 9) return;
    const [name, hex] = pick(COLORS);
    const size = rand(150, 230);
    const b = el('div', 'bubble');
    b.style.width = b.style.height = size + 'px';
    b.style.background = hex;
    b.style.left = rand(0, window.innerWidth - size) + 'px';
    b.style.top = window.innerHeight + 'px';
    b.style.animationDuration = rand(11, 16) + 's';
    b.addEventListener('animationend', () => b.remove());
    b.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (b.classList.contains('popped')) return;
      b.style.setProperty('--t', getComputedStyle(b).transform);
      b.classList.add('popped');
      Sound.pop();
      sparkle(e.clientX, e.clientY, 10);
      Voice.say(`${name}!`, { rate: 0.9 });
      root.style.backgroundColor = hex;
      setTimeout(() => { root.style.backgroundColor = ''; }, 600);
    });
    root.appendChild(b);
  }
  for (let k = 0; k < 5; k++) setTimeout(spawn, k * 400);
  const iv = setInterval(spawn, 1300);
  root.addEventListener('pointerdown', () => Sound.boop());
  return () => clearInterval(iv);
}

function starPoints(cx, cy, outer, inner, n = 5) {
  const pts = [];
  for (let k = 0; k < n * 2; k++) {
    const r = k % 2 ? inner : outer;
    const a = -Math.PI / 2 + (Math.PI * k) / n;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}
const SHAPES = [
  ['circle', '<circle cx="100" cy="100" r="85"/>', 95],
  ['square', '<rect x="20" y="20" width="160" height="160" rx="10"/>', 95],
  ['triangle', '<polygon points="100,22 182,172 18,172" stroke-linejoin="round" stroke-width="18"/>', 125],
  ['star', `<polygon points="${starPoints(100, 106, 92, 40)}" stroke-linejoin="round" stroke-width="12"/>`, 105],
  ['heart', '<path d="M100 178 C 20 122, 2 66, 48 38 C 74 22, 94 36, 100 56 C 106 36, 126 22, 152 38 C 198 66, 180 122, 100 178 Z"/>', 90],
  ['diamond', '<polygon points="100,10 188,100 100,190 12,100" stroke-linejoin="round" stroke-width="12"/>', 95],
  ['oval', '<ellipse cx="100" cy="100" rx="92" ry="64"/>', 95],
  ['rectangle', '<rect x="8" y="45" width="184" height="110" rx="10"/>', 95],
];

function shapesGame(root) {
  root.className = 'game shapes';
  let i = 0;
  let color = 0;
  const ready = cooldown(1300);
  function render() {
    const [name, body, fy] = SHAPES[i];
    const hex = RAINBOW[color % RAINBOW.length];
    root.innerHTML = `
      <svg class="shape-svg pop-in" viewBox="0 0 200 200">
        <g fill="${hex}" stroke="${hex}">${body}</g>
        <g>
          <circle cx="80" cy="${fy}" r="13" fill="#fff"/><circle cx="120" cy="${fy}" r="13" fill="#fff"/>
          <circle cx="82" cy="${fy + 2}" r="6.5" fill="#222"/><circle cx="122" cy="${fy + 2}" r="6.5" fill="#222"/>
          <path d="M82 ${fy + 24} Q100 ${fy + 40} 118 ${fy + 24}" stroke="#222" stroke-width="5" fill="none" stroke-linecap="round"/>
        </g>
      </svg>`;
    Voice.say(`${name}!`);
  }
  render();
  root.addEventListener('pointerdown', () => {
    if (!ready()) { Sound.boop(); return; }
    const svg = $('svg', root);
    animate(svg, 'spin');
    Sound.chime();
    setTimeout(() => {
      i = (i + 1) % SHAPES.length;
      color += 3;
      render();
    }, 800);
  });
}

const ANIMALS = [
  ['🐮', 'cow', 'Moooo!'], ['🐶', 'dog', 'Woof woof!'], ['🐱', 'cat', 'Meow!'], ['🦆', 'duck', 'Quack quack!'],
  ['🐷', 'pig', 'Oink oink!'], ['🐑', 'sheep', 'Baaa!'], ['🦁', 'lion', 'Roar!'], ['🐴', 'horse', 'Neigh!'],
  ['🐸', 'frog', 'Ribbit!'], ['🦉', 'owl', 'Hoo hoo!'], ['🐔', 'chicken', 'Cluck cluck!'], ['🐵', 'monkey', 'Ooh ooh, ah ah!'],
];
const PASTELS = ['#ffd6e0', '#d6f5ff', '#e2ffd6', '#fff2c2', '#eadcff', '#ffe0c7'];

function animalsGame(root) {
  root.className = 'game animals';
  const grid = el('div', 'animal-grid');
  ANIMALS.forEach(([emoji, name, sound], k) => {
    const cell = el('div', 'animal', emoji);
    cell.style.background = PASTELS[k % PASTELS.length];
    cell.addEventListener('pointerdown', (e) => {
      sparkle(e.clientX, e.clientY);
      animate(cell, 'wiggle');
      Voice.say(`The ${name} says ${sound}`, { rate: 0.9, pitch: 1.3 });
    });
    grid.appendChild(cell);
  });
  root.appendChild(grid);
}

// Releases implicit touch capture so a finger can slide across keys or pads.
function playable(node, onHit) {
  node.addEventListener('pointerdown', (e) => {
    if (node.hasPointerCapture && node.hasPointerCapture(e.pointerId)) node.releasePointerCapture(e.pointerId);
    onHit(e);
  });
  node.addEventListener('pointerenter', (e) => { if (e.buttons) onHit(e); });
}

function pianoGame(root) {
  root.className = 'game piano';
  const notes = [261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88, 523.25];
  const faces = ['🐻', '🐰', '🐥', '🐸', '🐳', '🦋', '🦄', '⭐'];
  notes.forEach((f, k) => {
    const key = el('div', 'key', faces[k]);
    key.style.background = RAINBOW[k];
    playable(key, (e) => {
      Sound.piano(f);
      key.classList.add('down');
      setTimeout(() => key.classList.remove('down'), 150);
      const note = el('span', 'note-float', pick(['🎵', '🎶']));
      note.style.left = e.clientX - 28 + 'px';
      note.style.top = e.clientY - 60 + 'px';
      note.addEventListener('animationend', () => note.remove());
      fx.appendChild(note);
    });
    root.appendChild(key);
  });
}

function drumsGame(root) {
  root.className = 'game drums';
  const pads = [
    ['🥁', '#ff4d6d', () => Sound.kick()],
    ['🪘', '#ffb703', () => Sound.snare()],
    ['✨', '#3ddc84', () => Sound.hihat()],
    ['🐻', '#2ec4f1', () => Sound.tom()],
    ['💥', '#9b5de5', () => Sound.crash()],
    ['👏', '#ff7ac6', () => Sound.clap()],
  ];
  const grid = el('div', 'pad-grid');
  pads.forEach(([emoji, color, play]) => {
    const pad = el('div', 'pad', emoji);
    pad.style.background = color;
    playable(pad, (e) => {
      play();
      animate(pad, 'hit');
      sparkle(e.clientX, e.clientY, 9);
    });
    grid.appendChild(pad);
  });
  root.appendChild(grid);
}

const GAMES = [
  { id: 'letters', name: 'ABC', emoji: '🔤', color: '#ff5c8a', run: lettersGame },
  { id: 'numbers', name: '123', emoji: '🔢', color: '#ff9f1c', run: numbersGame },
  { id: 'colors', name: 'Colors', emoji: '🎨', color: '#2fb86b', run: colorsGame },
  { id: 'shapes', name: 'Shapes', emoji: '⭐', color: '#2b8cff', run: shapesGame },
  { id: 'animals', name: 'Animals', emoji: '🐮', color: '#9b5de5', run: animalsGame },
  { id: 'piano', name: 'Piano', emoji: '🎹', color: '#e04f5f', run: pianoGame },
  { id: 'drums', name: 'Drums', emoji: '🥁', color: '#f2a007', run: drumsGame },
];

/* ---------------- App shell ---------------- */
const stage = $('#stage');
const corner = $('#parent-corner');
let cleanup = null;

function clearStage(node) {
  if (cleanup) cleanup();
  cleanup = null;
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  fx.innerHTML = '';
  // Replace the node so old event listeners go away with it.
  const fresh = node.cloneNode(false);
  fresh.removeAttribute('class');
  fresh.removeAttribute('style');
  node.replaceWith(fresh);
  return fresh;
}

let current = stage;
function showHome() {
  current = clearStage(current);
  corner.hidden = true;
  const home = el('div', 'home');
  home.appendChild(el('h1', null, 'Play Time'));
  const tiles = el('div', 'tiles');
  GAMES.forEach((g) => {
    const t = el('button', 'tile', `<span class="emoji">${g.emoji}</span><span>${g.name}</span>`);
    t.style.background = g.color;
    t.addEventListener('click', () => startGame(g));
    tiles.appendChild(t);
  });
  home.appendChild(tiles);
  home.appendChild(el('p', 'hint', 'Grown-ups: during a game, hold the 🔒 in the top-left corner for 3 seconds to come back here.'));
  current.appendChild(home);
}

function startGame(g) {
  Sound.unlock();
  Sound.chime();
  current = clearStage(current);
  corner.hidden = false;
  const root = el('div', 'game');
  current.appendChild(root);
  cleanup = g.run(root) || null;
}

/* ---------------- Parent exit: hold corner 3s, then answer a sum ---------------- */
const gate = $('#gate');
let holdTimer = null;
let gateTimer = null;

function cancelHold() {
  clearTimeout(holdTimer);
  corner.classList.remove('holding');
}
corner.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  e.preventDefault();
  cancelHold();
  void corner.offsetWidth;
  corner.classList.add('holding');
  holdTimer = setTimeout(() => { cancelHold(); openGate(); }, 3000);
});
['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => corner.addEventListener(t, cancelHold));

function openGate() {
  const a = Math.floor(rand(3, 10));
  const b = Math.floor(rand(3, 10));
  const answer = a + b;
  const options = new Set([answer]);
  while (options.size < 4) options.add(answer + Math.floor(rand(-5, 6)) || answer + 7);
  $('.gate-question', gate).textContent = `${a} + ${b} = ?`;
  const box = $('.gate-answers', gate);
  box.innerHTML = '';
  shuffle([...options]).forEach((v) => {
    const btn = el('button', null, String(v));
    btn.addEventListener('click', () => { closeGate(); if (v === answer) showHome(); });
    box.appendChild(btn);
  });
  gate.hidden = false;
  clearTimeout(gateTimer);
  gateTimer = setTimeout(closeGate, 20000);
}
function closeGate() {
  clearTimeout(gateTimer);
  gate.hidden = true;
}
$('.gate-cancel', gate).addEventListener('click', closeGate);
gate.addEventListener('pointerdown', (e) => e.stopPropagation());

/* ---------------- Global touch handling ---------------- */
// Unlock audio on the very first touch (iOS needs a user gesture).
['touchstart', 'touchend', 'pointerdown', 'click'].forEach((t) =>
  document.addEventListener(t, () => Sound.unlock(), { capture: true, passive: true }));

// Every touch makes a little sparkle, so nothing feels "broken".
document.addEventListener('pointerdown', (e) => {
  if (!corner.hidden && gate.hidden && !e.target.closest('#parent-corner')) sparkle(e.clientX, e.clientY, 5);
}, { capture: true });

// Block zooming, scrolling, long-press menus and text selection.
['gesturestart', 'gesturechange', 'gestureend', 'contextmenu', 'dblclick', 'selectstart'].forEach((t) =>
  document.addEventListener(t, (e) => e.preventDefault()));
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

/* ---------------- Start ---------------- */
showHome();
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
