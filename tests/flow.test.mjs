import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import * as geometry from '../measurements.mjs';
import * as scan from '../scan360.mjs';
import { reconstruct } from '../reconstruction.mjs';
import { phantomViews } from './fixtures.mjs';
import { VoiceGuide } from '../voice-guide.mjs';

const fixtureViews=phantomViews();
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
  const document = { querySelector(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); }, createElement: element, querySelectorAll: () => [] };
  let now = 1000, rafCount = 0, stopped = 0;
  const track = { stop() { stopped++; }, getSettings: () => ({ facingMode: 'user' }), addEventListener() {} };
  const fakeStream = { getTracks: () => [track], getVideoTracks: () => [track] };
  class FakeWorker {terminate(){} postMessage(data){this.onmessage({data:{model:reconstruct(data.views)}});}}
  class FakeViewer {setModel(){} clear(){}}
  const context = vm.createContext({ ...geometry, ...scan, fixtureViews, VoiceGuide, setTimeout, clearTimeout, Worker:FakeWorker, BodyViewer:FakeViewer, URL, document, navigator: { mediaDevices: { getUserMedia: async () => fakeStream } }, window: { isSecureContext: true, addEventListener() {} }, performance: { now: () => now }, requestAnimationFrame: () => ++rafCount, cancelAnimationFrame() {} });
  const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace('import.meta.url', '"http://localhost/app.js"').replace('updateControls(); initEngine();', 'updateControls();');
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
  app.click('#scan'); assert.match(app.elements.get('#hint').textContent, /Calibra 10 cm/);
  app.run('markerScale = .25');
  app.click('#scan'); assert.match(app.elements.get('#hint').textContent, /Corpo incompleto/);
});
test('scan starts from calibration without typed height, and cancel leaves a retry path', async () => {
  const app=setup();await app.click('#start');
  app.run('engine={};markerScale=.25;body={height:700};lastValidAt=1000;');
  app.click('#scan');assert.equal(app.run('phase'),'scan');assert.equal(app.elements.get('#scan').disabled,true);
  app.click('#cancel');assert.equal(app.run('capture'),null);assert.equal(app.elements.get('#scan').disabled,false);
});
test('camera switch stops the old stream and invalidates calibration, captures and video timestamp', async () => {
  const app = setup(); await app.click('#start');
  app.run('markerScale = .2; capture = new Scan360(.2); lastVideoTime = 50;');
  await app.run('startCamera()');
  assert.equal(app.stopped(), 1);
  assert.equal(app.run('markerScale'), null);
  assert.equal(app.run('currentFrame'), null);
  assert.equal(app.run('capture'), null);
  assert.equal(app.run('lastVideoTime'), -1);
});
test('timeout discards incomplete rotation and leaves a retry path', async () => {
  const app=setup();await app.click('#start');
  app.run('capture=new Scan360(.25);capture.started=0;');
  app.run('captureFrame(190000)');
  assert.equal(app.run('capture'),null);assert.equal(app.elements.get('#scan').disabled,false);
});

test('camera controller completes all eight views, worker reconstruction and result rendering', async()=>{
  const app=setup();await app.click('#start');
  app.run('engine={};markerScale=.25;body={height:700};lastValidAt=1000;');app.click('#scan');
  for(let i=0;i<=8;i++)for(let j=0;j<4;j++){
    const now=1000+i*2000+j*300;app.setTime(now);
    app.run(`body={height:700,centerX:500,bottomMask:190,maskHeight:200,shoulder:.2,levels:{chest:.28,waist:.4,hip:.51}};lastValidAt=${now};inferenceId++;currentFrame={body,angle:wrapAngle(${i}*Math.PI/4),frontFacing:${i===0||i===8},mask:fixtureViews[${i%8}].mask};captureFrame(${now});`);
  }
  assert.equal(app.run('phase'),'result',app.elements.get('#hint').textContent);assert.equal(app.elements.get('#metrics').children.length,4);
  assert.equal(app.run('model.views'),8);assert.equal(app.elements.get('#scan').disabled,false);
});
