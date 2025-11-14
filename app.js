// app.js - minimal, robust, no libs
const AudioContextClass = window.AudioContext || window.webkitAudioContext;
const ctx = new AudioContextClass();
const master = ctx.createGain();
master.gain.value = 0.9;
master.connect(ctx.destination);

const volumeEl = document.getElementById('volume');
volumeEl.addEventListener('input', e => master.gain.value = Number(e.target.value));

const polyEl = document.getElementById('poly');
let maxVoices = Number(polyEl.value);
polyEl.addEventListener('change', e => maxVoices = Number(e.target.value));

const pads = Array.from(document.querySelectorAll('.pad'));
const keyToPad = {};
pads.forEach(p => {
  const k = p.dataset.key;
  keyToPad[k.toUpperCase()] = p;
});

const samples = {
  kick: 'samples/kick.wav',
  snare: 'samples/snare.wav',
  hihat: 'samples/hihat.wav',
  tom1: 'samples/tom1.wav',
  tom2: 'samples/tom2.wav',
  floor: 'samples/floor.wav',
  crash: 'samples/crash.wav',
  ride: 'samples/ride.wav',
  splash: 'samples/splash.wav',
  china: 'samples/china.wav',
  clap: 'samples/clap.wav',
  cowbell: 'samples/cowbell.wav'
};

const bufferCache = {};
async function loadBuffer(name) {
  if (bufferCache[name]) return bufferCache[name];
  const url = samples[name];
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('not found');
    const ab = await res.arrayBuffer();
    const buf = await ctx.decodeAudioData(ab);
    bufferCache[name] = buf;
    return buf;
  } catch (err) {
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
  const key = e.key.toUpperCase();
  const pad = keyToPad[key];
  if (!pad) return;
  if (ctx.state === 'suspended') ctx.resume();
  held.add(key);
  const vel = e.shiftKey ? 1.0 : e.ctrlKey ? 0.7 : 0.9;
  triggerPad(pad, vel);
  e.preventDefault();
});

window.addEventListener('keyup', e => {
  const key = e.key.toUpperCase();
  held.delete(key);
});

Object.keys(samples).forEach(k => loadBuffer(k));
document.addEventListener('click',()=> { if (ctx.state==='suspended') ctx.resume(); }, {once:true});
