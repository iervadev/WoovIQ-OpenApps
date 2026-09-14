import { imagePoint, analyzeBody, median, summarize } from './measurements.mjs';

const $ = s => document.querySelector(s);
const video = $('#video'), overlay = $('#overlay'), ctx = overlay.getContext('2d');
let stream = null, engine = null, engineLoading = false, cameraLoading = false;
let facing = 'environment', phase = 'setup', frameId = null, lastVideoTime = -1;
let lastInference = 0, lastValidAt = 0, landmarks = null, body = null;
let calPoints = [], markerScale = null, calibrationSize = null;
let front = [], side = [], capture = null, lastSampleAt = 0;
const connections = [[11,12],[11,23],[12,24],[23,24],[11,13],[13,15],[12,14],[14,16],[23,25],[25,27],[24,26],[26,28]];
const hint = text => { $('#hint').textContent = text; };
function badge(id, text, style = '') { $(id).textContent = text; $(id).className = 'badge ' + style; }
function step(n) { for (let i = 1; i <= 4; i++) $('#s' + i).classList.toggle('active', i === n); }
function knownHeight() {
  const n = Number($('#knownHeight').value);
  return Number.isFinite(n) && n >= 80 && n <= 250 ? n : null;
}
function freshBody() { return body && performance.now() - lastValidAt < 700; }
function scale() { return knownHeight() && freshBody() ? knownHeight() / body.height : markerScale; }
function clearResults() { $('#result').classList.remove('show'); $('#metrics').replaceChildren(); }
function invalidateScan() {
  capture = null; front = []; side = []; lastSampleAt = 0;
  clearResults(); $('#samples').textContent = '0 / 16';
  phase = stream ? 'front' : 'setup';
}
function clearCalibration() {
  markerScale = null; calibrationSize = null; calPoints = [];
  badge('#cal', knownHeight() ? 'Scala: altezza inserita' : 'Scala: —', knownHeight() ? 'ok' : '');
}
function updateControls() {
  $('#start').disabled = cameraLoading || !!stream;
  $('#switchCamera').disabled = cameraLoading || !!capture;
  $('#calibrate').disabled = !stream || cameraLoading || !!capture;
  $('#knownHeight').disabled = !!capture;
  $('#scan').disabled = !!capture || cameraLoading;
  $('#scan').textContent = capture ? 'Acquisizione in corso…' : phase === 'side' ? 'Acquisisci vista laterale' : phase === 'result' ? 'Ripeti scansione' : 'Acquisisci vista frontale';
  $('#cameraBadge').textContent = 'Camera: ' + (facing === 'user' ? 'frontale' : 'posteriore');
  $('#switchCamera').textContent = facing === 'user' ? '↻ Usa posteriore' : '↻ Usa frontale';
  video.classList.toggle('mirror', facing === 'user');
}
function stopCamera() {
  if (frameId !== null) cancelAnimationFrame(frameId);
  frameId = null; capture = null;
  const previous = stream; stream = null;
  previous?.getTracks().forEach(track => track.stop());
  video.srcObject = null; body = null; landmarks = null;
}
async function startCamera() {
  if (cameraLoading) return;
  cameraLoading = true;
  stopCamera(); invalidateScan(); clearCalibration(); updateControls();
  try {
    if (!window.isSecureContext) throw new Error('Apri il sito in HTTPS: la fotocamera non funziona su HTTP.');
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Fotocamera non disponibile in questo browser. Apri il link in Safari o Chrome.');
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    const track = stream.getVideoTracks()[0];
    facing = track.getSettings().facingMode || facing;
    video.srcObject = stream;
    await video.play();
    track.addEventListener('ended', () => {
      if (stream?.getVideoTracks()[0] !== track) return;
      stopCamera(); invalidateScan(); clearCalibration(); updateControls();
      hint('La fotocamera si è interrotta. Premi Avvia fotocamera per ripartire.');
    });
    lastVideoTime = -1; phase = 'front'; step(2);
    badge('#phase', 'Camera attiva', 'ok');
    hint('Inserisci la tua altezza misurata oppure calibra il marker. Poi inquadra tutto il corpo e acquisisci la vista frontale.');
    frameId = requestAnimationFrame(loop);
  } catch (error) {
    stopCamera(); phase = 'setup';
    const messages = {
      NotAllowedError: 'Accesso alla fotocamera negato. Consenti l’accesso nelle impostazioni del sito in Safari/Chrome, poi riprova.',
      NotFoundError: 'Nessuna fotocamera disponibile su questo dispositivo.',
      NotReadableError: 'Fotocamera occupata: chiudi le altre app che la usano e riprova.'
    };
    badge('#phase', 'Errore fotocamera', 'bad');
    hint(messages[error.name] || error.message);
  } finally { cameraLoading = false; updateControls(); }
}

$('#start').addEventListener('click', startCamera);
$('#switchCamera').addEventListener('click', () => { facing = facing === 'user' ? 'environment' : 'user'; startCamera(); });
$('#knownHeight').addEventListener('input', () => {
  invalidateScan(); clearCalibration(); updateControls();
  hint(knownHeight() ? 'Altezza impostata. Inquadra testa e piedi, guarda la fotocamera e acquisisci la vista frontale.' : 'Inserisci un’altezza tra 80 e 250 cm, oppure usa il marker stampato.');
});
$('#reset').addEventListener('click', () => {
  invalidateScan(); clearCalibration(); updateControls(); step(stream ? 2 : 1);
  badge('#phase', stream ? 'Camera attiva' : 'Setup');
  hint('Nuova scansione. Controlla l’altezza inserita oppure ripeti la calibrazione del marker.');
});
$('#calibrate').addEventListener('click', () => {
  if (!stream || !video.videoWidth) return;
  invalidateScan(); clearCalibration(); $('#knownHeight').value = ''; phase = 'calibrate';
  badge('#phase', 'Tocca 2 punti', 'warn');
  hint('Stampa il marker al 100% e verifica i 10 cm con un righello. Tienilo sul piano del corpo e tocca i due bordi esterni opposti.');
  updateControls();
});
overlay.addEventListener('pointerup', event => {
  if (phase !== 'calibrate') return;
  const point = imagePoint(event.clientX, event.clientY, overlay.getBoundingClientRect(), overlay.width, overlay.height, facing === 'user');
  if (!point) { hint('Tocca il marker nell’immagine, non le bande nere.'); return; }
  calPoints.push(point);
  if (calPoints.length === 2) {
    const pixels = Math.hypot(calPoints[1].x - calPoints[0].x, calPoints[1].y - calPoints[0].y);
    if (pixels < 20) {
      calPoints = []; hint('Punti troppo vicini. Ripeti i due tocchi sui bordi esterni del marker.');
    } else {
      markerScale = 10 / pixels; calibrationSize = [overlay.width, overlay.height];
      phase = 'front'; step(3); badge('#cal', 'Scala: marker 10 cm', 'ok');
      badge('#phase', 'Vista frontale');
      hint('Calibrazione completata. Non spostare il telefono. Inquadra tutto il corpo e acquisisci la vista frontale.');
    }
  }
  drawOverlay(); updateControls();
});

function prerequisite() {
  if (!stream) return 'Premi prima Avvia fotocamera e consenti l’accesso.';
  if (engineLoading) return 'Il motore AI si sta caricando. Attendi che compaia AI: pronta.';
  if (!engine) return 'Il motore AI non è pronto. Premi Riprova AI e controlla la connessione.';
  if (phase === 'calibrate') return 'Completa i due tocchi sul marker, oppure inserisci l’altezza misurata.';
  if (!knownHeight() && !markerScale) return 'Inserisci la tua altezza misurata oppure premi Calibra 10 cm.';
  if (!freshBody()) return 'Corpo incompleto o non rilevato. Inquadra testa e piedi, usa buona luce e stacca leggermente le braccia.';
  return null;
}
$('#scan').addEventListener('click', () => {
  const reason = prerequisite();
  if (reason) { hint(reason); return; }
  if (phase !== 'side') { invalidateScan(); phase = 'front'; }
  clearResults();
  capture = { view: phase, started: performance.now() }; lastSampleAt = 0;
  badge('#phase', phase === 'side' ? 'Acquisizione laterale' : 'Acquisizione frontale', 'warn');
  hint(phase === 'side' ? 'Girati di 90°, resta nello stesso punto e tieni le braccia poco staccate dal busto.' : 'Guarda la fotocamera, resta fermo con le braccia poco staccate dal busto.');
  step(3); updateControls();
});
function captureFrame(now) {
  if (!capture) return;
  const target = capture.view === 'front' ? front : side;
  if (now - capture.started > 20000) {
    target.length = 0; capture = null; updateControls();
    badge('#phase', 'Acquisizione da ripetere', 'warn');
    hint('Non ho raccolto abbastanza campioni stabili. Controlla inquadratura e posizione, poi riprova.'); return;
  }
  if (!freshBody() || now - lastSampleAt < 250) return;
  const frontal = median(front.map(s => s.shoulder));
  if (capture.view === 'front' && body.shoulder < .14) {
    hint('Vista frontale: gira il busto verso la fotocamera.'); return;
  }
  if (capture.view === 'side' && body.shoulder > frontal * .65) {
    hint('Vista laterale: girati di 90° rispetto alla vista frontale.'); return;
  }
  if (capture.view === 'side' && Math.abs(body.height / median(front.map(s => s.height)) - 1) > .15) {
    hint('Resta alla stessa distanza dalla fotocamera, senza piegarti.'); return;
  }
  const factor = scale();
  if (!factor || body.height * factor < 80 || body.height * factor > 250) {
    capture = null; target.length = 0; updateControls();
    hint('La scala produce un’altezza fuori intervallo. Ripeti la calibrazione o inserisci l’altezza misurata.'); return;
  }
  // Restart the current acquisition if the silhouette changes by more than 8%.
  if (target.length && ['chest','waist','hip','height'].some(k => Math.abs(body[k] / median(target.map(s => s[k])) - 1) > .08)) target.length = 0;
  target.push({ ...body, scale: factor }); lastSampleAt = now;
  $('#samples').textContent = `${front.length + side.length} / 16`;
  badge('#phase', `${capture.view === 'front' ? 'Frontale' : 'Laterale'}: ${target.length} / 8`, 'ok');
  if (target.length < 8) return;
  const completed = capture.view; capture = null;
  if (completed === 'front') {
    phase = 'side'; hint('Vista frontale acquisita. Girati di 90° nello stesso punto, poi premi Acquisisci vista laterale.');
  } else finish();
  updateControls();
}
function finish() {
  try {
    const result = summarize(front, side);
    const rows = [[knownHeight() ? 'Altezza inserita' : 'Altezza stimata', result.height], ['Torace stimato', result.chest], ['Vita stimata', result.waist], ['Fianchi stimati', result.hip]];
    $('#metrics').replaceChildren(...rows.map(([name, value]) => {
      const card = document.createElement('div'); card.className = 'metric';
      const label = document.createElement('span'); label.textContent = name;
      const number = document.createElement('strong'); number.textContent = value.toFixed(1) + ' cm';
      card.append(label, number); return card;
    }));
    $('#notice').textContent = 'Stime da silhouette frontale/laterale e sezioni ellittiche: non misure validate né un modello 3D. Confrontale con un metro. Il peso non si ricava da queste immagini.';
    $('#result').classList.add('show'); phase = 'result'; step(4);
    badge('#phase', 'Acquisizione completata', 'ok');
    hint('Viste acquisite. Le circonferenze sono stime: abiti, postura e prospettiva influiscono sul risultato.');
  } catch (error) {
    invalidateScan(); hint(error.message); badge('#phase', 'Ripeti scansione', 'warn');
  }
}

function drawOverlay() {
  const width = video.videoWidth, height = video.videoHeight;
  if (!width || !height) return;
  if (overlay.width !== width || overlay.height !== height) {
    overlay.width = width; overlay.height = height;
    if (calibrationSize && (width !== calibrationSize[0] || height !== calibrationSize[1])) {
      clearCalibration(); invalidateScan(); updateControls(); hint('Inquadratura cambiata: ripeti la calibrazione.');
    }
  }
  ctx.clearRect(0, 0, width, height); ctx.save();
  if (facing === 'user') { ctx.translate(width, 0); ctx.scale(-1, 1); }
  if (landmarks) {
    ctx.strokeStyle = '#67e8f9'; ctx.lineWidth = 3;
    for (const [a,b] of connections) {
      if ((landmarks[a].visibility ?? 0) < .4 || (landmarks[b].visibility ?? 0) < .4) continue;
      ctx.beginPath(); ctx.moveTo(landmarks[a].x * width, landmarks[a].y * height);
      ctx.lineTo(landmarks[b].x * width, landmarks[b].y * height); ctx.stroke();
    }
  }
  ctx.fillStyle = '#22c55e'; ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 4;
  for (const point of calPoints) { ctx.beginPath(); ctx.arc(point.x, point.y, 7, 0, Math.PI * 2); ctx.fill(); }
  if (calPoints.length === 2) { ctx.beginPath(); ctx.moveTo(calPoints[0].x, calPoints[0].y); ctx.lineTo(calPoints[1].x, calPoints[1].y); ctx.stroke(); }
  ctx.restore();
}
let inferenceErrors = 0, emptyMasks = 0, engineMode = 'GPU';
function fallbackCPU() {
  engine?.close(); engine = null; invalidateScan();
  hint('La modalità GPU non restituisce una silhouette valida. Passaggio alla CPU: attendi AI pronta, poi ripeti l’acquisizione.');
  initEngine('CPU');
}
function loop(now) {
  if (!stream) return;
  if (engine && !video.paused && video.readyState >= 2 && video.currentTime !== lastVideoTime && now - lastInference >= 100) {
    lastVideoTime = video.currentTime; lastInference = now;
    try {
      // Callback keeps the mask alive only while it is consumed. No full-frame
      // video copies, background colour comparisons or retained GPU masks.
      engine.detectForVideo(video, now, result => {
        landmarks = result.landmarks?.[0] || null;
        const mask = result.segmentationMasks?.[0];
        const data = mask?.getAsFloat32Array();
        const hasForeground = data?.some(value => value >= .65);
        emptyMasks = landmarks && !hasForeground ? emptyMasks + 1 : 0;
        body = mask && landmarks && hasForeground ? analyzeBody(landmarks, { data, width: mask.width, height: mask.height }, video.videoWidth, video.videoHeight) : null;
        if (body) lastValidAt = now;
      });
      inferenceErrors = 0;
      if (emptyMasks >= 8 && engineMode === 'GPU') fallbackCPU();
    } catch (error) {
      body = null; landmarks = null;
      if (++inferenceErrors >= 3 && engineMode === 'GPU') {
        fallbackCPU();
      } else if (inferenceErrors >= 3) {
        engine.close(); engine = null; capture = null;
        badge('#ai', 'AI: errore durante la scansione', 'bad'); $('#retryAI').hidden = false;
        hint('Il rilevamento si è interrotto. Premi Riprova AI.'); updateControls();
      }
    }
  }
  if (!freshBody()) body = null;
  drawOverlay(); captureFrame(now);
  const quality = body ? 100 : landmarks ? 50 : 0;
  $('#qtxt').textContent = `${quality}%`; $('#qbar').style.width = `${quality}%`;
  badge('#body', body ? 'Corpo: inquadratura valida' : landmarks ? 'Corpo: inquadra testa e piedi' : 'Corpo: attesa', body ? 'ok' : 'warn');
  const h = knownHeight() || (body && markerScale ? body.height * markerScale : null);
  $('#heightLive').textContent = h ? `${h.toFixed(1)} cm` : '—';
  frameId = requestAnimationFrame(loop);
}

async function initEngine(delegate = 'GPU') {
  if (engineLoading || engine) return;
  engineLoading = true; $('#retryAI').hidden = true; badge('#ai', 'AI: caricamento…', 'warn'); updateControls();
  try {
    const root = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1';
    const { FilesetResolver, PoseLandmarker } = await import(`${root}/vision_bundle.mjs`);
    const files = await FilesetResolver.forVisionTasks(`${root}/wasm`);
    const options = { baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task', delegate }, runningMode: 'VIDEO', numPoses: 1, outputSegmentationMasks: true, minPoseDetectionConfidence: .5, minPosePresenceConfidence: .5, minTrackingConfidence: .5 };
    try { engine = await PoseLandmarker.createFromOptions(files, options); engineMode = delegate; }
    catch { options.baseOptions.delegate = 'CPU'; engine = await PoseLandmarker.createFromOptions(files, options); engineMode = 'CPU'; }
    inferenceErrors = 0; emptyMasks = 0; $('#engine').textContent = engineMode; badge('#ai', 'AI: pronta', 'ok');
  } catch (error) {
    badge('#ai', 'AI: non caricata', 'bad'); $('#engine').textContent = 'Errore'; $('#retryAI').hidden = false;
    hint('Caricamento AI non riuscito. Verifica la connessione e premi Riprova AI.');
  } finally { engineLoading = false; updateControls(); }
}
$('#retryAI').addEventListener('click', () => initEngine('CPU'));
window.addEventListener('pagehide', () => { stopCamera(); invalidateScan(); updateControls(); });
updateControls(); initEngine();
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
