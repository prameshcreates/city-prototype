import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const out = resolve(process.argv[2] || 'verify-out');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${JSON.stringify(detail)}`);
};
const g = (expr) => page.evaluate(expr);
const wait = (ms) => page.waitForTimeout(ms);
const hold = async (keysDown, ms) => {
  for (const k of keysDown) await page.keyboard.down(k);
  await wait(ms);
  for (const k of keysDown) await page.keyboard.up(k);
};

await page.goto(pathToFileURL(resolve('index.html')).href);
await page.waitForFunction(() => window.__city && window.__city.frames > 30, null, { timeout: 60000 });
console.log('renderer:', await g(() => window.__city.renderer()));
await page.mouse.click(640, 360);
await wait(500);

// 1. on foot: hold W 3s
const p0 = await g(() => window.__city.player());
await hold(['KeyW'], 3000);
const p1 = await g(() => window.__city.player());
const walked = Math.hypot(p1.x - p0.x, p1.z - p0.z);
check('on foot: W 3s moves player', walked > 3, { walked: +walked.toFixed(2) });

// walk out into the street toward car 0, screenshot on foot
const walkTo = async (target, stopAt, timeout = 20000) => {
  const t0 = Date.now();
  await page.keyboard.down('KeyW');
  while (Date.now() - t0 < timeout) {
    const p = await g(() => window.__city.player());
    const t = typeof target === 'function' ? await target() : target;
    const dx = t.x - p.x, dz = t.z - p.z;
    if (Math.hypot(dx, dz) < stopAt) break;
    await page.evaluate((y) => window.__city.setCameraYaw(y), Math.atan2(-dx, -dz));
    await wait(80);
  }
  await page.keyboard.up('KeyW');
};
const car0 = async () => (await g(() => window.__city.cars()))[0];
const c0 = await car0();
await walkTo({ x: c0.x + 2.6, z: c0.z + 4 }, 0.8);
await wait(300);
await page.evaluate((y) => window.__city.setCameraYaw(y), Math.PI * 0.75);
await wait(600);
await page.screenshot({ path: `${out}/1-on-foot.png` });

// 2. walk to car, press E
await walkTo(car0, 2.9);
await page.keyboard.press('KeyE');
await wait(300);
const state = await g(() => window.__city.state);
check('walk to car + E -> driving', state === 'driving', { state, car: await g(() => window.__city.activeCar()) });

// 3. hold W 3s -> speed > 20 km/h
await wait(800);
await page.keyboard.down('KeyW');
await wait(2500);
await page.screenshot({ path: `${out}/2-chase-cam.png` });
await wait(500);
const kmh = (await car0()).kmh;
check('driving: W 3s -> speed > 20 km/h', kmh > 20, { kmh: +kmh.toFixed(1) });

// 4. steer into a wall
const before = (await g(() => window.__city.collisions.length));
await page.keyboard.down('KeyD');
let hit = null, stuckSince = null, retries = 0;
const t0 = Date.now();
while (Date.now() - t0 < 20000) {
  hit = await g((n) => window.__city.collisions.slice(n).find((c) => c.with === 'building'), before);
  if (hit) break;
  const slow = Math.abs((await car0()).kmh) < 3;
  stuckSince = slow ? stuckSince ?? Date.now() : null;
  if (stuckSince && Date.now() - stuckSince > 800) {
    retries++;
    await page.keyboard.up('KeyW');
    await page.keyboard.up('KeyD');
    await hold(['KeyS', 'KeyA'], 1200);
    await page.keyboard.down('KeyW');
    await page.keyboard.down('KeyD');
    stuckSince = null;
  }
  await wait(30);
}
console.log(`crash attempt: retries after getting stuck on props = ${retries}`);
if (hit) await page.screenshot({ path: `${out}/3-crash.png` });
let inside = false;
for (let i = 0; i < 20; i++) {
  inside ||= await g(() => window.__city.carInsideBuilding());
  await wait(75);
}
await page.keyboard.up('KeyD');
await page.keyboard.up('KeyW');
const others = await g((n) => window.__city.collisions.slice(n).map((c) => c.with), before);
check('steer into wall -> building collision registered', !!hit, { impactKmh: hit ? +(hit.speed * 3.6).toFixed(1) : null, contacts: [...new Set(others)] });
check('car does not pass through building', !!hit && !inside, { insideBuildingDuring1_5s: inside, car: await car0() });

// 5. exit
await wait(1500);
await page.keyboard.press('KeyE');
await wait(300);
const exitState = await g(() => window.__city.state);
const overlaps = await g(() => window.__city.playerOverlaps());
const pe = await g(() => window.__city.player());
const ce = await car0();
check('E exits: player outside car, no overlap', exitState === 'on_foot' && !overlaps, {
  state: exitState, overlaps, distFromCar: +Math.hypot(pe.x - ce.x, pe.z - ce.z).toFixed(2),
});

// 6. fps over 10s of driving
await page.keyboard.press('KeyE');
await wait(300);
await hold(['KeyS'], 1500);
const f0 = await g(() => ({ f: window.__city.frames, t: performance.now() }));
await page.keyboard.down('KeyW');
for (let i = 0; i < 10; i++) {
  const k = i % 4 < 2 ? 'KeyA' : 'KeyD';
  await hold([k], 500);
  await wait(500);
}
await page.keyboard.up('KeyW');
const f1 = await g(() => ({ f: window.__city.frames, t: performance.now() }));
const fps = ((f1.f - f0.f) / (f1.t - f0.t)) * 1000;
console.log(`fps (headless, 10s driving): ${fps.toFixed(1)}`);

console.log(`console errors: ${errors.length}`);
for (const e of errors) console.log('  ERROR:', e);
writeFileSync(`${out}/results.json`, JSON.stringify({ results, fps, errors }, null, 2));
await browser.close();
process.exit(results.every((r) => r.pass) && errors.length === 0 ? 0 : 1);
