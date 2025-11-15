// app.js - minimal, robust, no libs
const AudioContextClass = window.AudioContext || window.webkitAudioContext;
const ctx = new AudioContextClass();
const master = ctx.createGain();
master.gain.value = 0.9;
master.connect(ctx.destination);

// Background track (looping backing music)
const bgGain = ctx.createGain();
bgGain.gain.value = 0.35; // default BG volume
bgGain.connect(master);

let bgBuffer = null;
let bgSource = null;
let bgUrl = 'samples/backing_loop_1.mp3'; // default file path (add this file)
window.bgState = 'stopped';

async function loadBG(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('bg fetch failed');
    const ab = await res.arrayBuffer();
    bgBuffer = await ctx.decodeAudioData(ab);
    return true;
  } catch (e) {
    console.warn('BG load failed', e);
    bgBuffer = null;
    return false;
  }
}

function playBG() {
  if (!bgBuffer) { console.warn('no bg buffer'); return; }
  stopBG();
  bgSource = ctx.createBufferSource();
  bgSource.buffer = bgBuffer;
  bgSource.loop = true;
  bgSource.connect(bgGain);
  bgSource.start();
  window.bgState = 'playing';
}

function stopBG() {
  if (bgSource) {
    try { bgSource.stop(); } catch(e){}
    bgSource.disconnect();
    bgSource = null;
  }
  window.bgState = 'stopped';
}


const volumeEl = document.getElementById('volume');
volumeEl.addEventListener('input', e => master.gain.value = Number(e.target.value));

const polyEl = document.getElementById('poly');
let maxVoices = Number(polyEl.value);
polyEl.addEventListener('change', e => maxVoices = Number(e.target.value));

const pads = Array.from(document.querySelectorAll('.pad'));
const keyToPad = {};
// build mapping: map visible keys (letters uppercased), literal punctuation, and common code names
pads.forEach(p => {
  const k = p.dataset.key; // what you put in HTML (e.g., "O" or "," or " ")
  if (!k) return;

  // map single-character visible keys (letters -> uppercase)
  if (k.length === 1 && /^[a-z0-9]$/i.test(k)) {
    keyToPad[k.toUpperCase()] = p;    // Key like 'O' -> 'O'
  } else {
    // punctuation or space: map literal as-is
    keyToPad[k] = p;                  // Key like ',' or ' ' stays ','
  }

  // map physical code names for letters, e.g. KeyO, KeyM, KeyQ
  if (/^[A-Z]$/.test(k.toUpperCase())) {
    keyToPad['Key' + k.toUpperCase()] = p;
  }

  // map common code names for punctuation
  if (k === ',') keyToPad['Comma'] = p;
  if (k === '.') keyToPad['Period'] = p;
  if (k === ' ') keyToPad['Space'] = p;
  if (k === ';') keyToPad['Semicolon'] = p;
  if (k === '/') keyToPad['Slash'] = p;

  // respect an explicit data-code attribute if present
  if (p.dataset.code) keyToPad[p.dataset.code] = p;
});
const samples = {
  kick:       'samples/kick.wav',
  snare:      'samples/snare.wav',
  hihat:      'samples/hihat.wav',       // closed hi-hat
  hihat_open: 'samples/hihat_open.wav',  // open hi-hat
  tom1:       'samples/tom1.wav',
  tom2:       'samples/tom2.wav',
  floor:      'samples/floor.wav',
  crash:      'samples/crash.wav',
  crash2:     'samples/crash2.wav',
  ride:       'samples/ride.wav',
  splash:     'samples/splash.wav',
  china:      'samples/china.wav',
  clap:       'samples/clap.wav',
  cowbell:    'samples/cowbell.wav',
  ghost:      'samples/ghost.wav',
  perc:       'samples/perc.wav',
  rim:        'samples/rim.wav'
};

// expose for debugging in DevTools
window.samples = samples;


// in-memory decoded buffers (may be replaced by uploads)
const bufferCache = {};
async function loadBuffer(name) {
  // if we've decoded a custom buffer, return it
  if (bufferCache[name]) return bufferCache[name];
  // otherwise try to fetch default path (repo)
  const url = samples[name];
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('not found');
    const ab = await res.arrayBuffer();
    const buf = await ctx.decodeAudioData(ab);
    bufferCache[name] = buf;
    return buf;
  } catch (err) {
    // fallback null -> synth fallback
    console.warn('Sample load failed for', name, err);
    return null;
  }
}

async function playSample(name, velocity = 1) {
  const buf = await loadBuffer(name);
  if (buf) {
    if (activeNodes.length >= maxVoices) {
      const node = activeNodes.shift();
      try { node.source.stop(); } catch(e){}
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = Math.max(0.0001, velocity);
    src.connect(g);
    g.connect(master);
    src.start();
    const node = { source: src, gain: g };
    activeNodes.push(node);
    src.onended = () => {
      const i = activeNodes.indexOf(node);
      if (i >= 0) activeNodes.splice(i, 1);
    };
    return node;
  } else {
    // synth fallback
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 80 + Math.random()*200;
    g.gain.value = 0.2 * velocity;
    osc.connect(g);
    g.connect(master);
    osc.start();
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.stop(ctx.currentTime + 0.18);
    return { source: { stop: () => {} }, gain: g };
  }
}

let activeNodes = [];

function triggerPad(padEl, velocity=1) {
  padEl.classList.add('active');
  setTimeout(()=> padEl.classList.remove('active'), 100);
  const sound = padEl.dataset.sound;
  playSample(sound, velocity);
}

pads.forEach(p => {
  p.addEventListener('mousedown', e => {
    if (ctx.state === 'suspended') ctx.resume();
    triggerPad(p, 1);
  });
});

const held = new Set();
window.addEventListener('keydown', e => {
  if (e.repeat) return;
  // prefer visible single-character (letters normalized to uppercase), else use e.key as-is
  const visible = (typeof e.key === 'string' && e.key.length === 1) ? e.key.toUpperCase() : e.key;
  const pad = keyToPad[visible] || keyToPad[e.code] || keyToPad[e.key];
  if (!pad) return;
  if (ctx.state === 'suspended') ctx.resume();
  const vel = e.shiftKey ? 1.0 : e.ctrlKey ? 0.7 : 0.9;
  triggerPad(pad, vel);
  e.preventDefault();
});

window.addEventListener('keyup', e => {
  const key = e.key.toUpperCase();
  held.delete(key);
});

// prefetch default buffers (non-blocking)
Object.keys(samples).forEach(k => loadBuffer(k));

// simple unlock for mobile and browsers
document.addEventListener('click',()=> { if (ctx.state==='suspended') ctx.resume(); }, {once:true});

/* ----------------------
   Sample uploader code
   ---------------------- */
const expectedNames = Object.keys(samples).map(s => s + '.wav'); // accept .wav default
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const uploadStatus = document.getElementById('uploadStatus');
const resetBtn = document.getElementById('resetSamples');

function setStatus(msg, isError=false) {
  uploadStatus.textContent = msg;
  uploadStatus.style.color = isError ? 'salmon' : 'lightgreen';
}

dropzone.addEventListener('click', ()=> fileInput.click());
dropzone.addEventListener('dragover', (ev)=> { ev.preventDefault(); dropzone.classList.add('dragover'); });
dropzone.addEventListener('dragleave', ()=> dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', (ev)=> {
  ev.preventDefault();
  dropzone.classList.remove('dragover');
  handleFiles(ev.dataTransfer.files);
});

fileInput.addEventListener('change', (ev)=> {
  handleFiles(ev.target.files);
  fileInput.value = '';
});

async function handleFiles(fileList) {
  if (!fileList || !fileList.length) return;
  setStatus('Decoding files...');
  let accepted = 0, rejected = 0;
  for (const f of Array.from(fileList)) {
    const lower = f.name.toLowerCase();
    // try to map by exact filename (kick.wav etc.) or by prefix (kick.mp3 -> kick)
    let matchedKey = null;
    for (const k of Object.keys(samples)) {
      if (lower === k + '.wav' || lower === k + '.mp3' || lower === k) { matchedKey = k; break; }
      // also allow filenames like 'kick-01.wav'
      if (lower.startsWith(k + '-') || lower.startsWith(k + '_')) { matchedKey = k; break; }
    }
    if (!matchedKey) {
      console.warn('Unrecognized sample name; skipping', f.name);
      rejected++;
      continue;
    }
    try {
      const ab = await f.arrayBuffer();
      const buf = await ctx.decodeAudioData(ab);
      bufferCache[matchedKey] = buf;      // override decoded buffer in memory
      accepted++;
    } catch (err) {
      console.error('Decode failed for', f.name, err);
      rejected++;
    }
  }
  if (accepted) {
    setStatus(`Loaded ${accepted} file(s). Play keys to test.`);
  } else {
    setStatus(`No valid file names found. See expected list above.`, true);
  }
}

// reset to default repo-hosted samples (clears bufferCache for keys so loadBuffer will fetch)
resetBtn.addEventListener('click', ()=> {
  Object.keys(bufferCache).forEach(k => delete bufferCache[k]);
  setStatus('Reset to repo defaults. Re-fetching samples...');
  Object.keys(samples).forEach(k => loadBuffer(k));
});

/* end uploader */

// BG UI hookups
const bgPlayBtn = document.getElementById('bgPlay');
const bgStopBtn = document.getElementById('bgStop');
const bgVolEl = document.getElementById('bgVol');
const bgSelect = document.getElementById('bgLoopSelect');

bgVolEl.addEventListener('input', e => bgGain.gain.value = Number(e.target.value));
bgPlayBtn.addEventListener('click', async () => {
  if (ctx.state === 'suspended') await ctx.resume();
  const url = bgSelect.value;
  if (url !== bgUrl || !bgBuffer) {
    bgUrl = url;
    await loadBG(bgUrl);
  }
  playBG();
});
bgStopBtn.addEventListener('click', () => stopBG());

bgSelect.addEventListener('change', async (e) => {
  bgUrl = e.target.value;
  await loadBG(bgUrl);
});

