// All geometry stays in unmirrored camera pixels; CSS only mirrors the preview.
export const median = values => {
  const sorted = values.filter(v => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  const i = Math.floor(sorted.length / 2);
  return sorted.length ? (sorted.length % 2 ? sorted[i] : (sorted[i - 1] + sorted[i]) / 2) : null;
};

export function imagePoint(clientX, clientY, rect, width, height, mirror = false) {
  const scale = Math.min(rect.width / width, rect.height / height);
  const x = (clientX - rect.left - (rect.width - width * scale) / 2) / scale;
  const y = (clientY - rect.top - (rect.height - height * scale) / 2) / scale;
  if (x < 0 || y < 0 || x > width || y > height) return null;
  return { x: mirror ? width - x : x, y };
}

// Select the connected foreground interval at the torso centre, excluding arms
// and background objects outside that interval. Mask values are probabilities.
export function torsoWidth(mask, xNorm, yNorm, imageWidth) {
  const { data, width, height } = mask;
  const x = Math.round(xNorm * (width - 1));
  const y = Math.round(yNorm * (height - 1));
  if (x < 1 || x >= width - 1 || y < 1 || y >= height - 1) return null;
  const widths = [];
  for (let row = Math.max(0, y - 2); row <= Math.min(height - 1, y + 2); row++) {
    const on = col => data[row * width + col] >= 0.65;
    if (!on(x)) continue;
    let left = x, right = x;
    while (left > 0 && on(left - 1)) left--;
    while (right < width - 1 && on(right + 1)) right++;
    if (left === 0 || right === width - 1 || right - left < 3) continue;
    widths.push((right - left + 1) * imageWidth / width);
  }
  return widths.length >= 3 ? median(widths) : null;
}

export function analyzeBody(lm, mask, width, height) {
  const visible = i => lm[i] && (lm[i].visibility ?? 0) > 0.5 &&
    lm[i].x > 0.02 && lm[i].x < 0.98 && lm[i].y > 0.02 && lm[i].y < 0.98;
  if (!lm || !mask || ![[11,12],[23,24],[25,26],[27,28],[31,32]].every(pair => pair.some(visible))) return null;
  let top = -1, bottom = -1;
  for (let y = 0; y < mask.height; y++) {
    let count = 0;
    for (let x = 0; x < mask.width; x++) if (mask.data[y * mask.width + x] >= 0.65) count++;
    if (count >= 4) { if (top < 0) top = y; bottom = y; }
  }
  if (top <= 1 || bottom >= mask.height - 2 || bottom <= top) return null;
  const bodyHeight = (bottom - top + 1) * height / mask.height;
  if (bodyHeight < height * 0.4) return null;
  const sy = (lm[11].y + lm[12].y) / 2, hy = (lm[23].y + lm[24].y) / 2;
  if (hy <= sy) return null;
  const sx = (lm[11].x + lm[12].x) / 2, hx = (lm[23].x + lm[24].x) / 2;
  const straightLeg = (hip,knee,ankle) => {
    if (![hip,knee,ankle].every(visible)) return true;
    const a={x:(lm[hip].x-lm[knee].x)*width,y:(lm[hip].y-lm[knee].y)*height};
    const b={x:(lm[ankle].x-lm[knee].x)*width,y:(lm[ankle].y-lm[knee].y)*height};
    const denominator=Math.hypot(a.x,a.y)*Math.hypot(b.x,b.y);
    return denominator>0 && (a.x*b.x+a.y*b.y)/denominator < -.85;
  };
  const armsClear=[[11,13],[12,14]].every(([shoulder,elbow])=>visible(elbow) && (Math.abs(lm[elbow].x-sx)-Math.abs(lm[shoulder].x-sx))*width/bodyHeight>.035);
  const standing=straightLeg(23,25,27) && straightLeg(24,26,28) && Math.abs(sx-hx)*width/bodyHeight<.08 &&
    [15,16].every(i=>!visible(i)||lm[i].y>sy+.03);
  const chest = torsoWidth(mask, sx + (hx - sx) * .3, sy + (hy - sy) * .3, width);
  const waist = torsoWidth(mask, sx + (hx - sx) * .68, sy + (hy - sy) * .68, width);
  const hip = torsoWidth(mask, hx, hy + .015, width);
  if (![chest, waist, hip].every(v => Number.isFinite(v) && v > 0)) return null;
  return { standing, armsClear, topMask: top, bottomMask: bottom, maskHeight: mask.height, centerX: hx * width, imageWidth: width, levels: { chest: (sy + (hy-sy)*.30 - top/mask.height) * height / bodyHeight, waist: (sy + (hy-sy)*.68 - top/mask.height) * height / bodyHeight, hip: (hy + .015 - top/mask.height) * height / bodyHeight }, height: bodyHeight, shoulder: Math.abs(lm[11].x - lm[12].x) * width / bodyHeight, chest, waist, hip };
}

export function summarize(front, side) {
  if (front.length < 8 || side.length < 8) throw new Error('Servono almeno 8 campioni validi per ciascuna vista.');
  const values = {};
  for (const key of ['chest', 'waist', 'hip']) {
    const a = median(front.map(s => s[key] * s.scale));
    const b = median(side.map(s => s[key] * s.scale));
    if (a === null || b === null) throw new Error('Misure mancanti: ripeti la scansione.');
    values[key] = Math.PI * (3 * (a / 2 + b / 2) - Math.sqrt((3 * a / 2 + b / 2) * (a / 2 + 3 * b / 2)));
  }
  values.height = median([...front, ...side].map(s => s.height * s.scale));
  if (values.height === null) throw new Error('Altezza non disponibile.');
  return values;
}
