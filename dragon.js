// 金龍追珠：龍追著龍珠游動，龍珠跟著 MediaPipe 偵測到的食指指尖（沒有鏡頭時跟著滑鼠/觸控）。
// The spine bones are driven "follow the leader" style: the head chases the pearl and every spine bone
// sits further back on the trail the head left behind, so the body always flows through the same path.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { DragonMusic } from './music.js?v=202611231548';

const cfg = Object.assign({
  glbUrl: 'dragon.glb?v=202611231548',
  mediapipe: true,
  mpBundle: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs',
  mpWasm: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
  mpModel: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
}, window.DRAGON_CONFIG || {});

const $ = (id) => document.getElementById(id);
const status = (t) => { const el = $('status'); if (el) el.textContent = t; };

// ---------------- scene ----------------
const canvas = $('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 300);
camera.position.set(0, 0, 34);
scene.add(new THREE.HemisphereLight(0xffe2b0, 0x220a04, 0.6));
const key = new THREE.DirectionalLight(0xfff0d8, 2.2); key.position.set(-10, 14, 20); scene.add(key);
const rim = new THREE.DirectionalLight(0x9db8ff, 1.4); rim.position.set(12, -6, -14); scene.add(rim);

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// ---------------- flaming pearls ----------------
// Each pearl: a glowing core, a flickering halo and a pool of fire particles that are born on the pearl's
// surface, swirl around it, rise and fade from white-gold to red. Particles live in world space, so a moving
// pearl leaves a trail of flame behind it.
function glowTexture(stops) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'); const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  stops.forEach(([o, col]) => gr.addColorStop(o, col));
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
const HALO_TEX = glowTexture([[0, 'rgba(255,240,200,1)'], [0.25, 'rgba(255,170,60,0.55)'], [0.6, 'rgba(255,80,10,0.18)'], [1, 'rgba(255,40,0,0)']]);

const FIRE_VS = `
  attribute float aLife; attribute float aSize; attribute float aSeed;
  varying float vLife; varying float vSeed;
  uniform float uScale;
  void main() {
    vLife = aLife; vSeed = aSeed;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float grow = smoothstep(0.0, 0.15, aLife) * (1.0 - aLife * 0.75);
    gl_PointSize = aSize * grow * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;
const FIRE_FS = `
  varying float vLife; varying float vSeed;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    p.y += 0.25 * p.x * p.x;                       // teardrop: flame tongues point upward
    float r = length(p * vec2(1.0, 0.8));
    float a = smoothstep(1.0, 0.0, r);
    a *= 1.0 - smoothstep(0.55, 1.0, vLife);
    vec3 hot = vec3(1.0, 0.95, 0.75), mid = vec3(1.0, 0.55, 0.08), cool = vec3(0.85, 0.12, 0.02);
    vec3 col = vLife < 0.35 ? mix(hot, mid, vLife / 0.35) : mix(mid, cool, (vLife - 0.35) / 0.65);
    gl_FragColor = vec4(col * (1.2 - 0.4 * vSeed), a * 0.9);
  }`;

function makeFirePearl(r, count) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(r, 48, 24), new THREE.MeshPhysicalMaterial({
    color: 0xffb860, roughness: 0.2, metalness: 0, clearcoat: 1, emissive: 0xff7a1a, emissiveIntensity: 1.2 }));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: HALO_TEX, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.setScalar(r * 6);
  const light = new THREE.PointLight(0xff8a2a, 40, 16, 1.6);
  g.add(core, halo, light); scene.add(g);

  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3), life = new Float32Array(count), size = new Float32Array(count), seed = new Float32Array(count);
  const vel = new Float32Array(count * 3), span = new Float32Array(count);
  for (let i = 0; i < count; i++) { life[i] = Math.random(); span[i] = 1; seed[i] = Math.random(); }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aLife', new THREE.BufferAttribute(life, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({ vertexShader: FIRE_VS, fragmentShader: FIRE_FS, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uScale: { value: 420 } } });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; scene.add(pts);
  const fire = { pos, life, size, seed, vel, span, geo, count, r };

  g.userData = { core, halo, light, fire, phase: Math.random() * 10 };
  return g;
}

const _tmp = new THREE.Vector3();
function updateFirePearl(g, dt, time) {
  const { halo, light, fire, phase } = g.userData;
  const f = 0.85 + 0.15 * Math.sin(time * 17 + phase) * Math.sin(time * 7.3 + phase * 2);   // flicker
  halo.scale.setScalar(fire.r * 6 * f); light.intensity = 40 * f;
  const c = g.position;
  for (let i = 0; i < fire.count; i++) {
    fire.life[i] += dt / fire.span[i];
    const i3 = i * 3;
    if (fire.life[i] >= 1) {                       // respawn on the pearl's surface
      _tmp.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
      fire.pos[i3] = c.x + _tmp.x * fire.r * 0.9; fire.pos[i3 + 1] = c.y + _tmp.y * fire.r * 0.9; fire.pos[i3 + 2] = c.z + _tmp.z * fire.r * 0.9;
      const swirl = 2.2;                            // tangential swirl around the vertical axis
      fire.vel[i3] = _tmp.x * 0.8 - _tmp.z * swirl; fire.vel[i3 + 1] = 2.2 + Math.random() * 2.2; fire.vel[i3 + 2] = _tmp.z * 0.8 + _tmp.x * swirl;
      fire.life[i] = 0; fire.span[i] = 0.45 + Math.random() * 0.55;
      fire.size[i] = fire.r * (2.4 + Math.random() * 2.2);
    } else {
      const s = fire.seed[i] * 6.28;
      fire.vel[i3] += Math.sin(time * 9 + s) * 4 * dt;                  // turbulence
      fire.vel[i3 + 2] += Math.cos(time * 8 + s) * 4 * dt;
      fire.vel[i3 + 1] += 2.5 * dt;                                     // buoyancy
      fire.pos[i3] += fire.vel[i3] * dt; fire.pos[i3 + 1] += fire.vel[i3 + 1] * dt; fire.pos[i3 + 2] += fire.vel[i3 + 2] * dt;
    }
  }
  fire.geo.attributes.position.needsUpdate = true;
  fire.geo.attributes.aLife.needsUpdate = true;
  fire.geo.attributes.aSize.needsUpdate = true;
}
const pearlA = makeFirePearl(1.15, 520);   // one big flaming pearl

// ---------------- target: fingertip / pointer ----------------
const target = new THREE.Vector3(0, 0, 0);
const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const ray = new THREE.Raycaster();
function setTargetFromNdc(x, y) {          // x, y in -1..1
  ray.setFromCamera(new THREE.Vector2(x, y), camera);
  ray.ray.intersectPlane(plane, target);
}
let pointerActive = false, lastHandTime = -1e9;
const handOn = () => performance.now() - lastHandTime < 800;
canvas.addEventListener('pointermove', (e) => {
  const r = canvas.getBoundingClientRect();
  if (handOn()) return;   // the hand wins while it is visible
  setTargetFromNdc(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  pointerActive = true;
});

// ---------------- dragon rig ----------------
const UP_PREF = new THREE.Vector3(0, 0.55, 0.85).normalize();   // dragon's back leans toward the viewer
let rig = null, mixer = null;
const trail = [];          // [{p: Vector3, up: Vector3}] newest first
const head = { p: new THREE.Vector3(), v: new THREE.Vector3(-6, 0, 0), up: UP_PREF.clone() };

function frameQuat(dir, up) {                  // orthonormal frame: Y = dir, Z = up
  const y = dir.clone().normalize();
  const z = up.clone().sub(y.clone().multiplyScalar(up.dot(y)));
  if (z.lengthSq() < 1e-6) z.set(1, 0, 0).sub(y.clone().multiplyScalar(y.x));
  z.normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

new GLTFLoader().load(cfg.glbUrl, (gltf) => {
  const root = gltf.scene;
  root.traverse((o) => {
    if (o.isMesh) { o.frustumCulled = false; if (/Pearl|Sphere/i.test(o.name)) o.visible = false; }
  });
  scene.add(root);
  root.updateMatrixWorld(true);
  const byName = (n) => root.getObjectByName(n);
  const spine = [];
  for (let k = 0; ; k++) { const b = byName('spine_' + String(k).padStart(2, '0')); if (!b) break; spine.push(b); }
  const headBone = byName('head'), tip = byName('head_tip');
  const wp = (o) => o.getWorldPosition(new THREE.Vector3());
  const restPos = spine.map(wp);
  const lastTail = restPos[restPos.length - 1].clone().add(restPos[restPos.length - 1].clone().sub(restPos[restPos.length - 2]));
  restPos.push(lastTail);
  const seg = restPos[1].distanceTo(restPos[0]);
  // each bone's rest frame, expressed as (rest world quat, rest "dir/up" frame)
  // (Blender's Z-up became glTF's Y-up, so the rest "up" is world +Y)
  const rest = spine.map((b, k) => ({
    q: b.getWorldQuaternion(new THREE.Quaternion()),
    frame: frameQuat(restPos[k + 1].clone().sub(restPos[k]), new THREE.Vector3(0, 1, 0)),
  }));
  const headRest = { q: headBone.getWorldQuaternion(new THREE.Quaternion()),
    frame: frameQuat(wp(tip).sub(wp(headBone)), new THREE.Vector3(0, 1, 0)) };

  // the trail starts as the dragon's rest pose, so the first frame matches the model
  for (let k = 0; k < restPos.length; k++) trail.push({ p: restPos[k].clone(), up: UP_PREF.clone() });
  head.p.copy(restPos[0]);
  rig = { root, spine, headBone, seg, rest, headRest };

  const clip = gltf.animations.find((a) => /Rig|Swim|Scene/i.test(a.name)) || gltf.animations[0];
  if (clip) {
    mixer = new THREE.AnimationMixer(root);
    // keep the jaw / legs / head wobble from Blender; the spine is driven here
    const keep = clip.tracks.filter((t) => !/^spine_/.test(t.name) && !/^GD_Rig\./.test(t.name));
    mixer.clipAction(new THREE.AnimationClip('living', clip.duration, keep)).play();
  }
  $('loading').hidden = true;
  status(cfg.mediapipe ? '按「開啟鏡頭」用食指指揮龍珠，或直接移動滑鼠' : '移動滑鼠或手指，龍會追著龍珠游（食指鏡頭版請在 Mac 上開本機網頁）');
}, (e) => { if (e.total) $('loading').textContent = `載入金龍中… ${Math.round(e.loaded / e.total * 100)}%`; },
   (err) => { $('loading').textContent = '模型載入失敗：' + err.message; });

// sample the trail at arc length s behind the head
function sampleTrail(s) {
  let acc = 0;
  for (let i = 0; i < trail.length - 1; i++) {
    const a = trail[i], b = trail[i + 1]; const d = a.p.distanceTo(b.p);
    if (acc + d >= s) { const f = d > 1e-6 ? (s - acc) / d : 0;
      return { p: a.p.clone().lerp(b.p, f), up: a.up.clone().lerp(b.up, f).normalize() }; }
    acc += d;
  }
  const a = trail[trail.length - 2], b = trail[trail.length - 1];
  const dir = b.p.clone().sub(a.p).normalize();
  return { p: b.p.clone().add(dir.multiplyScalar(s - acc)), up: b.up.clone() };
}

// ---------------- simulation ----------------
const clock = new THREE.Clock();
let t = 0;
const tmpQ = new THREE.Quaternion(), parentQ = new THREE.Quaternion();
const MIN_R = 6.0;          // smallest turning circle of the head (scene units)
const music = new DragonMusic();
let rec = null, recCanvas = null, recCtx = null, recStart = 0, recTimer = null;   // recording state (see bottom)
let prevPearl = null;
function step(dt) {
  t += dt;
  if (!pointerActive && performance.now() - lastHandTime > 1500) {   // idle: the pearl drifts by itself
    target.set(Math.sin(t * 0.37) * 14, Math.sin(t * 0.53) * 7, 0);
  }
  // lead pearl eases toward the fingertip, the second pearl spirals around it
  pearlA.position.lerp(target, 1 - Math.exp(-dt * 6));
  pearlA.position.z = handOn() ? 0 : Math.sin(t * 1.3) * 1.5;   // stay on the fingertip while a hand is tracked
  updateFirePearl(pearlA, dt, t);
  // music follows the pearl: height -> pitch, speed -> note density / brightness
  const ps = pearlA.position.clone().project(camera);
  const pSpeed = prevPearl ? pearlA.position.distanceTo(prevPearl) / Math.max(dt, 1e-3) : 0;
  prevPearl = (prevPearl || new THREE.Vector3()).copy(pearlA.position);
  music.update(dt, (ps.y + 1) / 2, pSpeed);
  if (!rig) return;

  // head steers toward a point that circles the pearl, so the dragon keeps swimming around it
  const orbit = new THREE.Vector3(Math.cos(t * 1.1) * 3.6, Math.sin(t * 1.1) * 2.5, Math.sin(t * 0.8) * 2.5);
  const goal = pearlA.position.clone().add(orbit);
  const want = goal.sub(head.p);
  const dist = want.length();
  const speed = THREE.MathUtils.clamp(dist * 2.2, 5, 22);
  want.setLength(speed);
  // steer with a limited turn rate: the head always swims in round arcs (minimum radius MIN_R), never sharp corners
  const curSpeed = Math.max(4, THREE.MathUtils.lerp(head.v.length(), speed, 1 - Math.exp(-dt * 2.0)));
  const curDir = head.v.clone().normalize(), wantDir = want.clone().normalize();
  const ang = curDir.angleTo(wantDir), maxTurn = (curSpeed / MIN_R) * dt;
  if (ang > 1e-4) {
    const q = new THREE.Quaternion().setFromUnitVectors(curDir, wantDir);
    curDir.applyQuaternion(new THREE.Quaternion().slerp(q, Math.min(1, maxTurn / ang)));
  }
  head.v.copy(curDir).multiplyScalar(curSpeed);
  const prevDir = head.v.clone().normalize();
  head.p.addScaledVector(head.v, dt);
  // keep the back up: transport the previous up, then relax toward the preferred up
  head.up.sub(prevDir.clone().multiplyScalar(head.up.dot(prevDir))).normalize().lerp(UP_PREF, 1 - Math.exp(-dt * 1.5)).normalize();

  if (trail[0].p.distanceTo(head.p) > 0.08) trail.unshift({ p: head.p.clone(), up: head.up.clone() });
  else trail[0].p.copy(head.p);
  // drop trail points beyond the tail
  let acc = 0; const need = rig.seg * (rig.spine.length + 2);
  for (let i = 0; i < trail.length - 1; i++) { acc += trail[i].p.distanceTo(trail[i + 1].p); if (acc > need) { trail.length = i + 2; break; } }

  // place every spine bone along the trail, with a soft travelling weave
  const { spine, seg, rest } = rig;
  rig.root.updateMatrixWorld(true);
  // 1) joints along the trail, with a soft travelling side-to-side weave
  const N = spine.length, J = [], U = [];
  for (let k = 0; k <= N; k++) {
    const sk = k * seg, a = sampleTrail(sk), b = sampleTrail(sk + 0.3);
    const side = new THREE.Vector3().crossVectors(b.p.clone().sub(a.p), a.up).normalize();
    J.push(a.p.addScaledVector(side, 0.3 * Math.min(1, sk / 3) * Math.sin(0.5 * sk - t * 5)));
    U.push(a.up);
  }
  // 2) relax the joint chain so every bend is spread over several vertebrae (round curves, no kinks)
  for (let it = 0; it < 10; it++) {
    for (let k = 1; k < N; k++) J[k] = J[k].clone().multiplyScalar(0.5).addScaledVector(J[k - 1], 0.25).addScaledVector(J[k + 1], 0.25);
  }
  // 3) orient each bone from joint k to joint k+1
  for (let k = 0; k < N; k++) {
    const dir = J[k + 1].clone().sub(J[k]);
    const want = frameQuat(dir, U[k]);
    // world rotation = (desired frame) * (rest frame)^-1 * (rest world rotation)
    const worldQ = want.clone().multiply(rest[k].frame.clone().invert()).multiply(rest[k].q);
    const bone = spine[k], parent = bone.parent;
    parent.getWorldQuaternion(parentQ);
    bone.quaternion.copy(parentQ.clone().invert().multiply(worldQ));
    if (k === 0) bone.position.copy(parent.worldToLocal(J[0].clone()));
    bone.updateMatrixWorld(true);
  }
  // head looks along its motion, glancing at the pearl
  const hb = rig.headBone;
  const look = pearlA.position.clone().sub(spine[0].getWorldPosition(new THREE.Vector3())).normalize();
  const fwd = head.v.clone().normalize().multiplyScalar(0.7).add(look.multiplyScalar(0.3));
  const hq = frameQuat(fwd, head.up).multiply(rig.headRest.frame.clone().invert()).multiply(rig.headRest.q);
  hb.parent.getWorldQuaternion(parentQ);
  hb.quaternion.copy(parentQ.clone().invert().multiply(hq));
  hb.updateMatrixWorld(true);
}

function loop() {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  if (mixer) mixer.update(dt);
  step(dt);
  renderer.render(scene, camera);
  if (rec) composite();
  requestAnimationFrame(loop);
}
resize(); loop();

// ---------------- MediaPipe hand tracking ----------------
const camBtn = $('camBtn');
if (!cfg.mediapipe && camBtn) camBtn.hidden = true;
camBtn?.addEventListener('click', async () => {
  camBtn.disabled = true; status('載入手部偵測模型…');
  try {
    const { FilesetResolver, HandLandmarker } = await import(cfg.mpBundle);
    const fileset = await FilesetResolver.forVisionTasks(cfg.mpWasm);
    const hands = await HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: cfg.mpModel, delegate: 'GPU' }, runningMode: 'VIDEO', numHands: 1 });
    const video = $('cam');
    video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false });
    await video.play();
    document.body.classList.add('cam-on'); camBtn.hidden = true; $('opacityCtl').hidden = false;
    if (!music.on) setMusic(true);
    status('舉起手，用食指指揮龍珠');
    let lastVideoTime = -1;
    const track = () => {
      if (video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        const res = hands.detectForVideo(video, performance.now());
        const lm = res.landmarks && res.landmarks[0];
        if (lm) {
          const tipLm = lm[8];                       // landmark 8 = index finger tip
          // where the fingertip appears in the full-screen, mirrored, object-fit: cover video
          const W = window.innerWidth, H = window.innerHeight, vw = video.videoWidth || 640, vh = video.videoHeight || 480;
          const sc = Math.max(W / vw, H / vh), dw = vw * sc, dh = vh * sc;
          const sx = (W - dw) / 2 + (1 - tipLm.x) * dw, sy = (H - dh) / 2 + tipLm.y * dh;
          setTargetFromNdc(sx / W * 2 - 1, -(sy / H) * 2 + 1);   // the pearl sits right on your fingertip
          lastHandTime = performance.now(); pointerActive = false;
        }
      }
      requestAnimationFrame(track);
    };
    track();
  } catch (e) {
    console.error(e);
    camBtn.disabled = false;
    status('無法開啟鏡頭或手部偵測：' + (e.message || e) + '（仍可用滑鼠操作）');
  }
});

// ---------------- music toggle ----------------
const musicBtn = $('musicBtn');
function setMusic(on) {
  if (on) music.start(); else music.stop();
  if (musicBtn) { musicBtn.textContent = on ? '音樂：開' : '音樂：關'; musicBtn.setAttribute('aria-pressed', on); }
}
musicBtn?.addEventListener('click', () => setMusic(!music.on));

// ---------------- recording (picture + music) ----------------
// The camera background is a <video> under the WebGL canvas, so while recording we draw both onto one
// canvas every frame (background, mirrored camera at the chosen opacity, then the dragon) and record that
// canvas together with the music.
const recBtn = $('recBtn');
function composite() {
  const W = canvas.width, H = canvas.height;
  if (recCanvas.width !== W || recCanvas.height !== H) { recCanvas.width = W; recCanvas.height = H; }
  const g = recCtx.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.45, Math.max(W, H) * 0.7);
  g.addColorStop(0, '#2a120b'); g.addColorStop(1, '#120806');
  recCtx.globalAlpha = 1; recCtx.fillStyle = g; recCtx.fillRect(0, 0, W, H);
  const video = $('cam');
  if (document.body.classList.contains('cam-on') && video.videoWidth) {
    const op = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cam-opacity')) || 0;
    const sc = Math.max(W / video.videoWidth, H / video.videoHeight), dw = video.videoWidth * sc, dh = video.videoHeight * sc;
    recCtx.save(); recCtx.globalAlpha = op; recCtx.translate(W, 0); recCtx.scale(-1, 1);
    recCtx.drawImage(video, (W - dw) / 2, (H - dh) / 2, dw, dh); recCtx.restore();
  }
  recCtx.globalAlpha = 1; recCtx.drawImage(canvas, 0, 0);
}
function pickType() {
  const types = ['video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return types.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
}
function startRec() {
  if (!window.MediaRecorder) { status('這個瀏覽器不支援錄影，請改用 Chrome、Edge 或新版 Safari'); return; }
  if (!music.on) setMusic(true);
  recCanvas = document.createElement('canvas'); recCtx = recCanvas.getContext('2d'); composite();
  const stream = recCanvas.captureStream(30);
  music.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
  const type = pickType(); const chunks = [];
  rec = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: 8e6 } : undefined);
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  rec.onstop = () => {
    const mime = rec.mimeType || type || 'video/webm', ext = mime.includes('mp4') ? 'mp4' : 'webm';
    const url = URL.createObjectURL(new Blob(chunks, { type: mime }));
    const d = new Date(), pad = (n) => String(n).padStart(2, '0');
    const a = document.createElement('a'); a.href = url;
    a.download = `golden-dragon_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.${ext}`;
    document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 1000);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    rec = null; status(`影片已下載（${ext.toUpperCase()}）`);
  };
  rec.start(500); recStart = performance.now();
  recBtn.classList.add('recording');
  const tick = () => { const s = Math.floor((performance.now() - recStart) / 1000);
    recBtn.textContent = `■ 停止錄影 ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  tick(); recTimer = setInterval(tick, 500);
}
function stopRec() {
  clearInterval(recTimer); recBtn.classList.remove('recording'); recBtn.textContent = '● 錄影';
  if (rec && rec.state !== 'inactive') rec.stop();
}
recBtn?.addEventListener('click', () => (rec ? stopRec() : startRec()));
