// Page backgrounds: each page gets its own faint engraved artwork behind the content:
// soft heat-tint glows, a guilloche rosette, a line drawing that fits the page, and a big halftone Bangla word.

const THEMES = {
  home:       { word: 'ইস্পাত', motif: 'strings', tint: ['#B8892F', '#2C4F9E'] },
  collections:{ word: 'সংগ্রহ', motif: 'guitar', tint: ['#6B3E73', '#B8892F'] },
  artist:     { word: 'শিল্পী', motif: 'mic', tint: ['#6B3E73', '#2C4F9E'] },
  card:       { word: 'কার্ড', motif: 'record', tint: ['#B8892F', '#6B3E73'] },
  night:      { word: 'রাত', motif: 'stage', tint: ['#2C4F9E', '#B8892F'] },
  market:     { word: 'বাজার', motif: 'waves', tint: ['#2C4F9E', '#6B3E73'] },
  collectors: { word: 'সংগ্রাহক', motif: 'stars', tint: ['#B8892F', '#2C4F9E'] },
  verify:     { word: 'যাচাই', motif: 'chip', tint: ['#2C4F9E', '#B8892F'] },
  guides:     { word: 'নিয়ম', motif: 'kantha', tint: ['#6B3E73', '#2C4F9E'] },
  partners:   { word: 'অংশীদার', motif: 'skyline', tint: ['#B8892F', '#6B3E73'] },
  how:        { word: 'কীভাবে', motif: 'rails', tint: ['#2C4F9E', '#B8892F'] },
  account:    { word: 'আমার', motif: 'fret', tint: ['#6B3E73', '#B8892F'] },
  concept:    { word: 'প্রতিষ্ঠা', motif: 'guitar', tint: ['#6B3E73', '#8a5a2b'] },
  other:      { word: 'পনেরো', motif: 'strings', tint: ['#2C4F9E', '#6B3E73'] },
};

export function themeFor(path) {
  if (path === '/') return 'home';
  const seg = path.split('/')[1];
  return ({ collections: 'collections', artists: 'artist', cards: 'card', night: 'night', market: 'market', collectors: 'collectors',
    verify: 'verify', guides: 'guides', policies: 'guides', partners: 'partners', 'how-it-works': 'how', account: 'account',
    dashboard: 'account', admin: 'account', signin: 'account', join: 'account', concept: 'concept' })[seg] || 'other';
}

function rosette(cx, cy, R, r, d, turns = 1) {
  // a spirograph (hypotrochoid), the classic guilloche figure on banknotes
  const pts = [];
  const steps = 1400;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2 * turns;
    const x = (R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t);
    const y = (R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t);
    pts.push(`${(cx + x).toFixed(1)},${(cy + y).toFixed(1)}`);
  }
  return `<polyline points="${pts.join(' ')}" />`;
}

const MOTIFS = {
  strings: () => Array.from({ length: 6 }, (_, i) => {
    const x = 120 + i * 60; let d = `M${x} 40`;
    for (let y = 40; y <= 760; y += 20) d += ` L${(x + Math.sin(y / 30 + i) * (4 + i * 2) * Math.sin((y - 40) / 720 * Math.PI)).toFixed(1)} ${y}`;
    return `<path d="${d}" stroke-width="${1 + i * 0.4}"/>`;
  }).join('') + '<rect x="90" y="10" width="360" height="30" rx="4"/><rect x="90" y="760" width="360" height="26" rx="4"/>',
  guitar: () => `<path d="M270 470 C190 470 165 540 195 590 C130 630 125 770 270 780 C415 770 410 630 345 590 C375 540 350 470 270 470 Z" stroke-width="2.5"/>
    <circle cx="270" cy="610" r="42"/><circle cx="270" cy="610" r="54" stroke-dasharray="3 6"/><rect x="232" y="720" width="76" height="14" rx="3"/>
    <rect x="252" y="140" width="36" height="335"/>${Array.from({ length: 14 }, (_, i) => `<line x1="252" y1="${165 + i * 22}" x2="288" y2="${165 + i * 22}" stroke-width="1"/>`).join('')}
    <path d="M250 140 L244 70 L296 70 L290 140 Z"/>${[85, 105, 125].map((y) => `<circle cx="228" cy="${y}" r="6"/><circle cx="312" cy="${y}" r="6"/>`).join('')}
    ${Array.from({ length: 6 }, (_, i) => `<line x1="${259 + i * 4.4}" y1="74" x2="${250 + i * 8}" y2="726" stroke-width=".7"/>`).join('')}`,
  mic: () => `<path d="M230 200 a40 55 0 0 1 80 0 v40 a40 55 0 0 1 -80 0 z" stroke-width="2.5"/>${Array.from({ length: 6 }, (_, i) => `<line x1="230" y1="${172 + i * 16}" x2="310" y2="${172 + i * 16}" stroke-width="1"/>`).join('')}
    <path d="M210 250 q0 90 60 90 q60 0 60 -90" stroke-width="2"/><line x1="270" y1="340" x2="270" y2="700" stroke-width="2.5"/><path d="M200 760 L270 700 L340 760"/>
    ${[0, 1, 2].map((i) => `<path d="M${120 + i * 150} 0 L${60 + i * 150} 800 L${220 + i * 150} 800 Z" stroke-dasharray="4 8" stroke-width="1"/>`).join('')}`,
  record: () => `${Array.from({ length: 22 }, (_, i) => `<circle cx="270" cy="400" r="${110 + i * 9}" stroke-width="${i % 4 === 0 ? 1.6 : .7}"/>`).join('')}
    <circle cx="270" cy="400" r="100" stroke-width="2.5"/><circle cx="270" cy="400" r="8"/><path d="M500 80 L460 330 L420 360" stroke-width="3"/><circle cx="500" cy="80" r="16"/>`,
  stage: () => `${[100, 270, 440].map((x) => `<path d="M${x} 0 L${x - 90} 640 L${x + 90} 640 Z" stroke-width="1" stroke-dasharray="5 7"/><path d="M${x - 24} 0 L${x + 24} 0 L${x + 14} 30 L${x - 14} 30 Z" stroke-width="2"/>`).join('')}
    <rect x="20" y="640" width="500" height="60" stroke-width="2.5"/><line x1="20" y1="660" x2="520" y2="660"/>${Array.from({ length: 16 }, (_, i) => `<path d="M${30 + i * 31} 780 q8 -24 16 0" stroke-width="1.5"/>`).join('')}`,
  waves: () => Array.from({ length: 16 }, (_, i) => {
    let d = ''; const y0 = 60 + i * 44, a = 14 + i * 2;
    for (let x = 0; x <= 540; x += 8) d += `${x === 0 ? 'M' : 'L'}${x} ${(y0 + a * Math.sin(x / 42 + i * .55)).toFixed(1)} `;
    return `<path d="${d}" stroke-width="${1 + (i % 3) * .6}"/>`;
  }).join(''),
  stars: () => Array.from({ length: 22 }, (_, i) => {
    const x = (i * 97) % 520 + 10, y = (i * 173) % 760 + 20, r = 8 + (i % 5) * 6;
    const p = Array.from({ length: 10 }, (_, k) => { const rr = k % 2 ? r * .42 : r; const a = -Math.PI / 2 + k * Math.PI / 5; return `${(x + rr * Math.cos(a)).toFixed(1)},${(y + rr * Math.sin(a)).toFixed(1)}`; }).join(' ');
    return `<polygon points="${p}" stroke-width="1.4"/>`;
  }).join(''),
  chip: () => `<rect x="170" y="300" width="200" height="160" rx="22" stroke-width="2.5"/><line x1="170" y1="353" x2="370" y2="353"/><line x1="170" y1="406" x2="370" y2="406"/><line x1="270" y1="300" x2="270" y2="460"/>
    ${Array.from({ length: 12 }, (_, i) => { const y = 120 + i * 50; const side = i % 2 ? 370 : 170; const x2 = i % 2 ? 520 : 20; return `<path d="M${side} ${Math.min(440, Math.max(320, y))} H${(side + x2) / 2} V${y} H${x2}" stroke-width="1.2"/><circle cx="${x2}" cy="${y}" r="5"/>`; }).join('')}
    ${[60, 90, 120].map((r) => `<path d="M${270 - r} 230 a${r} ${r} 0 0 1 ${r * 2} 0" stroke-width="1.6"/>`).join('')}`,
  kantha: () => Array.from({ length: 18 }, (_, i) => `<path d="M0 ${40 + i * 42} Q135 ${20 + i * 42} 270 ${40 + i * 42} T540 ${40 + i * 42}" stroke-dasharray="7 7" stroke-width="1.6"/>`).join('')
    + Array.from({ length: 12 }, (_, k) => `<ellipse cx="270" cy="250" rx="18" ry="70" transform="rotate(${k * 30} 270 400)" stroke-width="1.4"/>`).join(''),
  skyline: () => { let o = '', x = 0; const ws = [40, 30, 52, 36, 46, 28, 58, 34, 44, 38, 50, 32]; ws.forEach((w, i) => { const h = 160 + ((i * 97) % 300); o += `<rect x="${x}" y="${780 - h}" width="${w}" height="${h}" stroke-width="1.8"/>`; for (let y = 800 - h; y < 770; y += 18) o += `<line x1="${x + 6}" y1="${y}" x2="${x + w - 6}" y2="${y}" stroke-width=".8"/>`; x += w + 6; }); return o + '<line x1="0" y1="780" x2="540" y2="780" stroke-width="2"/>'; },
  rails: () => { let o = '<circle cx="270" cy="160" r="60" stroke-width="2"/><line x1="0" y1="200" x2="540" y2="200"/><line x1="90" y1="800" x2="262" y2="200" stroke-width="3"/><line x1="450" y1="800" x2="278" y2="200" stroke-width="3"/>'; let y = 790, g = 70; while (y > 215 && g > 4) { const t = (y - 200) / 600, h = 10 + 200 * t; o += `<line x1="${270 - h}" y1="${y.toFixed(1)}" x2="${270 + h}" y2="${y.toFixed(1)}" stroke-width="${(1 + 2 * t).toFixed(1)}"/>`; y -= g; g *= .84; } return o; },
  fret: () => `<path d="M200 0 L340 0 L380 800 L160 800 Z" stroke-width="2.5"/>${Array.from({ length: 13 }, (_, i) => { const y = 800 * (1 - .88 ** (i + 1)) / (1 - .88 ** 14); const t = y / 800; return `<line x1="${(200 - 40 * t).toFixed(1)}" y1="${y.toFixed(1)}" x2="${(340 + 40 * t).toFixed(1)}" y2="${y.toFixed(1)}" stroke-width="2"/>`; }).join('')}
    ${[[270, 150], [270, 300], [240, 420], [300, 420], [270, 620]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="12" stroke-width="2.5"/><circle cx="${x}" cy="${y}" r="24" stroke-dasharray="2 6"/>`).join('')}`,
};

export function renderBackground(el, path) {
  const key = themeFor(path);
  const t = THEMES[key];
  document.body.dataset.page = key;
  el.style.setProperty('--g1', t.tint[0]);
  el.style.setProperty('--g2', t.tint[1]);
  el.innerHTML = `
    <div class="bg-glow g1"></div><div class="bg-glow g2"></div>
    <svg class="bg-rosette" viewBox="0 0 800 800" fill="none" stroke="currentColor" stroke-width=".7">
      ${rosette(400, 400, 300, 61, 150)}${rosette(400, 400, 210, 37, 104)}
    </svg>
    <svg class="bg-motif" viewBox="0 0 540 800" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${MOTIFS[t.motif]()}</svg>
    <div class="bg-word">${t.word}</div>
    <div class="bg-stitch"></div>`;
}

export function mountBackgroundParallax(el) {
  let raf = 0;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const on = () => {
    if (raf || reduce) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const y = scrollY;
      el.style.setProperty('--py', `${(-y * 0.08).toFixed(1)}px`);
      el.style.setProperty('--rot', `${(y * 0.01).toFixed(2)}deg`);
    });
  };
  addEventListener('scroll', on, { passive: true });
  on();
}
