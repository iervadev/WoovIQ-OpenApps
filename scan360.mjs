import { median } from './measurements.mjs';
export const VIEW_COUNT = 8;
export const FRAMES_PER_VIEW = 4;
export const wrapAngle = value => Math.atan2(Math.sin(value), Math.cos(value));
export function poseAngle(world) {
  if (!world?.[11] || !world?.[12]) return null;
  const x = world[11].x - world[12].x, z = world[11].z - world[12].z;
  return Number.isFinite(x + z) && Math.hypot(x, z) > .12 ? Math.atan2(z, x) : null;
}

// Resample a person's silhouette into a hip-centred, height-normalized frame.
// Data remains local: only these masks, never camera photographs, are retained.
export function silhouette(mask, body) {
  const width = 128, height = 192, span = .9;
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(mask.height - 1, Math.max(0, Math.round(body.topMask + y / (height - 1) * (body.bottomMask - body.topMask))));
    for (let x = 0; x < width; x++) {
      const sx = Math.round((body.centerX + (x / (width - 1) - .5) * span * body.height) / body.imageWidth * mask.width);
      if (sx >= 0 && sx < mask.width && mask.data[sy * mask.width + sx] >= .65) data[y * width + x] = 1;
    }
  }
  return { width, height, span, data };
}

export class Scan360 {
  constructor(scale) {
    if (!(scale > 0 && Number.isFinite(scale))) throw new Error('Calibrazione mancante.');
    this.scale = scale; this.views = []; this.pending = []; this.anchor = null;
    this.baseline = null; this.direction = 0; this.lastSample = -Infinity;
    this.started = null; this.complete = false;
  }
  add(frame, now) {
    if (this.complete) return { done: true };
    this.started ??= now;
    if (now - this.started > 180000) return { error: 'Tempo scaduto. Ripeti la scansione mantenendo tutte le pose richieste.' };
    if (!frame?.body || !frame.mask || !Number.isFinite(frame.angle)) return { message: 'Inquadra tutto il corpo e mantieni le gambe dritte.' };
    const b = frame.body, index = this.views.length;
    if(b.standing===false){this.pending=[];return {message:'Raddrizza le gambe e il busto; tieni le braccia basse e leggermente distanziate.'};}
    if (!this.baseline) {
      if(b.armsClear===false)return {message:'Allontana le braccia dal busto di circa 30°, mantenendole basse.'};
      if (!frame.frontFacing || b.shoulder < .14) return { message: 'Per iniziare guarda la fotocamera, con le braccia leggermente distanziate.' };
      const height = b.height * this.scale;
      if (height < 80 || height > 250) return { error: 'Altezza fuori intervallo: ripeti la calibrazione del riferimento.' };
      this.baseline = { ...b }; this.anchor = frame.angle;
    }
    if (Math.abs(b.height / this.baseline.height - 1) > .08 || Math.abs(b.centerX - this.baseline.centerX) / this.baseline.height > .10 || Math.abs(b.bottomMask / b.maskHeight - this.baseline.bottomMask / this.baseline.maskHeight) > .06) {
      this.pending = [];
      return { message: 'Resta sullo stesso punto, in piedi, senza spostare telefono o zoom.' };
    }
    const delta = wrapAngle(frame.angle - this.anchor);
    if (index > 0 && !this.direction && Math.abs(delta) > Math.PI / 9) this.direction = Math.sign(delta);
    const target = index * Math.PI / 4;
    const error = Math.abs(wrapAngle(delta - (this.direction || 1) * target));
    if (error > Math.PI / 12 || (index === 8 && !frame.frontFacing)) {
      this.pending = [];
      return { message: index === 8 ? 'Completa il giro e torna a guardare la fotocamera.' : `Ruota lentamente nello stesso verso: prossima vista ${index * 45}°.` };
    }
    if (now - this.lastSample < 250) return { message: 'Resta fermo un istante…' };
    if (this.pending.length && Math.abs(wrapAngle(frame.angle - this.pending[0].angle)) > .07) this.pending = [];
    if(this.pending.length){
      const first=this.pending[0].mask.data;let changed=0,foreground=0;
      for(let i=0;i<first.length;i++){foreground+=first[i];changed+=first[i]!==frame.mask.data[i]?1:0;}
      if(changed/Math.max(foreground,1)>.15)this.pending=[];
    }
    this.pending.push(frame); this.lastSample = now;
    if (this.pending.length < FRAMES_PER_VIEW) return { message: `Vista ${index * 45}°: resta fermo (${this.pending.length}/${FRAMES_PER_VIEW}).` };
    if (index === 8) {
      const original=this.views[0].mask.data;let changed=0,total=0;
      for(let i=0;i<original.length;i++){changed+=original[i]!==frame.mask.data[i]?1:0;total+=original[i];}
      if(changed/Math.max(total,1)>.20){this.pending=[];return {message:'Torna alla posa iniziale, con le braccia distanziate come all’inizio.'};}
      this.complete = true;
      return { done: true, message: 'Giro completo. Ricostruzione 3D…' };
    }
    const source = this.pending[0].mask, data = new Uint8Array(source.data.length);
    for (let i = 0; i < data.length; i++) data[i] = this.pending.reduce((n, f) => n + f.mask.data[i], 0) >= 3 ? 1 : 0;
    const offset = median(this.pending.map(f => f.body.height));
    this.views.push({ angle: wrapAngle(this.pending[0].angle - this.anchor), mask: { ...source, data }, heightCm: offset * this.scale, levels: b.levels });
    this.pending = [];
    return { captured: index, message: `Vista ${index * 45}° acquisita. ${index === 7 ? 'Completa il giro e torna di fronte.' : 'Ruota di altri 45° nello stesso verso.'}` };
  }
  get progress() { return Math.round((this.views.length * FRAMES_PER_VIEW + this.pending.length) / (9 * FRAMES_PER_VIEW) * 100); }
}
