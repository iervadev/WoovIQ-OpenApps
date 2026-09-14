import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imagePoint, median, torsoWidth, summarize, analyzeBody } from '../measurements.mjs';

test('portrait preview maps marker taps through letterboxing and mirrors correctly', () => {
  const rect = { left: 0, top: 0, width: 400, height: 700 };
  assert.equal(imagePoint(200, 20, rect, 1280, 720), null);
  assert.deepEqual(imagePoint(100, 350, rect, 1280, 720), { x: 320, y: 360 });
  assert.deepEqual(imagePoint(100, 350, rect, 1280, 720, true), { x: 960, y: 360 });
  const a = imagePoint(200, 330, rect, 1280, 720);
  const b = imagePoint(200, 370, rect, 1280, 720);
  assert.equal(b.y - a.y, 128);
});
test('missing dimensions remain missing instead of becoming zero', () => {
  assert.equal(median([null, undefined, NaN, 0, -1]), null);
  assert.equal(median([20, 40, 30, 10]), 25);
  assert.throws(() => summarize([], []));
  assert.throws(() => summarize(Array(8).fill({}), Array(8).fill({})));
});
test('segmentation measures torso and excludes disconnected arms/background', () => {
  const mask = { width: 100, height: 100, data: new Float32Array(10000) };
  for (let y = 20; y < 80; y++) for (let x = 30; x < 70; x++) mask.data[y * 100 + x] = .9;
  for (let y = 20; y < 80; y++) for (let x = 5; x < 15; x++) mask.data[y * 100 + x] = .9;
  assert.equal(torsoWidth(mask, .5, .5, 1000), 400);
  assert.equal(torsoWidth(mask, .8, .5, 1000), null);
});
test('ellipse uses distinct front and side views with individual scales', () => {
  const front = Array(8).fill({ chest: 40, waist: 40, hip: 40, height: 175, scale: 1 });
  const side = Array(8).fill({ chest: 80, waist: 80, hip: 80, height: 350, scale: .5 });
  const result = summarize(front, side);
  assert.equal(result.height, 175);
  assert.ok(Math.abs(result.waist - 40 * Math.PI) < 1e-8);
});
test('partial bodies cannot create measurements', () => {
  assert.equal(analyzeBody(null, null, 100, 100), null);
  const lm = Array.from({ length: 33 }, () => ({ x: .5, y: .5, visibility: 0 }));
  assert.equal(analyzeBody(lm, { width: 10, height: 10, data: new Float32Array(100) }, 100, 100), null);
});
