import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import * as geometry from '../measurements.mjs';

function setup() {
  const elements = new Map();
  const element = () => ({
    value: '', textContent: '', disabled: false, hidden: false, style: {}, handlers: {},
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener(name, callback) { this.handlers[name] = callback; },
    replaceChildren(...children) { this.children = children; }, append() {},
    getContext() { return {}; },
    videoWidth: 1280, videoHeight: 720,
    play: async () => {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 700 })
  });
  const document = { querySelector(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); }, createElement: element };
  let now = 1000, rafCount = 0, stopped = 0;
  const track = { stop() { stopped++; }, getSettings: () => ({ facingMode: 'user' }), addEventListener() {} };
  const fakeStream = { getTracks: () => [track], getVideoTracks: () => [track] };
  const context = vm.createContext({ ...geometry, document, navigator: { mediaDevices: { getUserMedia: async () => fakeStream } }, window: { isSecureContext: true, addEventListener() {} }, performance: { now: () => now }, requestAnimationFrame: () => ++rafCount, cancelAnimationFrame() {} });
  const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8').replace(/^import .*;\n/, '').replace('updateControls(); initEngine();', 'updateControls();');
  vm.runInContext(source, context);
  const run = code => vm.runInContext(code, context);
  const click = id => elements.get(id).handlers.click();
  return { elements, run, click, setTime(n) { now = n; }, rafCount: () => rafCount, stopped: () => stopped };
}
test('scan button explains missing prerequisites rather than silently doing nothing', async () => {
  const app = setup();
  assert.equal(app.elements.get('#scan').disabled, false);
  app.click('#scan'); assert.match(app.elements.get('#hint').textContent, /Avvia fotocamera/);
  await app.click('#start');
  app.run('engine = {}');
  app.click('#scan'); assert.match(app.elements.get('#hint').textContent, /altezza misurata/);
  app.elements.get('#knownHeight').value = '175';
  app.click('#scan'); assert.match(app.elements.get('#hint').textContent, /Corpo incompleto/);
});
test('eight distinct stable frames per view complete the scan and permit restart', async () => {
  const app = setup(); await app.click('#start'); app.run('engine = {}');
  app.elements.get('#knownHeight').value = '175';
  const feed = (now, shoulder, chest = 240) => {
    app.setTime(now);
    app.run(`body = { height: 600, shoulder: ${shoulder}, chest: ${chest}, waist: 200, hip: 230 }; lastValidAt = ${now};`);
  };
  feed(1000, .2); app.click('#scan');
  for (let i = 0; i < 8; i++) { feed(1000 + i * 300, .2); app.run(`captureFrame(${1000 + i * 300})`); }
  assert.equal(app.run('phase'), 'side');
  assert.equal(app.elements.get('#scan').disabled, false);
  app.click('#scan');
  for (let i = 0; i < 8; i++) { feed(4000 + i * 300, .2); app.run(`captureFrame(${4000 + i * 300})`); }
  assert.equal(app.run('side.length'), 0, 'frontal images cannot substitute for side images');
  for (let i = 0; i < 8; i++) { feed(7000 + i * 300, .08, 160); app.run(`captureFrame(${7000 + i * 300})`); }
  assert.equal(app.run('phase'), 'result');
  assert.equal(app.elements.get('#metrics').children.length, 4);
  assert.equal(app.elements.get('#scan').disabled, false);
  app.click('#scan'); assert.equal(app.run('front.length'), 0);
});
test('camera switch stops the old stream and invalidates calibration, captures and video timestamp', async () => {
  const app = setup(); await app.click('#start');
  app.run('markerScale = .2; front = [{height: 500}]; capture = {view: "front"}; lastVideoTime = 50;');
  await app.run('startCamera()');
  assert.equal(app.stopped(), 1);
  assert.equal(app.run('markerScale'), null);
  assert.equal(app.run('front.length'), 0);
  assert.equal(app.run('capture'), null);
  assert.equal(app.run('lastVideoTime'), -1);
});
test('timeout clears partial samples and leaves a retry path', async () => {
  const app = setup(); await app.click('#start');
  app.run('capture = {view: "front", started: 0}; front = [{height: 500}];');
  app.run('captureFrame(21000)');
  assert.equal(app.run('front.length'), 0);
  assert.equal(app.run('capture'), null);
  assert.equal(app.elements.get('#scan').disabled, false);
});
