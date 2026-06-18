import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './styles.css';

const app = document.querySelector('#app');

app.innerHTML = `
  <main class="game-shell">
    <section class="viewport-wrap">
      <div id="viewport"></div>
      <div class="hud">
        <div>
          <strong>Hex Match On Saddle Surface</strong>
          <span>2D hex system + CanvasTexture + saddle UV</span>
        </div>
        <div id="toast">鞍の曲面に貼られたヘックスをクリック</div>
      </div>
    </section>
    <aside class="panel">
      <header>
        <h1>Hex Saddle Match</h1>
        <span>2.5D TEST</span>
      </header>
      <div class="stats">
        <div><span>Score</span><strong id="score">0</strong></div>
        <div><span>Moves</span><strong id="moves">0</strong></div>
        <div><span>Match</span><strong id="match">0</strong></div>
      </div>
      <section>
        <h2>Prototype</h2>
        <div class="mode-grid">
          <button class="proto active" data-proto="match">Match</button>
          <button class="proto" data-proto="lineclear">Line</button>
          <button class="proto" data-proto="pipe">Pipe</button>
          <button class="proto" data-proto="paint">Paint</button>
          <button class="proto" data-proto="path">Path</button>
          <button class="proto" data-proto="sweeper">Sweeper</button>
        </div>
        <div class="rule-card" id="proto-card"></div>
      </section>
      <section>
        <h2>Rule</h2>
        <div class="button-grid">
          <button class="rule active" data-rule="line">Line 3</button>
          <button class="rule" data-rule="cluster">Cluster 3</button>
        </div>
        <div class="rule-card" id="rule-card"></div>
      </section>
      <section>
        <h2>Colors</h2>
        <div class="button-grid color-grid">
          <button class="colors" data-count="6">6</button>
          <button class="colors active" data-count="7">7</button>
          <button class="colors" data-count="8">8</button>
          <button class="colors" data-count="9">9</button>
        </div>
        <div class="rule-card" id="difficulty-card"></div>
      </section>
      <section>
        <h2>Surface</h2>
        <div class="button-grid">
          <button id="toggle-grid" class="active">UV Grid</button>
          <button id="toggle-bumps" class="active">Bumps</button>
        </div>
      </section>
      <section>
        <h2>3D View</h2>
        <div class="slider-stack">
          <label>Rotate <input id="view-yaw" type="range" min="-90" max="90" value="2"></label>
          <label>Tilt <input id="view-pitch" type="range" min="5" max="55" value="23"></label>
          <label>Zoom <input id="view-zoom" type="range" min="4" max="10" step="0.1" value="7.5"></label>
        </div>
        <button id="reset-view">Reset View</button>
      </section>
      <section>
        <h2>Play</h2>
        <div class="stack">
          <button id="hint" class="primary">Hint</button>
          <button id="shuffle">Shuffle</button>
          <button id="reset">Reset</button>
        </div>
      </section>
      <section>
        <h2>Pieces</h2>
        <div class="legend" id="legend"></div>
      </section>
      <p class="note">ヘックスの概念が崩れない程度の緩い凸凹サドル面に、2Dヘックス盤面をテクスチャとして貼っています。ゲーム判定は2Dのまま、クリックだけUVからセルへ戻します。</p>
    </aside>
  </main>
`;

const viewport = document.querySelector('#viewport');
const scoreEl = document.querySelector('#score');
const movesEl = document.querySelector('#moves');
const matchEl = document.querySelector('#match');
const toastEl = document.querySelector('#toast');
const legendEl = document.querySelector('#legend');
const protoCardEl = document.querySelector('#proto-card');
const ruleCardEl = document.querySelector('#rule-card');
const difficultyCardEl = document.querySelector('#difficulty-card');
const yawEl = document.querySelector('#view-yaw');
const pitchEl = document.querySelector('#view-pitch');
const zoomEl = document.querySelector('#view-zoom');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0xede8de, 1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
viewport.append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xede8de);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
camera.position.set(0.25, 3.05, 6.9);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0.1, 0);
controls.minDistance = 4.0;
controls.maxDistance = 10;
controls.maxPolarAngle = Math.PI * 0.78;
let syncingViewInputs = false;
controls.addEventListener('change', syncViewInputsFromCamera);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const clock = new THREE.Clock();

const textureCanvas = document.createElement('canvas');
textureCanvas.width = 1200;
textureCanvas.height = 820;
textureCanvas.logicalWidth = 1200;
textureCanvas.logicalHeight = 820;
const tx = textureCanvas.getContext('2d');
const boardTexture = new THREE.CanvasTexture(textureCanvas);
boardTexture.colorSpace = THREE.SRGBColorSpace;
boardTexture.anisotropy = 8;

const cols = 9;
const rows = 8;
const radius = 43;
const sqrt3 = Math.sqrt(3);
const dirs = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];
const axes = [[dirs[0], dirs[3]], [dirs[1], dirs[4]], [dirs[2], dirs[5]]];
const pieces = [
  { name: '花', color: '#f35f80', ink: '#4d1020' },
  { name: '葉', color: '#69cfa5', ink: '#103828' },
  { name: '星', color: '#f3b24e', ink: '#4b2b08' },
  { name: '雫', color: '#7fa9ff', ink: '#11265a' },
  { name: '月', color: '#f8f1e6', ink: '#3d342c' },
  { name: '石', color: '#9f8ee8', ink: '#251b56' },
  { name: '火', color: '#ff7c54', ink: '#4b1609' },
  { name: '泡', color: '#73d7e8', ink: '#123840' },
  { name: '羽', color: '#c9dc6d', ink: '#30380d' },
];

let board = [];
let selected = null;
let hover = null;
let hoverPreview = new Set();
let lineSegments = [];
let matchPreview = new Set();
let animationItems = [];
let animationRequest = null;
let score = 0;
let moves = 0;
let rule = 'line';
let colorCount = 7;
let clearing = false;
let showGrid = true;
let showBumps = true;
let proto = 'match';
let alt = {};
const saddleBaseY = 0.16;
const horseBackBaseY = -1.02;
const horseBackBaseScale = new THREE.Vector3(3.5, 0.48, 1.18);

const saddle = new THREE.Mesh(createSaddleGeometry(), new THREE.MeshToonMaterial({
  color: 0xffffff,
  map: boardTexture,
}));
saddle.name = 'saddle-play-surface';
saddle.position.y = saddleBaseY;
saddle.castShadow = true;
saddle.receiveShadow = true;
scene.add(saddle);

const saddleWire = new THREE.LineSegments(
  new THREE.WireframeGeometry(saddle.geometry),
  new THREE.LineBasicMaterial({ color: 0x1b1b18, transparent: true, opacity: 0.16 })
);
saddle.add(saddleWire);

const horseBack = new THREE.Mesh(
  new THREE.SphereGeometry(1, 64, 24),
  new THREE.MeshToonMaterial({ color: 0x8d6448 })
);
horseBack.scale.copy(horseBackBaseScale);
horseBack.position.y = horseBackBaseY;
horseBack.castShadow = true;
horseBack.receiveShadow = true;
scene.add(horseBack);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(5.4, 80),
  new THREE.MeshToonMaterial({ color: 0xd8d0c4 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -1.48;
floor.receiveShadow = true;
scene.add(floor);

scene.add(new THREE.HemisphereLight(0xffffff, 0xb5a08d, 2.2));
const key = new THREE.DirectionalLight(0xffffff, 2.6);
key.position.set(-3.4, 5.2, 3.8);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
scene.add(key);
const rim = new THREE.DirectionalLight(0xaed8ff, 0.7);
rim.position.set(3, 2, -4);
scene.add(rim);

function createSaddleGeometry() {
  const segU = 96;
  const segV = 64;
  const verts = [];
  const uvs = [];
  const indices = [];
  for (let j = 0; j <= segV; j++) {
    const v = j / segV;
    for (let i = 0; i <= segU; i++) {
      const u = i / segU;
      const x = (u - 0.5) * 5.8;
      const z = (v - 0.5) * 3.55;
      const crown = 0.32 * Math.cos((u - 0.5) * Math.PI);
      const saddleDip = -0.28 * Math.cos((v - 0.5) * Math.PI * 2);
      const bumps = showBumps ? 0.045 * Math.sin(u * Math.PI * 8) * Math.sin(v * Math.PI * 5) : 0;
      const y = crown + saddleDip + bumps;
      verts.push(x, y, z);
      uvs.push(u, 1 - v);
    }
  }
  for (let j = 0; j < segV; j++) {
    for (let i = 0; i < segU; i++) {
      const a = j * (segU + 1) + i;
      const b = a + 1;
      const c = a + segU + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function rebuildSaddleGeometry() {
  saddle.geometry.dispose();
  saddle.geometry = createSaddleGeometry();
  saddleWire.geometry.dispose();
  saddleWire.geometry = new THREE.WireframeGeometry(saddle.geometry);
}

function keyOf(q, r) {
  return `${q},${r}`;
}

function parseKey(id) {
  return id.split(',').map(Number);
}

function inBounds(q, r) {
  return q >= 0 && q < cols && r >= 0 && r < rows;
}

function get(q, r) {
  return inBounds(q, r) ? board[r][q] : null;
}

function set(q, r, value) {
  if (inBounds(q, r)) board[r][q] = value;
}

function randomPiece() {
  return Math.floor(Math.random() * colorCount);
}

function reset() {
  if (proto !== 'match') {
    resetAlt();
    return;
  }
  board = Array.from({ length: rows }, () => Array.from({ length: cols }, randomPiece));
  score = 0;
  moves = 0;
  selected = null;
  hover = null;
  matchPreview.clear();
  hoverPreview.clear();
  lineSegments = [];
  preventImmediateFlood();
  updateStats();
  updateProtoCard();
  updateRuleCard();
  updateDifficultyCard();
  updateLegend();
  drawTexture();
}

function preventImmediateFlood() {
  let guard = 0;
  while (findMatches().size > 0 && guard < 300) {
    for (const id of findMatches()) {
      const [q, r] = parseKey(id);
      set(q, r, randomPiece());
    }
    guard++;
  }
  if (!findAnyMove()) {
    const mid = Math.floor(rows / 2);
    set(2, mid, 0);
    set(3, mid, 0);
    set(4, mid, 1);
    set(5, mid, 0);
  }
}

function axialToPixel(q, r) {
  const x = radius * sqrt3 * (q + r / 2);
  const y = radius * 1.5 * r;
  const boardW = radius * sqrt3 * (cols + rows / 2 - 0.5);
  const boardH = radius * 1.5 * (rows - 1) + radius * 2;
  const centerX = textureCanvas.logicalWidth / 2;
  const centerY = textureCanvas.logicalHeight / 2 + 8;
  return {
    x: centerX - boardW / 2 + x + radius,
    y: centerY - boardH / 2 + y + radius,
  };
}

function uvToCell(uv) {
  const x = uv.x * textureCanvas.logicalWidth;
  const y = (1 - uv.y) * textureCanvas.logicalHeight;
  let best = null;
  let bestD = Infinity;
  for (let r = 0; r < rows; r++) {
    for (let q = 0; q < cols; q++) {
      const p = axialToPixel(q, r);
      const d = Math.hypot(x - p.x, y - p.y);
      if (d < bestD) {
        bestD = d;
        best = { q, r };
      }
    }
  }
  return bestD < radius * 0.92 ? best : null;
}

function neighbors(q, r) {
  return dirs.map(d => ({ q: q + d.q, r: r + d.r })).filter(n => inBounds(n.q, n.r));
}

function adjacent(a, b) {
  return neighbors(a.q, a.r).some(n => n.q === b.q && n.r === b.r);
}

function lineMatchesFrom(q, r) {
  const value = get(q, r);
  const matches = [];
  for (const [forward, backward] of axes) {
    const run = [[q, r]];
    for (const dir of [forward, backward]) {
      let nq = q + dir.q;
      let nr = r + dir.r;
      while (inBounds(nq, nr) && get(nq, nr) === value) {
        run.push([nq, nr]);
        nq += dir.q;
        nr += dir.r;
      }
    }
    if (run.length >= 3) matches.push(...run.map(([cq, cr]) => keyOf(cq, cr)));
  }
  return matches;
}

function lineSegmentsFrom(q, r) {
  const value = get(q, r);
  const segments = [];
  for (const [forward, backward] of axes) {
    const run = [[q, r]];
    for (const dir of [forward, backward]) {
      let nq = q + dir.q;
      let nr = r + dir.r;
      while (inBounds(nq, nr) && get(nq, nr) === value) {
        run.push([nq, nr]);
        nq += dir.q;
        nr += dir.r;
      }
    }
    if (run.length >= 3) {
      run.sort((a, b) => {
        const pa = axialToPixel(a[0], a[1]);
        const pb = axialToPixel(b[0], b[1]);
        return pa.x === pb.x ? pa.y - pb.y : pa.x - pb.x;
      });
      segments.push(run.map(([cq, cr]) => keyOf(cq, cr)));
    }
  }
  return segments;
}

function clusterFrom(q, r) {
  const value = get(q, r);
  const seen = new Set([keyOf(q, r)]);
  const stack = [{ q, r }];
  while (stack.length) {
    const cell = stack.pop();
    for (const n of neighbors(cell.q, cell.r)) {
      const id = keyOf(n.q, n.r);
      if (!seen.has(id) && get(n.q, n.r) === value) {
        seen.add(id);
        stack.push(n);
      }
    }
  }
  return seen.size >= 3 ? [...seen] : [];
}

function findMatches() {
  const found = new Set();
  for (let r = 0; r < rows; r++) {
    for (let q = 0; q < cols; q++) {
      const ids = rule === 'line' ? lineMatchesFrom(q, r) : clusterFrom(q, r);
      for (const id of ids) found.add(id);
    }
  }
  return found;
}

function previewFor(q, r) {
  if (!inBounds(q, r)) return { cells: new Set(), segments: [] };
  if (rule === 'line') {
    const segments = lineSegmentsFrom(q, r);
    return { cells: new Set(segments.flat()), segments };
  }
  return { cells: new Set(clusterFrom(q, r)), segments: [] };
}

function findAnyMove() {
  for (let r = 0; r < rows; r++) {
    for (let q = 0; q < cols; q++) {
      for (const n of neighbors(q, r)) {
        swapCells({ q, r }, n);
        const matched = findMatches();
        swapCells({ q, r }, n);
        if (matched.size > 0) return { a: { q, r }, b: n, matched };
      }
    }
  }
  return null;
}

function swapCells(a, b) {
  const av = get(a.q, a.r);
  set(a.q, a.r, get(b.q, b.r));
  set(b.q, b.r, av);
}

async function trySwap(a, b) {
  if (clearing) return;
  if (!adjacent(a, b)) {
    selected = b;
    clearPreviews();
    toastEl.textContent = '隣接セルだけ入れ替えできます';
    drawTexture();
    return;
  }

  swapCells(a, b);
  const matched = findMatches();
  if (matched.size === 0) {
    swapCells(a, b);
    await animateSwap(a, b, true);
    selected = b;
    clearPreviews();
    toastEl.textContent = 'マッチしない入れ替えです';
    drawTexture();
    return;
  }

  moves++;
  selected = null;
  swapCells(a, b);
  await animateSwap(a, b, false);
  swapCells(a, b);
  resolveMatches(matched);
}

async function resolveMatches(initial) {
  clearing = true;
  matchPreview = new Set(initial);
  clearHoverOnly();
  drawTexture();
  await wait(120);

  let pending = new Set(initial);
  let total = 0;
  let chain = 0;
  while (pending.size > 0 && chain < 8) {
    matchPreview = new Set(pending);
    drawTexture();
    await animateClear(pending);
    total += pending.size;
    for (const id of pending) {
      const [q, r] = parseKey(id);
      set(q, r, null);
    }
    await animateItems(collapseAndRefillAnimated(), 280);
    pending = findMatches();
    chain++;
  }

  score += total * total * 5;
  matchPreview.clear();
  clearHoverOnly();
  clearing = false;
  if (!findAnyMove()) shuffleBoard(false);
  toastEl.textContent = `${total}個消去。鞍の曲面上でもヘックスは維持`;
  updateStats();
  drawTexture();
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function animateSwap(a, b, reverse) {
  const av = get(a.q, a.r);
  const bv = get(b.q, b.r);
  const ap = axialToPixel(a.q, a.r);
  const bp = axialToPixel(b.q, b.r);
  const items = [
    makeAnimItem(a, av, ap, bp, 1, 1.08, 1, 1),
    makeAnimItem(b, bv, bp, ap, 1, 1.08, 1, 1),
  ];
  if (!reverse) return animateItems(items, 160);
  return animateItems(items, 120).then(() => animateItems(items.map(item => ({
    ...item,
    fromX: item.toX,
    fromY: item.toY,
    toX: item.fromX,
    toY: item.fromY,
    scaleFrom: 1.08,
    scaleTo: 1,
  })), 120));
}

function makeAnimItem(cell, value, from, to, scaleFrom, scaleTo, alphaFrom, alphaTo) {
  return {
    q: cell.q,
    r: cell.r,
    value,
    fromX: from.x,
    fromY: from.y,
    toX: to.x,
    toY: to.y,
    scaleFrom,
    scaleTo,
    alphaFrom,
    alphaTo,
  };
}

function animateClear(ids) {
  const items = [];
  for (const id of ids) {
    const [q, r] = parseKey(id);
    const p = axialToPixel(q, r);
    items.push(makeAnimItem({ q, r }, get(q, r), p, p, 1.08, 0.18, 1, 0));
  }
  return animateItems(items, 180);
}

function animateItems(items, duration) {
  if (animationRequest) cancelAnimationFrame(animationRequest);
  const start = performance.now();
  return new Promise(resolve => {
    function frame(now) {
      const raw = Math.min(1, (now - start) / duration);
      const t = 1 - Math.pow(1 - raw, 3);
      animationItems = items.map(item => ({
        ...item,
        x: item.fromX + (item.toX - item.fromX) * t,
        y: item.fromY + (item.toY - item.fromY) * t,
        scale: item.scaleFrom + (item.scaleTo - item.scaleFrom) * t,
        alpha: item.alphaFrom + (item.alphaTo - item.alphaFrom) * t,
      }));
      drawTexture();
      if (raw < 1) {
        animationRequest = requestAnimationFrame(frame);
      } else {
        animationItems = [];
        animationRequest = null;
        drawTexture();
        resolve();
      }
    }
    animationRequest = requestAnimationFrame(frame);
  });
}

function collapseAndRefillAnimated() {
  const items = [];
  for (let q = 0; q < cols; q++) {
    const keep = [];
    for (let r = rows - 1; r >= 0; r--) {
      const v = get(q, r);
      if (v !== null) keep.push({ value: v, fromR: r });
    }
    let newCount = 0;
    for (let r = rows - 1; r >= 0; r--) {
      const kept = keep[rows - 1 - r];
      const value = kept?.value ?? randomPiece();
      set(q, r, value);
      const to = axialToPixel(q, r);
      const from = axialToPixel(q, kept ? kept.fromR : -1 - newCount++);
      items.push(makeAnimItem({ q, r }, value, from, to, kept ? 1 : 0.72, 1, kept ? 1 : 0, 1));
    }
  }
  return items;
}

function shuffleBoard(countMove = true) {
  for (let r = 0; r < rows; r++) {
    for (let q = 0; q < cols; q++) set(q, r, randomPiece());
  }
  preventImmediateFlood();
  if (countMove) moves++;
  selected = null;
  matchPreview.clear();
  clearHoverOnly();
  toastEl.textContent = '盤面をシャッフルしました';
  updateStats();
  drawTexture();
}

function drawTexture() {
  if (proto !== 'match') {
    drawAltTexture();
    return;
  }
  tx.clearRect(0, 0, textureCanvas.width, textureCanvas.height);
  drawTextureBackground();
  drawUvGrid();
  drawClusterPreview();

  const animatedKeys = new Set(animationItems.map(item => keyOf(item.q, item.r)));
  for (let r = 0; r < rows; r++) {
    for (let q = 0; q < cols; q++) {
      if (!animatedKeys.has(keyOf(q, r))) {
        const p = axialToPixel(q, r);
        drawHexVisual(q, r, p.x, p.y, get(q, r), {
          selected: selected?.q === q && selected?.r === r,
          hover: hover?.q === q && hover?.r === r,
          match: matchPreview.has(keyOf(q, r)),
          preview: hoverPreview.has(keyOf(q, r)),
          scale: 1,
          alpha: 1,
        });
      }
    }
  }
  for (const item of animationItems) {
    drawHexVisual(item.q, item.r, item.x, item.y, item.value, {
      match: matchPreview.has(keyOf(item.q, item.r)),
      scale: item.scale,
      alpha: item.alpha,
    });
  }
  drawLineSegments();
  boardTexture.needsUpdate = true;
}

function drawTextureBackground() {
  const g = tx.createLinearGradient(0, 0, textureCanvas.width, textureCanvas.height);
  g.addColorStop(0, '#f8f2e8');
  g.addColorStop(1, '#dce8e1');
  tx.fillStyle = g;
  tx.fillRect(0, 0, textureCanvas.width, textureCanvas.height);

  tx.fillStyle = 'rgba(94,74,52,0.18)';
  roundedRect(tx, 92, 82, textureCanvas.width - 184, textureCanvas.height - 150, 70);
  tx.fill();
  tx.strokeStyle = 'rgba(32,28,24,0.45)';
  tx.lineWidth = 14;
  tx.stroke();
}

function drawUvGrid() {
  if (!showGrid) return;
  tx.save();
  tx.strokeStyle = 'rgba(30,30,28,0.14)';
  tx.lineWidth = 2;
  for (let x = 120; x < textureCanvas.width - 120; x += 80) {
    tx.beginPath();
    tx.moveTo(x, 80);
    tx.lineTo(x, textureCanvas.height - 70);
    tx.stroke();
  }
  for (let y = 100; y < textureCanvas.height - 70; y += 70) {
    tx.beginPath();
    tx.moveTo(100, y);
    tx.lineTo(textureCanvas.width - 100, y);
    tx.stroke();
  }
  tx.restore();
}

function drawClusterPreview() {
  if (rule !== 'cluster' || hoverPreview.size < 3) return;
  tx.save();
  tx.fillStyle = 'rgba(243,178,78,0.22)';
  tx.strokeStyle = 'rgba(17,20,20,0.42)';
  tx.lineWidth = 3;
  for (const id of hoverPreview) {
    const [q, r] = parseKey(id);
    const p = axialToPixel(q, r);
    tx.beginPath();
    tx.arc(p.x, p.y, radius * 0.88, 0, Math.PI * 2);
    tx.fill();
    tx.stroke();
  }
  tx.restore();
}

function drawHexVisual(q, r, x, y, value, state = {}) {
  if (value === null || value === undefined) return;
  const piece = pieces[value];
  const scale = state.scale ?? 1;
  const alpha = state.alpha ?? 1;
  tx.save();
  tx.translate(x, y);
  tx.scale(scale, scale);
  tx.globalAlpha = alpha;
  tx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = Math.PI / 180 * (60 * i - 30);
    const px = Math.cos(angle) * radius;
    const py = Math.sin(angle) * radius;
    if (i === 0) tx.moveTo(px, py);
    else tx.lineTo(px, py);
  }
  tx.closePath();
  tx.shadowColor = 'rgba(0,0,0,0.22)';
  tx.shadowBlur = 9;
  tx.shadowOffsetY = 7;
  tx.fillStyle = piece.color;
  tx.fill();
  tx.shadowBlur = 0;
  tx.lineWidth = state.selected ? 7 : state.hover ? 6 : state.match ? 8 : state.preview ? 6 : 3;
  tx.strokeStyle = state.selected ? '#111414' : state.hover ? '#fffdf4' : state.match ? '#6bd4b1' : state.preview ? '#f3b24e' : 'rgba(17,20,20,0.5)';
  tx.stroke();
  tx.fillStyle = piece.ink;
  tx.font = '800 22px ui-sans-serif, system-ui';
  tx.textAlign = 'center';
  tx.textBaseline = 'middle';
  tx.fillText(piece.name, 0, 1);
  tx.fillStyle = 'rgba(17,20,20,0.38)';
  tx.font = '700 10px ui-sans-serif, system-ui';
  tx.fillText(`${q},${r}`, 0, 25);
  tx.restore();
}

function drawLineSegments() {
  if (rule !== 'line' || lineSegments.length === 0) return;
  tx.save();
  tx.lineCap = 'round';
  tx.lineJoin = 'round';
  for (const segment of lineSegments) {
    if (segment.length < 3) continue;
    tx.beginPath();
    segment.forEach((id, index) => {
      const [q, r] = parseKey(id);
      const p = axialToPixel(q, r);
      if (index === 0) tx.moveTo(p.x, p.y);
      else tx.lineTo(p.x, p.y);
    });
    tx.strokeStyle = 'rgba(17,20,20,0.7)';
    tx.lineWidth = 14;
    tx.stroke();
    tx.strokeStyle = '#f3b24e';
    tx.lineWidth = 7;
    tx.stroke();
  }
  tx.restore();
}

function roundedRect(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + w - r, y);
  context.quadraticCurveTo(x + w, y, x + w, y + r);
  context.lineTo(x + w, y + h - r);
  context.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  context.lineTo(x + r, y + h);
  context.quadraticCurveTo(x, y + h, x, y + h - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
}

function pointerToCell(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(saddle, false)[0];
  return hit?.uv ? uvToCell(hit.uv) : null;
}

renderer.domElement.addEventListener('pointermove', event => {
  const cell = pointerToCell(event);
  if (proto !== 'match') {
    hover = cell;
    drawTexture();
    return;
  }
  if (cell?.q !== hover?.q || cell?.r !== hover?.r) {
    hover = cell;
    if (hover) {
      const preview = previewFor(hover.q, hover.r);
      hoverPreview = preview.cells;
      lineSegments = preview.segments;
      if (hoverPreview.size >= 3) {
        toastEl.textContent = rule === 'line'
          ? `曲面上の直線候補 ${hoverPreview.size}個`
          : `曲面上の塊候補 ${hoverPreview.size}個`;
      }
    } else {
      clearHoverOnly();
    }
    drawTexture();
  }
});

renderer.domElement.addEventListener('pointerleave', () => {
  hover = null;
  if (proto !== 'match') {
    drawTexture();
    return;
  }
  clearHoverOnly();
  drawTexture();
});

renderer.domElement.addEventListener('click', event => {
  const cell = pointerToCell(event);
  if (!cell) return;
  if (proto !== 'match') {
    handleAltClick(cell, event);
    return;
  }
  if (!selected) {
    selected = cell;
    const preview = previewFor(cell.q, cell.r);
    hoverPreview = preview.cells;
    lineSegments = preview.segments;
    toastEl.textContent = '入れ替える隣接ヘックスを選択';
    drawTexture();
    return;
  }
  if (selected.q === cell.q && selected.r === cell.r) {
    selected = null;
    drawTexture();
    return;
  }
  trySwap(selected, cell);
});

document.querySelectorAll('.proto').forEach(button => {
  button.addEventListener('click', () => {
    proto = button.dataset.proto;
    document.querySelectorAll('.proto').forEach(b => b.classList.toggle('active', b === button));
    score = 0;
    moves = 0;
    selected = null;
    hover = null;
    matchPreview.clear();
    clearHoverOnly();
    reset();
  });
});

document.querySelectorAll('.rule').forEach(button => {
  button.addEventListener('click', () => {
    rule = button.dataset.rule;
    document.querySelectorAll('.rule').forEach(b => b.classList.toggle('active', b === button));
    selected = null;
    matchPreview.clear();
    clearHoverOnly();
    toastEl.textContent = rule === 'line' ? '曲面上の3軸直線マッチ' : '曲面上の隣接クラスタマッチ';
    updateRuleCard();
    updateDifficultyCard();
    updateStats();
    drawTexture();
  });
});

document.querySelectorAll('.colors').forEach(button => {
  button.addEventListener('click', () => {
    colorCount = Number(button.dataset.count);
    document.querySelectorAll('.colors').forEach(b => b.classList.toggle('active', b === button));
    toastEl.textContent = `${colorCount}色で鞍の盤面を再生成`;
    reset();
  });
});

document.querySelector('#toggle-grid').addEventListener('click', event => {
  showGrid = !showGrid;
  event.currentTarget.classList.toggle('active', showGrid);
  drawTexture();
});

document.querySelector('#toggle-bumps').addEventListener('click', event => {
  showBumps = !showBumps;
  event.currentTarget.classList.toggle('active', showBumps);
  rebuildSaddleGeometry();
});

for (const input of [yawEl, pitchEl, zoomEl]) {
  input.addEventListener('input', applyViewFromInputs);
}

document.querySelector('#reset-view').addEventListener('click', () => {
  yawEl.value = '2';
  pitchEl.value = '23';
  zoomEl.value = '7.5';
  applyViewFromInputs();
});

document.querySelector('#hint').addEventListener('click', () => {
  if (proto !== 'match') {
    altHint();
    return;
  }
  const move = findAnyMove();
  if (!move) {
    toastEl.textContent = '有効手なし。シャッフルします';
    shuffleBoard(false);
    return;
  }
  matchPreview = new Set(move.matched);
  selected = move.a;
  hoverPreview.clear();
  lineSegments = rule === 'line' ? lineSegmentsFrom(move.a.q, move.a.r) : [];
  toastEl.textContent = `ヒント: ${move.matched.size}個マッチできる手`;
  drawTexture();
});

document.querySelector('#shuffle').addEventListener('click', () => {
  if (proto !== 'match') resetAlt(true);
  else shuffleBoard(true);
});
document.querySelector('#reset').addEventListener('click', reset);

function clearPreviews() {
  matchPreview.clear();
  clearHoverOnly();
}

function clearHoverOnly() {
  hoverPreview.clear();
  lineSegments = [];
}

function cells() {
  const out = [];
  for (let r = 0; r < rows; r++) {
    for (let q = 0; q < cols; q++) out.push({ q, r, id: keyOf(q, r) });
  }
  return out;
}

function resetAlt(countMove = false) {
  selected = null;
  hover = null;
  alt = {};
  if (!countMove) {
    score = 0;
    moves = 0;
  } else {
    moves++;
  }

  if (proto === 'lineclear') {
    alt.filled = new Map(cells().map(c => [c.id, Math.random() < 0.34 ? randomPiece() : null]));
    alt.next = randomPiece();
  }
  if (proto === 'pipe') {
    alt.pipe = new Map(cells().map(c => [c.id, {
      type: Math.floor(Math.random() * 6),
      rot: Math.floor(Math.random() * 6),
    }]));
    alt.connected = new Set();
    refreshPipe();
  }
  if (proto === 'paint') {
    alt.paint = new Map(cells().map(c => [c.id, Math.floor(Math.random() * Math.min(5, colorCount))]));
  }
  if (proto === 'path') {
    alt.path = [];
    alt.visited = new Set();
  }
  if (proto === 'sweeper') {
    const mineCount = 12;
    const all = cells().map(c => c.id);
    alt.mines = new Set();
    while (alt.mines.size < mineCount) alt.mines.add(all[Math.floor(Math.random() * all.length)]);
    alt.revealed = new Set();
    alt.flags = new Set();
    alt.dead = false;
  }

  updateProtoCard();
  updateStats();
  updateLegend();
  drawTexture();
}

function updateProtoCard() {
  const text = {
    match: ['Hex Match', '通常のヘックス3マッチ。Line/Clusterを比較します。'],
    lineclear: ['Line Clear', '空きセルに駒を置き、3軸いずれかの列が埋まると消えます。'],
    pipe: ['Pipe Connect', 'ヘックス上の管を回転させ、左端から右端まで流れをつなぎます。'],
    paint: ['Paint', '隣接セルが同色にならないように塗り分けます。'],
    path: ['One Stroke', '隣接セルを一筆書きで辿り、できるだけ全セルを訪れます。'],
    sweeper: ['Sweeper', '6近傍の地雷数を読むヘックス版マインスイーパーです。Shiftクリックで旗。'],
  }[proto];
  protoCardEl.innerHTML = `<strong>${text[0]}</strong><span>${text[1]}</span>`;
}

function altMetric() {
  if (proto === 'lineclear') return completedLines().length;
  if (proto === 'pipe') return alt.connected?.size ?? 0;
  if (proto === 'paint') return paintConflicts().size;
  if (proto === 'path') return `${alt.path?.length ?? 0}/${rows * cols}`;
  if (proto === 'sweeper') return alt.revealed?.size ?? 0;
  return 0;
}

function drawAltTexture() {
  tx.clearRect(0, 0, textureCanvas.width, textureCanvas.height);
  drawTextureBackground();
  drawUvGrid();
  if (proto === 'lineclear') drawLineClear();
  if (proto === 'pipe') drawPipe();
  if (proto === 'paint') drawPaint();
  if (proto === 'path') drawPath();
  if (proto === 'sweeper') drawSweeper();
  boardTexture.needsUpdate = true;
}

function drawEmptyHex(q, r, x, y, label = '') {
  tx.save();
  tx.translate(x, y);
  tx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = Math.PI / 180 * (60 * i - 30);
    const px = Math.cos(angle) * radius;
    const py = Math.sin(angle) * radius;
    if (i === 0) tx.moveTo(px, py);
    else tx.lineTo(px, py);
  }
  tx.closePath();
  tx.fillStyle = 'rgba(255,255,255,0.46)';
  tx.fill();
  tx.lineWidth = hover?.q === q && hover?.r === r ? 5 : 2;
  tx.strokeStyle = hover?.q === q && hover?.r === r ? '#f3b24e' : 'rgba(17,20,20,0.34)';
  tx.stroke();
  if (label) {
    tx.fillStyle = 'rgba(17,20,20,0.55)';
    tx.font = '800 16px ui-sans-serif, system-ui';
    tx.textAlign = 'center';
    tx.textBaseline = 'middle';
    tx.fillText(label, 0, 1);
  }
  tx.restore();
}

function drawLineClear() {
  const lines = new Set(completedLines().flat());
  for (const c of cells()) {
    const p = axialToPixel(c.q, c.r);
    const value = alt.filled.get(c.id);
    if (value === null) drawEmptyHex(c.q, c.r, p.x, p.y);
    else drawHexVisual(c.q, c.r, p.x, p.y, value, { preview: lines.has(c.id), scale: 1, alpha: 1 });
  }
  const np = pieces[alt.next];
  tx.fillStyle = '#141817';
  tx.font = '800 24px ui-sans-serif, system-ui';
  tx.fillText(`Next: ${np.name}`, 86, 76);
}

function lineSets() {
  const out = [];
  for (let r = 0; r < rows; r++) out.push(Array.from({ length: cols }, (_, q) => keyOf(q, r)));
  for (let q = 0; q < cols; q++) out.push(Array.from({ length: rows }, (_, r) => keyOf(q, r)));
  for (let s = 0; s <= cols + rows - 2; s++) {
    const line = [];
    for (let q = 0; q < cols; q++) {
      const r = s - q;
      if (inBounds(q, r)) line.push(keyOf(q, r));
    }
    if (line.length >= 4) out.push(line);
  }
  return out;
}

function completedLines() {
  if (!alt.filled) return [];
  return lineSets().filter(line => line.length >= 4 && line.every(id => alt.filled.get(id) !== null));
}

function drawPipe() {
  refreshPipe();
  for (const c of cells()) {
    const p = axialToPixel(c.q, c.r);
    drawEmptyHex(c.q, c.r, p.x, p.y);
    drawPipeTile(c, p, pipeMask(c.q, c.r), alt.connected.has(c.id));
  }
}

const pipeTypes = [
  [0, 3], [1, 4], [2, 5], [0, 1], [0, 5], [0, 2],
];

function pipeMask(q, r) {
  const tile = alt.pipe.get(keyOf(q, r));
  return pipeTypes[tile.type].map(d => (d + tile.rot) % 6);
}

function drawPipeTile(c, p, mask, connected) {
  tx.save();
  tx.translate(p.x, p.y);
  tx.lineCap = 'round';
  tx.lineWidth = connected ? 12 : 9;
  tx.strokeStyle = connected ? '#6bd4b1' : '#2d3437';
  for (const d of mask) {
    const angle = Math.PI / 180 * (60 * d);
    tx.beginPath();
    tx.moveTo(0, 0);
    tx.lineTo(Math.cos(angle) * radius * 0.62, Math.sin(angle) * radius * 0.62);
    tx.stroke();
  }
  tx.beginPath();
  tx.arc(0, 0, connected ? 8 : 6, 0, Math.PI * 2);
  tx.fillStyle = connected ? '#6bd4b1' : '#2d3437';
  tx.fill();
  tx.restore();
}

function refreshPipe() {
  if (!alt.pipe) return;
  const connected = new Set();
  const stack = [];
  for (let r = 0; r < rows; r++) {
    if (pipeMask(0, r).includes(3)) stack.push({ q: 0, r });
  }
  while (stack.length) {
    const c = stack.pop();
    const id = keyOf(c.q, c.r);
    if (connected.has(id)) continue;
    connected.add(id);
    for (const d of pipeMask(c.q, c.r)) {
      const n = { q: c.q + dirs[d].q, r: c.r + dirs[d].r };
      if (!inBounds(n.q, n.r)) continue;
      if (pipeMask(n.q, n.r).includes((d + 3) % 6)) stack.push(n);
    }
  }
  alt.connected = connected;
}

function pipeSolved() {
  return [...alt.connected].some(id => {
    const [q, r] = parseKey(id);
    return q === cols - 1 && pipeMask(q, r).includes(0);
  });
}

function drawPaint() {
  const conflicts = paintConflicts();
  for (const c of cells()) {
    const p = axialToPixel(c.q, c.r);
    drawHexVisual(c.q, c.r, p.x, p.y, alt.paint.get(c.id), {
      match: conflicts.has(c.id),
      hover: hover?.q === c.q && hover?.r === c.r,
      scale: 1,
      alpha: 1,
    });
  }
}

function paintConflicts() {
  const bad = new Set();
  if (!alt.paint) return bad;
  for (const c of cells()) {
    for (const n of neighbors(c.q, c.r)) {
      if (alt.paint.get(c.id) === alt.paint.get(keyOf(n.q, n.r))) {
        bad.add(c.id);
        bad.add(keyOf(n.q, n.r));
      }
    }
  }
  return bad;
}

function drawPath() {
  for (const c of cells()) {
    const p = axialToPixel(c.q, c.r);
    const index = alt.path.indexOf(c.id);
    if (index >= 0) drawHexVisual(c.q, c.r, p.x, p.y, index % colorCount, { preview: true, scale: 1, alpha: 1 });
    else drawEmptyHex(c.q, c.r, p.x, p.y);
  }
  tx.save();
  tx.strokeStyle = '#111414';
  tx.lineWidth = 8;
  tx.lineCap = 'round';
  tx.beginPath();
  alt.path.forEach((id, i) => {
    const [q, r] = parseKey(id);
    const p = axialToPixel(q, r);
    if (i === 0) tx.moveTo(p.x, p.y);
    else tx.lineTo(p.x, p.y);
  });
  tx.stroke();
  tx.strokeStyle = '#f3b24e';
  tx.lineWidth = 4;
  tx.stroke();
  tx.restore();
}

function drawSweeper() {
  const allRevealed = alt.dead;
  for (const c of cells()) {
    const id = c.id;
    const p = axialToPixel(c.q, c.r);
    const revealed = allRevealed || alt.revealed.has(id);
    if (!revealed) {
      drawEmptyHex(c.q, c.r, p.x, p.y, alt.flags.has(id) ? '旗' : '');
      continue;
    }
    if (alt.mines.has(id)) drawHexVisual(c.q, c.r, p.x, p.y, 6, { match: true, scale: 1, alpha: 1 });
    else drawEmptyHex(c.q, c.r, p.x, p.y, String(mineCount(c.q, c.r)));
  }
}

function mineCount(q, r) {
  return neighbors(q, r).filter(n => alt.mines.has(keyOf(n.q, n.r))).length;
}

function handleAltClick(cell, event) {
  const id = keyOf(cell.q, cell.r);
  if (proto === 'lineclear') {
    if (alt.filled.get(id) === null) {
      alt.filled.set(id, alt.next);
      alt.next = randomPiece();
      moves++;
      const done = completedLines();
      for (const line of done) for (const key of line) alt.filled.set(key, null);
      score += done.flat().length * 10;
      toastEl.textContent = done.length ? `${done.length}ライン消去` : '駒を置きました';
    }
  }
  if (proto === 'pipe') {
    const tile = alt.pipe.get(id);
    tile.rot = (tile.rot + 1) % 6;
    moves++;
    refreshPipe();
    if (pipeSolved()) {
      score += 100;
      toastEl.textContent = '左端から右端まで接続しました';
    } else {
      toastEl.textContent = '管を回転しました';
    }
  }
  if (proto === 'paint') {
    alt.paint.set(id, (alt.paint.get(id) + 1) % Math.min(5, colorCount));
    moves++;
    const bad = paintConflicts();
    if (bad.size === 0) {
      score += 100;
      toastEl.textContent = '塗り分け成功';
    } else {
      toastEl.textContent = `衝突 ${bad.size} セル`;
    }
  }
  if (proto === 'path') {
    const current = alt.path[alt.path.length - 1];
    if (!current) {
      alt.path.push(id);
      alt.visited.add(id);
    } else if (current === id) {
      alt.visited.delete(alt.path.pop());
    } else {
      const [cq, cr] = parseKey(current);
      if (!alt.visited.has(id) && adjacent({ q: cq, r: cr }, cell)) {
        alt.path.push(id);
        alt.visited.add(id);
        moves++;
      }
    }
    score = alt.path.length;
    toastEl.textContent = `Path ${alt.path.length}/${rows * cols}`;
  }
  if (proto === 'sweeper') {
    if (event.shiftKey) {
      if (alt.flags.has(id)) alt.flags.delete(id);
      else alt.flags.add(id);
    } else if (alt.mines.has(id)) {
      alt.dead = true;
      toastEl.textContent = '地雷でした';
    } else {
      alt.revealed.add(id);
      score = alt.revealed.size;
      toastEl.textContent = `${mineCount(cell.q, cell.r)} mines around`;
    }
    moves++;
  }
  updateStats();
  drawTexture();
}

function altHint() {
  if (proto === 'lineclear') toastEl.textContent = `Nextを置いてラインを埋めます。完成ライン: ${completedLines().length}`;
  if (proto === 'pipe') toastEl.textContent = pipeSolved() ? '接続済みです' : `接続中セル: ${alt.connected.size}`;
  if (proto === 'paint') toastEl.textContent = `隣接同色の衝突: ${paintConflicts().size}`;
  if (proto === 'path') toastEl.textContent = '隣接する未訪問セルを順にクリックします';
  if (proto === 'sweeper') toastEl.textContent = 'Shiftクリックで旗、通常クリックで開きます';
  drawTexture();
}

function updateStats() {
  if (proto !== 'match') {
    scoreEl.textContent = score;
    movesEl.textContent = moves;
    matchEl.textContent = altMetric();
    return;
  }
  scoreEl.textContent = score;
  movesEl.textContent = moves;
  matchEl.textContent = findMatches().size || findAnyMove()?.matched?.size || 0;
}

function updateRuleCard() {
  ruleCardEl.innerHTML = rule === 'line'
    ? '<strong>Line 3</strong><span>UV上のヘックス3軸に沿って3個以上並べます。曲面では線がゆるく曲がって見えます。</span>'
    : '<strong>Cluster 3</strong><span>6方向隣接で3個以上くっつけば消えます。曲面でも判定はヘックス隣接です。</span>';
}

function updateDifficultyCard() {
  const lineText = colorCount <= 6 ? 'Line 3はやや連鎖しやすい' : colorCount <= 8 ? 'Line 3はほどよい' : 'Line 3はかなり渋い';
  const clusterText = colorCount <= 6 ? 'Cluster 3は簡単すぎる' : colorCount === 7 ? 'Cluster 3はまだ緩め' : colorCount === 8 ? 'Cluster 3の検証向き' : 'Cluster 3は硬め';
  difficultyCardEl.innerHTML = `<strong>${colorCount} colors</strong><span>${rule === 'line' ? lineText : clusterText}。ヘックスは6方向隣接なので四角グリッドより多色が必要です。</span>`;
}

function updateLegend() {
  legendEl.innerHTML = pieces.slice(0, colorCount).map(piece => `
    <div><i style="background:${piece.color}"></i>${piece.name}</div>
  `).join('');
}

function resize() {
  const { clientWidth, clientHeight } = viewport;
  renderer.setSize(clientWidth, clientHeight, false);
  camera.aspect = clientWidth / clientHeight;
  camera.updateProjectionMatrix();
}

function applyViewFromInputs() {
  if (syncingViewInputs) return;
  const yaw = Number(yawEl.value) * Math.PI / 180;
  const pitch = Number(pitchEl.value) * Math.PI / 180;
  const distance = Number(zoomEl.value);
  const target = controls.target;
  const horizontal = Math.cos(pitch) * distance;
  camera.position.set(
    target.x + Math.sin(yaw) * horizontal,
    target.y + Math.sin(pitch) * distance,
    target.z + Math.cos(yaw) * horizontal,
  );
  camera.lookAt(target);
  controls.update();
}

function syncViewInputsFromCamera() {
  const offset = camera.position.clone().sub(controls.target);
  const distance = offset.length();
  if (distance === 0) return;
  const yaw = Math.atan2(offset.x, offset.z) * 180 / Math.PI;
  const pitch = Math.asin(offset.y / distance) * 180 / Math.PI;
  syncingViewInputs = true;
  yawEl.value = String(Math.round(Math.max(-90, Math.min(90, yaw))));
  pitchEl.value = String(Math.round(Math.max(5, Math.min(55, pitch))));
  zoomEl.value = String(Math.max(4, Math.min(10, distance)).toFixed(1));
  syncingViewInputs = false;
}

function animate() {
  const t = clock.getElapsedTime();
  const inhale = (Math.sin(t * 1.25) + 1) * 0.5;
  const saddleLift = 0.018 * inhale;
  saddle.scale.set(1 + 0.006 * inhale, 1 + 0.018 * inhale, 1 + 0.004 * inhale);
  saddle.position.y = saddleBaseY + saddleLift;
  horseBack.scale.set(
    horseBackBaseScale.x * (1 + 0.004 * inhale),
    horseBackBaseScale.y * (1 + 0.028 * inhale),
    horseBackBaseScale.z * (1 + 0.004 * inhale),
  );
  horseBack.position.y = horseBackBaseY + saddleLift * 0.55;
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

window.addEventListener('resize', resize);
resize();
reset();
animate();
