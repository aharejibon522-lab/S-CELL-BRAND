// S/CELL motion effects. Each mount function returns a cleanup function.
// Living card (soft steel sheet), scroll marquee, scroll-revealed text, stacking cards, night spark field.

const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function loop(fn) {
  let id = 0, alive = true, last = performance.now();
  const tick = (t) => { if (!alive) return; const dt = Math.min(0.1, (t - last) / 1000); last = t; fn(dt, t); id = requestAnimationFrame(tick); };
  id = requestAnimationFrame(tick);
  return () => { alive = false; cancelAnimationFrame(id); };
}

function glProgram(gl, vs, fs) {
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}

// ---------------------------------------------------------------------------------------------
// LIVING CARD: a steel card on a soft sheet. Grab and pull anywhere: the steel stretches like
// molten metal and ripples back. The sheet never folds: physics runs at a fixed 1/240 s step and
// every frame each row and column is forced back into order with a minimum gap (untangle step).
// A light band follows the cursor, and the card leans toward it.
// ---------------------------------------------------------------------------------------------
export function mountLivingCard(wrap, src) {
  try { return livingCard(wrap, src); } catch (e) { console.warn('Living card off:', e.message); wrap.querySelector('.living-gl')?.remove(); wrap.classList.remove('living-on'); return () => {}; }
}
function livingCard(wrap, src) {
  const canvas = document.createElement('canvas');
  canvas.className = 'living-gl';
  canvas.setAttribute('aria-hidden', 'true');
  wrap.appendChild(canvas);
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, antialias: true, alpha: true });
  if (!gl) { canvas.remove(); return () => {}; }

  const COLS = 25, ROWS = 17, PAD = 0.32;                 // the canvas is larger than the card so it can stretch out
  const n = COLS * ROWS;
  const rest = new Float32Array(n * 2), pos = new Float32Array(n * 2), vel = new Float32Array(n * 2);
  const uv = new Float32Array(n * 2);
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
    const k = j * COLS + i, u = i / (COLS - 1), v = j / (ROWS - 1);
    rest[k * 2] = pos[k * 2] = u; rest[k * 2 + 1] = pos[k * 2 + 1] = v;
    uv[k * 2] = u; uv[k * 2 + 1] = v;
  }
  const idx = [];
  for (let j = 0; j < ROWS - 1; j++) for (let i = 0; i < COLS - 1; i++) {
    const a = j * COLS + i, b = a + 1, c = a + COLS, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const prog = glProgram(gl, `
    attribute vec2 aPos; attribute vec2 aUv; uniform float uPad; varying vec2 vUv; varying vec2 vP;
    void main(){ vUv=aUv; vP=aPos; vec2 p=(aPos*(1.0-2.0*uPad)+uPad); gl_Position=vec4(p.x*2.0-1.0, 1.0-p.y*2.0, 0.0, 1.0); }`, `
    precision mediump float; uniform sampler2D uTex; uniform vec2 uLight; uniform float uShine; varying vec2 vUv; varying vec2 vP;
    void main(){
      vec4 c=texture2D(uTex,vUv);
      float d=dot(vP-uLight, normalize(vec2(1.0,0.62)));
      float band=exp(-d*d*38.0)*0.32*uShine;
      float stretch=clamp(length(vP-vUv)*3.0,0.0,1.0);
      vec3 col=c.rgb+band*c.a+vec3(0.10,0.06,0.0)*stretch*c.a;
      gl_FragColor=vec4(col,c.a);
    }`);
  const bPos = gl.createBuffer(), bUv = gl.createBuffer(), bIdx = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, bUv); gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bIdx); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
  const tex = gl.createTexture();
  let ready = false;
  const img = new Image();
  img.onload = () => {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    ready = true; wrap.classList.add('living-on');
  };
  img.src = src;

  // pointer
  let grab = null; // { k: weights, px, py, sx, sy }
  let lx = 0.5, ly = 0.5, shine = 0, tiltX = 0, tiltY = 0, tx = 0, ty = 0, hover = false;
  const toLocal = (e) => {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width - PAD) / (1 - 2 * PAD), ((e.clientY - r.top) / r.height - PAD) / (1 - 2 * PAD)];
  };
  const RAD = 0.22, MAXPULL = 0.3;
  const onDown = (e) => {
    const [x, y] = toLocal(e);
    if (x < -0.05 || x > 1.05 || y < -0.05 || y > 1.05) return;
    const w = new Float32Array(n);
    for (let k = 0; k < n; k++) { const dx = pos[k * 2] - x, dy = (pos[k * 2 + 1] - y) * 0.63; w[k] = Math.exp(-(dx * dx + dy * dy) / (RAD * RAD)); }
    grab = { w, sx: x, sy: y, px: x, py: y, base: pos.slice() };
    wrap.classList.add('grabbing');
    canvas.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  };
  const onMove = (e) => {
    const [x, y] = toLocal(e);
    lx = x; ly = y; hover = x > -0.1 && x < 1.1 && y > -0.1 && y < 1.1;
    const r = wrap.getBoundingClientRect();
    tx = clamp((e.clientX - (r.left + r.width / 2)) / innerWidth, -0.5, 0.5) * 10;
    ty = clamp((e.clientY - (r.top + r.height / 2)) / innerHeight, -0.5, 0.5) * -8;
    if (grab) { grab.px = x; grab.py = y; }
  };
  const onUp = () => { if (grab) { grab = null; wrap.classList.remove('grabbing'); } };
  canvas.style.pointerEvents = 'auto';
  canvas.addEventListener('pointerdown', onDown);
  addEventListener('pointermove', onMove, { passive: true });
  addEventListener('pointerup', onUp);

  const STEP = 1 / 240, K = 520, NB = 160, DAMP = 9;
  let acc = 0;
  function physics() {
    for (let k = 0; k < n; k++) {
      const x = k * 2, y = x + 1;
      let fx = (rest[x] - pos[x]) * K, fy = (rest[y] - pos[y]) * K;
      const i = k % COLS, j = (k / COLS) | 0;
      // neighbour springs keep the sheet smooth
      const nb = [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]];
      for (const [a, b] of nb) {
        if (a < 0 || b < 0 || a >= COLS || b >= ROWS) continue;
        const m = b * COLS + a;
        fx += ((pos[m * 2] - rest[m * 2]) - (pos[x] - rest[x])) * NB;
        fy += ((pos[m * 2 + 1] - rest[m * 2 + 1]) - (pos[y] - rest[y])) * NB;
      }
      vel[x] += (fx - vel[x] * DAMP) * STEP; vel[y] += (fy - vel[y] * DAMP) * STEP;
    }
    if (grab) {
      let dx = grab.px - grab.sx, dy = grab.py - grab.sy;
      const len = Math.hypot(dx, dy);
      if (len > MAXPULL) { dx *= MAXPULL / len; dy *= MAXPULL / len; }
      for (let k = 0; k < n; k++) {
        const w = grab.w[k];
        if (w < 0.002) continue;
        const x = k * 2, y = x + 1;
        const gx = grab.base[x] + dx, gy = grab.base[y] + dy;
        pos[x] += (gx - pos[x]) * w * 0.25; pos[y] += (gy - pos[y]) * w * 0.25;
        vel[x] *= 1 - w * 0.5; vel[y] *= 1 - w * 0.5;
      }
    }
    for (let k = 0; k < n * 2; k++) pos[k] += vel[k] * STEP;
  }
  function untangle() {
    const gx = 0.25 / (COLS - 1), gy = 0.25 / (ROWS - 1);
    for (let j = 0; j < ROWS; j++) for (let i = 1; i < COLS; i++) {
      const k = j * COLS + i, p = k - 1;
      if (pos[k * 2] < pos[p * 2] + gx) { const mid = (pos[k * 2] + pos[p * 2]) / 2; pos[p * 2] = mid - gx / 2; pos[k * 2] = mid + gx / 2; }
    }
    for (let i = 0; i < COLS; i++) for (let j = 1; j < ROWS; j++) {
      const k = j * COLS + i, p = k - COLS;
      if (pos[k * 2 + 1] < pos[p * 2 + 1] + gy) { const mid = (pos[k * 2 + 1] + pos[p * 2 + 1]) / 2; pos[p * 2 + 1] = mid - gy / 2; pos[k * 2 + 1] = mid + gy / 2; }
    }
  }
  function resize() {
    const r = canvas.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.max(2, Math.round(r.width * dpr)); canvas.height = Math.max(2, Math.round(r.height * dpr));
  }
  resize();
  const ro = new ResizeObserver(resize); ro.observe(canvas);

  const stop = loop((dt) => {
    if (!wrap.isConnected) return;
    if (!reduce()) { acc += dt; let guard = 0; while (acc >= STEP && guard++ < 48) { physics(); acc -= STEP; } if (guard >= 48) acc = 0; untangle(); }
    shine += ((hover ? 1 : 0.35) - shine) * (1 - Math.exp(-6 * dt));
    tiltX += (tx - tiltX) * (1 - Math.exp(-6 * dt)); tiltY += (ty - tiltY) * (1 - Math.exp(-6 * dt));
    canvas.style.transform = `perspective(1100px) rotateY(${tiltX.toFixed(2)}deg) rotateX(${tiltY.toFixed(2)}deg)`;
    if (!ready) return;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, bPos); gl.bufferData(gl.ARRAY_BUFFER, pos, gl.DYNAMIC_DRAW);
    let loc = gl.getAttribLocation(prog, 'aPos'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, bUv);
    loc = gl.getAttribLocation(prog, 'aUv'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1f(gl.getUniformLocation(prog, 'uPad'), PAD);
    gl.uniform2f(gl.getUniformLocation(prog, 'uLight'), lx, ly);
    gl.uniform1f(gl.getUniformLocation(prog, 'uShine'), shine);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bIdx);
    gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
  });
  return () => { stop(); ro.disconnect(); removeEventListener('pointermove', onMove); removeEventListener('pointerup', onUp); };
}

// ---------------------------------------------------------------------------------------------
// SCROLL MARQUEE: two rows of cards that slide in opposite directions as the page scrolls.
// ---------------------------------------------------------------------------------------------
export function mountMarquee(section) {
  const rows = [...section.querySelectorAll('.mq-row')];
  let raf = 0;
  const update = () => {
    raf = 0;
    const top = section.getBoundingClientRect().top + scrollY;
    const off = (scrollY - top + innerHeight) * 0.3;
    if (rows[0]) rows[0].style.transform = `translate3d(${(off - 200 - rows[0].scrollWidth / 3).toFixed(1)}px,0,0)`;
    if (rows[1]) rows[1].style.transform = `translate3d(${(-(off - 200) - rows[1].scrollWidth / 3).toFixed(1)}px,0,0)`;
  };
  const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
  addEventListener('scroll', onScroll, { passive: true }); addEventListener('resize', onScroll);
  update();
  return () => { removeEventListener('scroll', onScroll); removeEventListener('resize', onScroll); };
}

// ---------------------------------------------------------------------------------------------
// SCROLL-REVEALED TEXT: each character goes from 20% to full opacity as the paragraph passes
// from 80% to 20% of the viewport height.
// ---------------------------------------------------------------------------------------------
export function mountRevealText(el) {
  const text = el.textContent;
  el.setAttribute('aria-label', text);
  el.innerHTML = [...text].map((ch) => `<span aria-hidden="true">${ch === ' ' ? ' ' : ch.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>`).join('');
  const spans = [...el.children];
  const L = spans.length;
  let raf = 0;
  const update = () => {
    raf = 0;
    const r = el.getBoundingClientRect(), vh = innerHeight;
    const start = vh * 0.8, end = vh * 0.2;            // ['start 0.8', 'end 0.2']
    const p = reduce() ? 1 : clamp((start - r.top) / (start - end + r.height), 0, 1);
    for (let i = 0; i < L; i++) spans[i].style.opacity = (0.2 + 0.8 * clamp(p * L - i, 0, 1)).toFixed(3);
  };
  const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
  addEventListener('scroll', onScroll, { passive: true });
  update();
  return () => removeEventListener('scroll', onScroll);
}

// ---------------------------------------------------------------------------------------------
// STACKING CARDS: sticky panels that scale down as the next one slides over them.
// ---------------------------------------------------------------------------------------------
export function mountStack(section) {
  const items = [...section.querySelectorAll('.stack-item')];
  const total = items.length;
  let raf = 0;
  const update = () => {
    raf = 0;
    const r = section.getBoundingClientRect();
    const p = clamp(-r.top / Math.max(1, r.height - innerHeight), 0, 1);
    items.forEach((it, i) => {
      const target = 1 - (total - 1 - i) * 0.03;
      const range = [i / total, 1];
      const t = clamp((p - range[0]) / (range[1] - range[0]), 0, 1);
      const sc = reduce() ? 1 : 1 + (target - 1) * t;
      it.querySelector('.stack-card').style.transform = `scale(${sc.toFixed(4)})`;
    });
  };
  const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
  addEventListener('scroll', onScroll, { passive: true });
  update();
  return () => removeEventListener('scroll', onScroll);
}

// ---------------------------------------------------------------------------------------------
// FADE IN on first view.
// ---------------------------------------------------------------------------------------------
export function mountFadeIns(root) {
  const els = [...root.querySelectorAll('[data-fade]')];
  if (reduce() || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return () => {}; }
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
  }, { rootMargin: '50px', threshold: 0 });
  els.forEach((e) => io.observe(e));
  return () => io.disconnect();
}

// ---------------------------------------------------------------------------------------------
// NIGHT SPARK FIELD: thousands of glowing steel sparks over a dark valley. They grow as the camera
// flies toward them, the cursor pushes them aside and makes the nearest ones glow, and hovering the
// call to action slows the flight and lifts the sparks into the air. Ambient sound is synthesised
// in the browser (no audio files) and starts muted.
// ---------------------------------------------------------------------------------------------
export function mountSparkField(section) {
  try { return sparkField(section); } catch (e) { console.warn('Spark field off:', e.message); section.classList.add('nf-static'); return () => {}; }
}
function sparkField(section) {
  const canvas = section.querySelector('.nf-canvas');
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false });
  if (!gl) { section.classList.add('nf-static'); return () => {}; }
  const N = innerWidth < 768 ? 9000 : 18000, DEPTH = 120;
  const data = new Float32Array(N * 5);
  let s = 1234567;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const height = (x, z) => Math.sin(x * 0.18) * 1.4 + Math.sin(z * 0.11 + x * 0.05) * 2.2 + Math.sin(x * 0.04 - z * 0.07) * 3.0;
  for (let i = 0; i < N; i++) {
    const x = (rnd() - 0.5) * 70, z = rnd() * DEPTH;
    const leaf = rnd() < 0.35;
    data[i * 5] = x; data[i * 5 + 1] = height(x, z) - 4 + (leaf ? rnd() * 0.6 : rnd() * 1.8); data[i * 5 + 2] = z;
    data[i * 5 + 3] = rnd();                    // seed: colour and twinkle
    data[i * 5 + 4] = leaf ? 0 : 1;             // 1 = spark flower, 0 = small ember
  }
  const prog = glProgram(gl, `
    attribute vec3 aP; attribute float aS; attribute float aK;
    uniform float uZ; uniform float uDepth; uniform float uTime; uniform vec2 uMouse; uniform float uAspect; uniform float uLift; uniform float uH;
    varying float vGlow; varying float vFog; varying float vSeed; varying float vK;
    void main(){
      vec3 p=aP; p.z=mod(p.z-uZ, uDepth); float z=-(p.z+1.5);
      p.y+=uLift*(0.8+aS*2.5)*(1.0-p.z/uDepth)+sin(uTime*0.6+aS*40.0)*uLift*0.4;
      p.x+=uLift*sin(aS*90.0)*1.5;
      vec4 c=vec4(p.x, p.y-1.2, z, 1.0);
      float f=1.6; vec4 clip=vec4(c.x*f/uAspect, c.y*f, (c.z*-1.0)*0.02, -c.z);
      vec2 ndc=clip.xy/clip.w; vec2 d=ndc-uMouse; d.x*=uAspect; float r=length(d);
      float push=exp(-r*r*14.0)*0.16; ndc+=normalize(d+1e-5)*push*vec2(1.0/uAspect,1.0);
      clip.xy=ndc*clip.w;
      gl_Position=clip;
      float near=1.0-clamp(p.z/uDepth,0.0,1.0);
      float bloom=aK>0.5 ? smoothstep(0.15,0.9,near) : 0.4+0.3*near;
      gl_PointSize=(aK>0.5 ? 1.0+5.5*bloom : 1.2+1.6*near)*uH/900.0*(1.0+0.6*exp(-r*r*10.0));
      vGlow=exp(-r*r*18.0); vFog=near; vSeed=aS; vK=aK;
    }`, `
    precision highp float; uniform float uTime; varying float vGlow; varying float vFog; varying float vSeed; varying float vK;
    void main(){
      vec2 q=gl_PointCoord-0.5; float d=length(q); if(d>0.5) discard;
      float core=smoothstep(0.5,0.0,d); float petal=vK>0.5 ? 0.6+0.4*cos(atan(q.y,q.x)*5.0+vSeed*6.0) : 1.0;
      vec3 straw=vec3(0.93,0.78,0.45), bronze=vec3(0.86,0.52,0.28), blue=vec3(0.45,0.62,1.0), violet=vec3(0.66,0.45,0.85);
      vec3 col=vSeed<0.45?straw:vSeed<0.7?bronze:vSeed<0.88?blue:violet;
      float tw=0.75+0.25*sin(uTime*2.0+vSeed*50.0);
      float a=core*petal*tw*(0.15+0.85*vFog*vFog)+vGlow*core*0.9;
      gl_FragColor=vec4(col*a+vec3(1.0,0.95,0.85)*vGlow*core*0.6, 1.0);
    }`);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  const L = (n) => gl.getUniformLocation(prog, n);
  const U = { z: L('uZ'), depth: L('uDepth'), time: L('uTime'), mouse: L('uMouse'), aspect: L('uAspect'), lift: L('uLift'), h: L('uH') };

  let visible = false, z = 0, speed = 1.2, lift = 0, hold = false, mx = 0, my = 0, smx = 0, smy = 0, t0 = performance.now();
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0 });
  io.observe(section);
  const onMove = (e) => {
    const r = canvas.getBoundingClientRect();
    mx = ((e.clientX - r.left) / r.width) * 2 - 1; my = -(((e.clientY - r.top) / r.height) * 2 - 1);
  };
  section.addEventListener('pointermove', onMove);
  let lastScroll = scrollY;
  const onScroll = () => { const d = scrollY - lastScroll; lastScroll = scrollY; if (visible) z += Math.max(0, d) * 0.03; };
  addEventListener('scroll', onScroll, { passive: true });

  function resize() {
    const r = canvas.getBoundingClientRect(), dpr = Math.min(1.5, devicePixelRatio || 1);
    canvas.width = Math.max(2, Math.round(r.width * dpr)); canvas.height = Math.max(2, Math.round(r.height * dpr));
  }
  resize();
  const ro = new ResizeObserver(resize); ro.observe(canvas);

  // ----- synthesised ambient sound -----
  let ac = null, master = null, lp = null, muted = true;
  function initAudio() {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = 0;
    lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400; lp.Q.value = 0.4;
    lp.connect(master); master.connect(ac.destination);
    for (const [f, type, g] of [[55, 'sine', 0.22], [82.4, 'sine', 0.14], [110.3, 'triangle', 0.06], [164.8, 'sine', 0.04]]) {
      const o = ac.createOscillator(); o.type = type; o.frequency.value = f;
      const lfo = ac.createOscillator(); lfo.frequency.value = 0.05 + Math.random() * 0.08;
      const lg = ac.createGain(); lg.gain.value = 0.6;
      const og = ac.createGain(); og.gain.value = g;
      lfo.connect(lg); lg.connect(o.detune); o.connect(og); og.connect(lp); o.start(); lfo.start();
    }
    const nb = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), ch = nb.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * 0.5;
    const ns = ac.createBufferSource(); ns.buffer = nb; ns.loop = true;
    const nf = ac.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 900; nf.Q.value = 0.7;
    const ng = ac.createGain(); ng.gain.value = 0.025;
    ns.connect(nf); nf.connect(ng); ng.connect(lp); ns.start();
  }
  const soundBtn = section.querySelector('.nf-sound');
  const toggle = () => {
    if (!ac) initAudio();
    ac.resume();
    muted = !muted;
    master.gain.cancelScheduledValues(ac.currentTime);
    master.gain.setTargetAtTime(muted ? 0 : 0.5, ac.currentTime, 0.6);
    soundBtn.setAttribute('aria-pressed', String(!muted));
  };
  soundBtn?.addEventListener('click', toggle);
  const go = section.querySelector('.nf-go');
  const enter = () => { hold = true; section.classList.add('nf-hold'); if (lp) lp.frequency.setTargetAtTime(380, ac.currentTime, 0.4); };
  const leave = () => { hold = false; section.classList.remove('nf-hold'); if (lp) lp.frequency.setTargetAtTime(2400, ac.currentTime, 0.4); };
  go?.addEventListener('pointerenter', enter); go?.addEventListener('pointerleave', leave);
  go?.addEventListener('focus', enter); go?.addEventListener('blur', leave);

  const stop = loop((dt, t) => {
    if (!visible || !section.isConnected) return;
    const still = reduce();
    speed += ((hold ? 0 : 1.2) - speed) * (1 - Math.exp(-2.2 * dt));
    lift += ((hold ? 1 : 0) - lift) * (1 - Math.exp(-1.6 * dt));
    if (!still) z += speed * dt;
    smx += (mx - smx) * (1 - Math.exp(-8 * dt)); smy += (my - smy) * (1 - Math.exp(-8 * dt));
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.03, 0.035, 0.05, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    const st = 20;
    let a = gl.getAttribLocation(prog, 'aP'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 3, gl.FLOAT, false, st, 0);
    a = gl.getAttribLocation(prog, 'aS'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 1, gl.FLOAT, false, st, 12);
    a = gl.getAttribLocation(prog, 'aK'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 1, gl.FLOAT, false, st, 16);
    gl.uniform1f(U.z, z); gl.uniform1f(U.depth, DEPTH); gl.uniform1f(U.time, (t - t0) / 1000);
    gl.uniform2f(U.mouse, smx, smy); gl.uniform1f(U.aspect, canvas.width / canvas.height);
    gl.uniform1f(U.lift, lift); gl.uniform1f(U.h, canvas.height);
    gl.drawArrays(gl.POINTS, 0, N);
    section.style.setProperty('--vig', (0.55 + Math.min(0.25, speed * 0.12)).toFixed(3));
  });
  return () => {
    stop(); io.disconnect(); ro.disconnect();
    removeEventListener('scroll', onScroll);
    if (ac) { try { ac.close(); } catch {} }
  };
}
