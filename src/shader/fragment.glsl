uniform vec3 camPos;
uniform vec3 camDir;
varying vec2 vUv;
uniform float aspect;
uniform sampler2D accumTexture;
uniform int frame;

// --- Передаваемые из JS параметры объектов ---
uniform int sphereCount;
uniform vec3 spherePositions[8];
uniform float sphereRadii[8];
uniform vec3 sphereColors[8];
uniform float sphereRoughness[8];
uniform float sphereEmission[8];

uniform int boxCount;
uniform vec3 boxPositions[8];
uniform float boxSizes[8];
uniform vec3 boxColors[8];
uniform float boxRoughness[8];
uniform float boxEmission[8];

uniform int checkeredFloor;

// --- Пересечение сферы ---
float raySphereIntersect(vec3 r0, vec3 rd, vec3 sc, float sr) {
    vec3 oc = r0 - sc;
    float b = dot(oc, rd);
    float c = dot(oc, oc) - sr * sr;
    float h = b * b - c;
    if(h < 0.0)
        return -1.0;
    float sqrtH = sqrt(h);
    float t1 = -b - sqrtH;
    float t2 = -b + sqrtH;
    if(t1 > 1e-4) return t1;
    if(t2 > 1e-4) return t2;
    return -1.0;
}

// --- Пересечение куба (AABB) ---
float rayBoxIntersect(vec3 ro, vec3 rd, vec3 boxMin, vec3 boxMax) {
  vec3 tMin = (boxMin - ro) / rd;
  vec3 tMax = (boxMax - ro) / rd;
  vec3 t1 = min(tMin, tMax);
  vec3 t2 = max(tMin, tMax);
  float tNear = max(max(t1.x, t1.y), t1.z);
  float tFar = min(min(t2.x, t2.y), t2.z);
  if(tNear > tFar || tFar < 0.0)
    return -1.0;
  return tNear > 0.0 ? tNear : tFar;
}

// --- Пересечение плоскости y=planeY ---
float rayPlaneIntersect(vec3 ro, vec3 rd, float planeY) {
  if(abs(rd.y) < 1e-5)
    return -1.0;
  float t = (planeY - ro.y) / rd.y;
  return t > 0.0 ? t : -1.0;
}

// --- Нормаль к кубу (AABB) ---
vec3 boxNormal(vec3 p, vec3 boxMin, vec3 boxMax) {
  float eps = 1e-4;
  if(abs(p.x - boxMin.x) < eps)
    return vec3(-1, 0, 0);
  if(abs(p.x - boxMax.x) < eps)
    return vec3(1, 0, 0);
  if(abs(p.y - boxMin.y) < eps)
    return vec3(0, -1, 0);
  if(abs(p.y - boxMax.y) < eps)
    return vec3(0, 1, 0);
  if(abs(p.z - boxMin.z) < eps)
    return vec3(0, 0, -1);
  if(abs(p.z - boxMax.z) < eps)
    return vec3(0, 0, 1);
  return vec3(0, 1, 0);
}

// --- Нормаль к сфере ---
vec3 sphereNormal(vec3 p, vec3 center) {
  return normalize(p - center);
}

// --- Нормаль к плоскости y=planeY ---
vec3 planeNormal() {
  return vec3(0, 1, 0);
}

// --- Вспомогательная функция для случайного направления (матовое отражение) ---
float rand(vec2 co, float seed) {
    return fract(sin(dot(co.xy, vec2(12.9898,78.233)) + seed) * 43758.5453);
}

// Генерируем случайный вектор в полусфере вокруг normal
vec3 randomHemisphere(vec3 normal, vec2 seed, float frameSeed) {
    float u = rand(seed, frameSeed);
    float v = rand(seed * 1.3 + 0.7, frameSeed + 13.0);
    float theta = 2.0 * 3.1415926 * u;
    float phi = acos(2.0 * v - 1.0) * 0.5; // только полусфера
    float x = sin(phi) * cos(theta);
    float y = sin(phi) * sin(theta);
    float z = cos(phi);
    vec3 tangent = normalize(abs(normal.x) > 0.1 ? cross(normal, vec3(0,1,0)) : cross(normal, vec3(1,0,0)));
    vec3 bitangent = cross(normal, tangent);
    return normalize(x * tangent + y * bitangent + z * normal);
}

// --- Структура объекта сцены ---
struct Hit {
  float t;
  vec3 color;
  vec3 normal;
  int type; // 1 - sphere, 2 - box, 3 - plane
  float roughness;
  float emission;
};

// --- Поиск ближайшего пересечения ---
Hit sceneIntersect(vec3 ro, vec3 rd) {
  Hit hit;
  hit.t = 1e20;
  hit.type = 0;
  hit.roughness = 0.0;
  hit.color = vec3(1.0);
  hit.emission = 0.0;

  // --- Сферы ---
  for(int i = 0; i < 8; i++) {
    if(i >= sphereCount) break;
    float t = raySphereIntersect(ro, rd, spherePositions[i], sphereRadii[i]);
    if(t > 0.0 && t < hit.t) {
      hit.t = t;
      vec3 p = ro + rd * t;
      hit.normal = sphereNormal(p, spherePositions[i]);
      hit.color = sphereColors[i];
      hit.type = 1;
      hit.roughness = sphereRoughness[i];
      hit.emission = sphereEmission[i];
    }
  }

  // --- Кубы ---
  for(int i = 0; i < 8; i++) {
    if(i >= boxCount) break;
    vec3 boxMin = boxPositions[i] - vec3(1.0) * boxSizes[i];
    vec3 boxMax = boxPositions[i] + vec3(1.0) * boxSizes[i];
    float t = rayBoxIntersect(ro, rd, boxMin, boxMax);
    if(t > 0.0 && t < hit.t) {
      hit.t = t;
      vec3 p = ro + rd * t;
      hit.normal = boxNormal(p, boxMin, boxMax);
      hit.color = boxColors[i];
      hit.type = 2;
      hit.roughness = boxRoughness[i];
      hit.emission = boxEmission[i];
    }
  }

  // --- Плоскость y = 0 ---
  float tPlane = rayPlaneIntersect(ro, rd, 0.0);
  if(tPlane > 0.0 && tPlane < hit.t) {
    hit.t = tPlane;
    hit.normal = planeNormal();
    if(checkeredFloor == 1) {
      float checker = mod(floor((ro.x + rd.x * tPlane) * 2.0) + floor((ro.z + rd.z * tPlane) * 2.0), 2.0);
      hit.color = mix(vec3(0.8), vec3(0.2), checker);
    } else {
      hit.color = vec3(0.2, 0.2, 0.2);
    }
    hit.type = 3;
    hit.roughness = 1.0;
    hit.emission = 0.0;
  }

  return hit;
}

// --- Параметры солнца ---
const vec3 sunDir = normalize(vec3(-0.5, 1.0, -0.3));
const vec3 sunColor = vec3(1.2, 1.1, 0.9);
const float sunIntensity = 2.0;
const vec3 skyColor = vec3(0.07, 0.1, 0.16);

// --- Проверка, освещена ли точка солнцем (shadow ray) ---
bool isLitBySun(vec3 p, vec3 n) {
    vec3 shadowOrigin = p + n * 1e-3;
    Hit shadowHit = sceneIntersect(shadowOrigin, sunDir);
    return shadowHit.type == 0;
}

void main() {
  vec3 rayOrigin = camPos;
  vec2 uv = vUv * 2.0 - 1.0;
  uv.x *= aspect;
  vec3 up = vec3(0.0, 1.0, 0.0);
  vec3 right = normalize(cross(camDir, up));
  up = normalize(cross(right, camDir));
  float fov = 1.0;
  vec3 rayDir = normalize(camDir +
    right * uv.x * fov +
    up * uv.y * fov);

  vec3 color = vec3(1.0);
  vec3 ro = rayOrigin;
  vec3 rd = rayDir;

  for(int bounce = 0; bounce < 10; bounce++) {
    Hit hit = sceneIntersect(ro, rd);

    // Светящийся объект
    if(hit.emission > 0.0) {
      color *= hit.color * hit.emission;
      break;
    }

    if(hit.type == 0) {
      float sunAmount = max(dot(rd, sunDir), 0.0);
      float sunDisk = smoothstep(0.9995, 1.0, sunAmount);
      color *= (skyColor + sunColor * sunIntensity * sunDisk);
      break;
    }

    // --- Прямое освещение от солнца ---
    float sunDiffuse = max(dot(hit.normal, sunDir), 0.0);
    float sunShadow = isLitBySun(ro + rd * hit.t, hit.normal) ? 1.0 : 0.0;
    vec3 directLight = sunColor * sunIntensity * sunDiffuse * sunShadow;

    // --- Окружение (небо) ---
    vec3 envLight = skyColor;

    // Итоговый свет
    vec3 surfaceLight = directLight + envLight;

    color *= hit.color * surfaceLight;

    ro = ro + rd * (hit.t - 1e-4);

    float rough = clamp(hit.roughness, 0.0, 1.0);
    vec3 refl = reflect(rd, hit.normal);
    vec3 diffuse = randomHemisphere(hit.normal, ro.xz + float(bounce) * 17.0 + vUv * 13.0, float(frame) + float(bounce) * 31.0);
    rd = normalize(mix(refl, diffuse, rough));
  }

  color = pow(color, vec3(1.0 / 2.2));
  vec3 prev = texture2D(accumTexture, vUv).rgb;
  if (frame > 0) {
    color = mix(color, prev, 0.9);
  }
  gl_FragColor = vec4(color, 1.0);
}