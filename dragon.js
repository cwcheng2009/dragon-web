// 金龍追珠：龍追著龍珠游動，龍珠跟著 MediaPipe 偵測到的食指指尖（沒有鏡頭時跟著滑鼠/觸控）。
// The spine bones are driven "follow the leader" style: the head chases the pearl and every spine bone
// sits further back on the trail the head left behind, so the body always flows through the same path.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const cfg = Object.assign({
  glbUrl: 'dragon.glb',
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

// ---------------- pearls ----------------
function makePearl(r, color, glow) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 48, 24), new THREE.MeshPhysicalMaterial({
    color, roughness: 0.15, metalness: 0, clearcoat: 1, iridescence: 0.6, emissive: color, emissiveIntensity: 0.35 }));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: glow, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55 }));
  halo.scale.setScalar(r * 5);
  const light = new THREE.PointLight(glow, 30, 14, 1.6);
  g.add(m, halo, light); scene.add(g);
  return g;
}
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'); const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,220,160,1)'); gr.addColorStop(0.35, 'rgba(255,170,70,0.35)'); gr.addColorStop(1, 'rgba(255,140,40,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
const pearlA = makePearl(0.75, 0xf3d3a0, 0xffb054);
const pearlB = makePearl(0.5, 0xf6e1c0, 0xffc77a);

// ---------------- target: fingertip / pointer ----------------
const target = new THREE.Vector3(0, 0, 0);
const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const ray = new THREE.Raycaster();
function setTargetFromNdc(x, y) {          // x, y in -1..1
  ray.setFromCamera(new THREE.Vector2(x, y), camera);
  ray.ray.intersectPlane(plane, target);
}
let pointerActive = false, lastHandTime = -1e9;
canvas.addEventListener('pointermove', (e) => {
  const r = canvas.getBoundingClientRect();
  if (performance.now() - lastHandTime < 800) return;   // the hand wins while it is visible
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
function step(dt) {
  t += dt;
  if (!pointerActive && performance.now() - lastHandTime > 1500) {   // idle: the pearl drifts by itself
    target.set(Math.sin(t * 0.37) * 14, Math.sin(t * 0.53) * 7, 0);
  }
  // lead pearl eases toward the fingertip, the second pearl spirals around it
  pearlA.position.lerp(target, 1 - Math.exp(-dt * 6));
  pearlA.position.z = Math.sin(t * 1.3) * 1.5;
  pearlB.position.copy(pearlA.position).add(new THREE.Vector3(Math.cos(t * 2.4) * 1.6, Math.sin(t * 2.4) * 1.0, Math.sin(t * 2.4) * 1.4));
  if (!rig) return;

  // head steers toward a point that circles the pearl, so the dragon keeps swimming around it
  const orbit = new THREE.Vector3(Math.cos(t * 1.1) * 3.2, Math.sin(t * 1.1) * 2.2, Math.sin(t * 0.8) * 2.5);
  const goal = pearlA.position.clone().add(orbit);
  const want = goal.sub(head.p);
  const dist = want.length();
  const speed = THREE.MathUtils.clamp(dist * 2.2, 5, 22);
  want.setLength(speed);
  head.v.lerp(want, 1 - Math.exp(-dt * 2.4));
  if (head.v.length() < 4) head.v.setLength(4);
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
  for (let k = 0; k < spine.length; k++) {
    const s0 = k * seg, s1 = (k + 1) * seg;
    const a = sampleTrail(s0), b = sampleTrail(s1);
    const dir = b.p.clone().sub(a.p);
    const fade = Math.min(1, s0 / 3);
    const side = new THREE.Vector3().crossVectors(dir, a.up).normalize();
    a.p.addScaledVector(side, 0.35 * fade * Math.sin(0.55 * s0 - t * 6));
    const want = frameQuat(dir, a.up);
    // world rotation = (desired frame) * (rest frame)^-1 * (rest world rotation)
    const worldQ = want.clone().multiply(rest[k].frame.clone().invert()).multiply(rest[k].q);
    const bone = spine[k], parent = bone.parent;
    parent.getWorldQuaternion(parentQ);
    bone.quaternion.copy(parentQ.clone().invert().multiply(worldQ));
    if (k === 0) bone.position.copy(parent.worldToLocal(a.p.clone()));
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
    $('camWrap').hidden = false; camBtn.hidden = true;
    status('舉起手，用食指指揮龍珠');
    const dot = $('tipDot');
    let lastVideoTime = -1;
    const track = () => {
      if (video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        const res = hands.detectForVideo(video, performance.now());
        const lm = res.landmarks && res.landmarks[0];
        if (lm) {
          const tipLm = lm[8];                       // landmark 8 = index finger tip
          const x = 1 - tipLm.x, y = tipLm.y;        // mirror like a selfie
          setTargetFromNdc((x - 0.5) * 2.4, -(y - 0.5) * 2.4);   // a little gain so the edges are reachable
          lastHandTime = performance.now(); pointerActive = false;
          dot.hidden = false; dot.style.left = (x * 100) + '%'; dot.style.top = (y * 100) + '%';
        } else dot.hidden = true;
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
