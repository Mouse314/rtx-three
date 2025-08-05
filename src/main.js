import * as THREE from 'three';
import Stats from 'stats.js';
import * as dat from 'dat.gui';

import vertexShader from './shader/vertex.glsl?raw';
import fragmentShader from './shader/fragment.glsl?raw';

// --- dat.GUI параметры сцены и объектов ---
const params = {
  checkeredFloor: true,
  objects: [
    {
      type: 'sphere',
      position: [0, 0.5, 0],
      radius: 0.5,
      color: [1, 0.8, 0.2],
      roughness: 0.0,
      emission: 0.0
    },
    {
      type: 'sphere',
      position: [-1.5, 0.3, 1.0],
      radius: 0.3,
      color: [0.2, 0.6, 1.0],
      roughness: 0.7,
      emission: 0.0
    },
    {
      type: 'box',
      position: [1.5, 0.2, 1.5],
      size: 0.4,
      color: [0.2, 1.0, 0.4],
      roughness: 1.0,
      emission: 0.0
    }
  ]
};

// --- dat.GUI меню ---
const gui = new dat.GUI();
gui.add(params, 'checkeredFloor').name('Клеточный пол');
params.objects.forEach((obj, i) => {
  const folder = gui.addFolder(`Объект ${i + 1} (${obj.type})`);
  folder.addColor(obj, 'color').name('Цвет');
  folder.add(obj, 'roughness', 0, 1).name('Шероховатость');
  folder.add(obj, 'emission', 0, 10).name('Светимость');
  folder.open();
});

// --- Three.js сцена и камера ---
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const aspect = window.innerWidth / window.innerHeight;
const planeGeometry = new THREE.PlaneGeometry(2, 2);

// --- Виртуальная камера для трассировки ---
let camPos = new THREE.Vector3(0, 1, -2);
let camYaw = 0;
let camPitch = 0;

// --- uniforms для передачи объектов ---
const MAX_SPHERES = 8;
const MAX_BOXES = 8;

const planeMaterial = new THREE.ShaderMaterial({
  vertexShader: vertexShader,
  fragmentShader: fragmentShader,
  uniforms: {
    camPos: { value: camPos.toArray() },
    camDir: { value: [1, 0, 0] },
    aspect: { value: aspect },
    accumTexture: { value: null },
    frame: { value: 0 },
    checkeredFloor: { value: params.checkeredFloor ? 1 : 0 },
    sphereCount: { value: 0 },
    spherePositions: { value: new Float32Array(MAX_SPHERES).fill([0.0,0.0,0.0]) },
    sphereRadii: { value: new Float32Array(MAX_SPHERES).fill(0.0) },
    sphereColors: { value: new Float32Array(MAX_SPHERES).fill([1.0,1.0,1.0]) },
    sphereRoughness: { value: new Float32Array(MAX_SPHERES).fill(0.0) },
    sphereEmission: { value: new Float32Array(MAX_SPHERES).fill(0.0) },
    boxCount: { value: 0 },
    boxPositions: { value: new Float32Array(MAX_BOXES).fill([0.0,0.0,0.0]) },
    boxSizes: { value: new Float32Array(MAX_BOXES).fill(0.0) },
    boxColors: { value: new Float32Array(MAX_BOXES).fill([1.0,1.0,1.0]) },
    boxRoughness: { value: new Float32Array(MAX_BOXES).fill(0.0) },
    boxEmission: { value: new Float32Array(MAX_BOXES).fill(0.0) }
  }
});

// --- Вспомогательная функция для flatten vec3 массивов ---
function flattenVec3Array(arr, maxCount) {
  // arr: [[x,y,z], ...]
  // maxCount: сколько всего элементов должно быть (дополняет нулями)
  const flat = [];
  for (let i = 0; i < maxCount; i++) {
    const v = arr[i] || [0, 0, 0];
    flat.push(v[0], v[1], v[2]);
  }
  return new Float32Array(flat);
}

// --- Вспомогательная функция для flatten цветов (vec3) ---
function flattenColorArray(arr, maxCount) {
  // arr: [[r,g,b], ...]
  // maxCount: сколько всего элементов должно быть (дополняет белым)
  const flat = [];
  for (let i = 0; i < maxCount; i++) {
    const v = arr[i] || [1, 1, 1];
    flat.push(v[0], v[1], v[2]);
  }
  return new Float32Array(flat);
}

// --- Передача объектов в шейдер ---
function updateShaderObjects() {
  const spheres = params.objects.filter(o => o.type === 'sphere').slice(0, MAX_SPHERES);
  const boxes = params.objects.filter(o => o.type === 'box').slice(0, MAX_BOXES);

  planeMaterial.uniforms.sphereCount.value = spheres.length;
  planeMaterial.uniforms.spherePositions.value = flattenVec3Array(spheres.map(s => s.position), MAX_SPHERES);
  planeMaterial.uniforms.sphereRadii.value = new Float32Array(spheres.map(s => s.radius).concat(Array(MAX_SPHERES - spheres.length).fill(0)));
  planeMaterial.uniforms.sphereColors.value = flattenColorArray(spheres.map(s => s.color), MAX_SPHERES);
  planeMaterial.uniforms.sphereRoughness.value = new Float32Array(spheres.map(s => s.roughness).concat(Array(MAX_SPHERES - spheres.length).fill(0)));
  planeMaterial.uniforms.sphereEmission.value = new Float32Array(spheres.map(s => s.emission).concat(Array(MAX_SPHERES - spheres.length).fill(0)));

  planeMaterial.uniforms.boxCount.value = boxes.length;
  planeMaterial.uniforms.boxPositions.value = flattenVec3Array(boxes.map(b => b.position), MAX_BOXES);
  planeMaterial.uniforms.boxSizes.value = new Float32Array(boxes.map(b => b.size).concat(Array(MAX_BOXES - boxes.length).fill(0)));
  planeMaterial.uniforms.boxColors.value = flattenColorArray(boxes.map(b => b.color), MAX_BOXES);
  planeMaterial.uniforms.boxRoughness.value = new Float32Array(boxes.map(b => b.roughness).concat(Array(MAX_BOXES - boxes.length).fill(0)));
  planeMaterial.uniforms.boxEmission.value = new Float32Array(boxes.map(b => b.emission).concat(Array(MAX_BOXES - boxes.length).fill(0)));

  planeMaterial.uniforms.checkeredFloor.value = params.checkeredFloor ? 1 : 0;
}

// --- GUI обновление ---
params.objects.forEach((obj, i) => {
  gui.__folders[`Объект ${i + 1} (${obj.type})`].__controllers.forEach(ctrl => {
    ctrl.onChange(updateShaderObjects);
  });
});

// --- Плоскость для трассировки ---
const plane = new THREE.Mesh(planeGeometry, planeMaterial);
plane.position.set(0, 0, 0);
scene.add(plane);

// --- Два рендер-таргета для аккумулирования ---
const accumTargetA = new THREE.WebGLRenderTarget(window.innerWidth * 2, window.innerHeight * 2);
const accumTargetB = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight);
let accumRead = accumTargetA;
let accumWrite = accumTargetB;

// --- Плоскость для вывода аккумулированного результата на экран ---
const screenMaterial = new THREE.MeshBasicMaterial({ map: accumRead.texture });
const screenPlane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), screenMaterial);
const screenScene = new THREE.Scene();
screenScene.add(screenPlane);
const screenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

// --- FPS через stats.js ---
const stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

// --- Управление камерой ---
const keys = {};
window.addEventListener('keydown', (e) => { keys[e.code] = true; });
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

let isDragging = false;
let lastX = 0, lastY = 0;
renderer.domElement.addEventListener('mousedown', (e) => {
  isDragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
});
window.addEventListener('mouseup', () => { isDragging = false; });
window.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  camYaw += dx * 0.003;
  camPitch += dy * 0.003;
  camPitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camPitch));
});

// --- Счетчик кадров для аккумулирования ---
let frameCounter = 0;
let lastCamPos = camPos.clone();
let lastCamDir = new THREE.Vector3(1, 0, 0);

// --- Обновление позиции и направления виртуальной камеры ---
function updateCamera() {
  const dir = new THREE.Vector3(
    Math.cos(camPitch) * Math.sin(camYaw),
    Math.sin(camPitch),
    Math.cos(camPitch) * Math.cos(camYaw)
  );
  const speed = 0.01;
  const forward = new THREE.Vector3(dir.x, 0, dir.z).normalize();
  const right = new THREE.Vector3(-dir.z, 0, dir.x).normalize();

  if (keys['KeyW']) camPos.addScaledVector(forward, speed);
  if (keys['KeyS']) camPos.addScaledVector(forward, -speed);
  if (keys['KeyA']) camPos.addScaledVector(right, -speed);
  if (keys['KeyD']) camPos.addScaledVector(right, speed);
  if (keys['KeyQ']) camPos.y -= speed;
  if (keys['KeyE']) camPos.y += speed;

  if (!camPos.equals(lastCamPos) || !dir.equals(lastCamDir)) {
    frameCounter = 0;
    lastCamPos.copy(camPos);
    lastCamDir.copy(dir);
  }

  planeMaterial.uniforms.camPos.value = camPos.toArray();
  planeMaterial.uniforms.camDir.value = dir.toArray();
  planeMaterial.uniforms.frame.value = frameCounter;
}

// --- Pointer Lock API для FPC управления ---
renderer.domElement.addEventListener('click', () => {
  renderer.domElement.requestPointerLock();
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === renderer.domElement) {
    document.addEventListener('mousemove', onMouseMove, false);
  } else {
    document.removeEventListener('mousemove', onMouseMove, false);
  }
});
function onMouseMove(e) {
  const sensitivity = 0.0015;
  camYaw -= e.movementX * sensitivity;
  camPitch -= e.movementY * sensitivity;
  camPitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camPitch));
}

// --- Основной рендер-цикл ---
function animate() {
  stats.begin();

  updateCamera();

  // Передаём текстуру предыдущего кадра
  planeMaterial.uniforms.accumTexture.value = accumRead.texture;

  // Передаём объекты в шейдер
  updateShaderObjects();

  // Рендерим трассировочную сцену в другой таргет
  renderer.setRenderTarget(accumWrite);
  renderer.clearColor();
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);

  // Показываем аккумулированный результат на экране
  screenMaterial.map = accumWrite.texture;
  screenMaterial.needsUpdate = true;
  renderer.render(screenScene, screenCamera);

  // Меняем местами таргеты
  let temp = accumRead;
  accumRead = accumWrite;
  accumWrite = temp;

  if (frameCounter < 1) {
    renderer.setRenderTarget(accumWrite);
    renderer.clearColor();
    renderer.setRenderTarget(null);
  }

  frameCounter++;
  stats.end();
  requestAnimationFrame(animate);
}

// --- Обработка изменения размера окна ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  planeMaterial.uniforms.aspect.value = window.innerWidth / window.innerHeight;

  accumTargetA.setSize(window.innerWidth * 2, window.innerHeight * 2);
  accumTargetB.setSize(window.innerWidth, window.innerHeight);
});

animate();