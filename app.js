import { imagePoint, analyzeBody } from './measurements.mjs';
import { Scan360, poseAngle, silhouette } from './scan360.mjs';
import { exportOBJ } from './reconstruction.mjs';
import { BodyViewer } from './viewer.mjs';
import { VoiceGuide } from './voice-guide.mjs';

const $ = s => document.querySelector(s);
const video = $('#video'), overlay = $('#overlay'), ctx = overlay.getContext('2d');
let stream = null, engine = null, engineLoading = false, cameraLoading = false;
let facing = 'environment', phase = 'setup', frameId = null, lastVideoTime = -1;
let lastInference = 0, lastValidAt = 0, landmarks = null, body = null;
let calPoints = [], markerScale = null, calibrationSize = null;
let capture = null, currentFrame = null, worker = null, model = null, viewer = null;
let jobId = 0, inferenceId = 0, lastCapturedId = -1;
const connections = [[11,12],[11,23],[12,24],[23,24],[11,13],[13,15],[12,14],[14,16],[23,25],[25,27],[24,26],[26,28]];
const hint = text => { $('#hint').textContent = text; };
function badge(id, text, style = '') { $(id).textContent = text; $(id).className = 'badge ' + style; }
function step(n) { for (let i = 1; i <= 4; i++) $('#s' + i).classList.toggle('active', i === n); }
function freshBody() { return body && performance.now() - lastValidAt < 700; }

function clearResults() { $('#result').classList.remove('show'); $('#metrics').replaceChildren(); model=null; viewer?.clear(); }
const voiceGuide=new VoiceGuide({synth:window.speechSynthesis,Utterance:window.SpeechSynthesisUtterance,status:text=>{$('#voiceStatus').textContent=text;}});
if(!voiceGuide.supported){$('#voice').checked=false;$('#voice').disabled=true;$('#testVoice').disabled=true;}
function say(text){if($('#voice').checked)voiceGuide.speak(text);}
$('#testVoice').addEventListener('click',()=>{$('#voice').checked=true;voiceGuide.test();});
$('#voice').addEventListener('change',()=>{if($('#voice').checked)voiceGuide.test();else{voiceGuide.stop();$('#voiceStatus').textContent='Guida vocale disattivata.';}});
let lastVoiceCorrection='',lastVoiceCorrectionAt=-Infinity;
function invalidateScan() {
  voiceGuide.stop();lastVoiceCorrection='';lastVoiceCorrectionAt=-Infinity;
  capture=null;currentFrame=null;lastCapturedId=-1;worker?.terminate();worker=null;jobId++;
  clearResults(); $('#samples').textContent='0 / 8'; $('#scanProgress').value=0;
  document.querySelectorAll('.viewDot').forEach(el=>el.classList.remove('done'));
  phase=stream?'ready':'setup';
}
function clearCalibration() {
  markerScale=null;calibrationSize=null;calPoints=[];badge('#cal','Scala: da calibrare');
  $('#heightLive').textContent='—';
}
function updateControls() {
  $('#start').disabled = cameraLoading || !!stream;
  $('#switchCamera').disabled = cameraLoading || !!capture;
  $('#calibrate').disabled = !stream || cameraLoading || !!capture;
  $('#scan').disabled = !!capture || cameraLoading || phase==='processing';
  $('#cancel').hidden = !capture && phase!=='processing';
  $('#scan').textContent = capture ? 'Scansione 360° in corso…' : phase==='processing' ? 'Ricostruzione 3D…' : 'Avvia scansione 360°';
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
    lastVideoTime = -1; phase = 'ready'; step(2);
    badge('#phase', 'Camera attiva', 'ok');
    hint('Calibra il marker da 10 cm. L’altezza sarà rilevata dalla fotocamera: non devi inserirla. Poi avvia il giro a 360°.');
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

$('#start').addEventListener('click',()=>{const opening=startCamera();say('Avvio della fotocamera. Calibra il riferimento da dieci centimetri prima della scansione.');return opening;});
$('#switchCamera').addEventListener('click', () => { facing = facing === 'user' ? 'environment' : 'user'; startCamera(); });
$('#reset').addEventListener('click', () => {
  invalidateScan(); clearCalibration(); updateControls(); step(stream ? 2 : 1);
  badge('#phase', stream ? 'Camera attiva' : 'Setup');
  hint('Nuova scansione. Ripeti la calibrazione del riferimento da 10 cm.');
});
$('#calibrate').addEventListener('click', () => {
  if (!stream || !video.videoWidth) return;
  invalidateScan(); clearCalibration(); phase = 'calibrate';
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
      phase = 'ready'; step(3); badge('#cal', 'Scala: marker 10 cm', 'ok');
      badge('#phase', 'Vista frontale');
      hint('Calibrazione completata. Non spostare il telefono. Inquadra tutto il corpo, poi premi Avvia scansione 360°.');
    }
  }
  drawOverlay(); updateControls();
});

function prerequisite() {
  if (!stream) return 'Premi prima Avvia fotocamera e consenti l’accesso.';
  if (engineLoading) return 'Il motore AI si sta caricando. Attendi che compaia AI: pronta.';
  if (!engine) return 'Il motore AI non è pronto. Premi Riprova AI e controlla la connessione.';
  if (phase === 'calibrate') return 'Completa i due tocchi sui bordi esterni del marker.';
  if (!markerScale) return 'Premi Calibra 10 cm e tocca i bordi del riferimento stampato: l’altezza verrà rilevata automaticamente.';
  if (!freshBody()) return 'Corpo incompleto o non rilevato. Inquadra testa e piedi, usa buona luce e stacca leggermente le braccia.';
  return null;
}
$('#scan').addEventListener('click', () => {
  const reason=prerequisite();if(reason){hint(reason);say(reason);return;}
  // Preserve the most recent detection when resetting the previous result.
  const frame=currentFrame;invalidateScan();currentFrame=frame;
  capture=new Scan360(markerScale);phase='scan';step(3);say('Guarda la fotocamera. Resta fermo fino alla prossima indicazione.');
  badge('#phase','360° · guarda la fotocamera','warn');
  hint('Guarda la fotocamera e resta fermo. Dopo ogni vista ruota di circa 45° nello stesso verso.');updateControls();
});
$('#cancel').addEventListener('click',()=>{invalidateScan();badge('#phase','Scansione annullata');hint('Puoi riprovare: torna di fronte alla fotocamera.');updateControls();});
function captureFrame(now) {
  if(!capture)return;
  const frame=freshBody()&&inferenceId!==lastCapturedId?currentFrame:null;
  if(frame)lastCapturedId=inferenceId;
  const outcome=capture.add(frame,now);
  if(outcome.error){invalidateScan();hint(outcome.error);badge('#phase','Scansione da ripetere','warn');updateControls();return;}
  // Do not overwrite guidance on animation frames without a new inference.
  if(outcome.message && (frame || !freshBody()))hint(outcome.message);
  $('#samples').textContent=`${capture.views.length} / 8`;
  $('#scanProgress').value=capture.progress;
  for(let i=0;i<capture.views.length;i++)document.querySelector(`[data-view="${i}"]`)?.classList.add('done');
  badge('#phase',outcome.done?'360° completati':`360° · prossima vista ${capture.views.length*45}°`,'ok');
  if(outcome.captured!==undefined)say(outcome.message);
  else if(frame && outcome.message && !outcome.done && !/resta fermo|Resta fermo|Vista .*:/.test(outcome.message) && outcome.message!==lastVoiceCorrection && now-lastVoiceCorrectionAt>7000){say(outcome.message);lastVoiceCorrection=outcome.message;lastVoiceCorrectionAt=now;}
  if(outcome.done){say('Giro completo. Ricostruzione del modello.');const views=capture.views;capture=null;finish(views);}
}
function finish(views) {
  stopCamera();
  phase='processing';step(4);updateControls();$('#scanProgress').value=100;
  hint('Ricostruzione del volume dalle otto silhouette…');
  const job=++jobId;
  try {
    worker=new Worker(new URL('./reconstruction-worker.js',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{
      if(job!==jobId)return;worker.terminate();worker=null;
      if(data.error){processingError(data.error);return;}
      model=data.model;showResults();
    };
    worker.onerror=()=>{if(job===jobId)processingError('Ricostruzione non riuscita. Riprova con una nuova scansione.');};
    worker.postMessage({views});
  }catch(error){processingError(error.message);}
}
function processingError(message){invalidateScan();hint(message);badge('#phase','Ricostruzione da ripetere','warn');updateControls();}
function showResults() {
  const result=model.metrics;
  const rows=[['Altezza rilevata',result.height],['Torace stimato',result.chest],['Vita stimata',result.waist],['Fianchi stimati',result.hip]];
  $('#metrics').replaceChildren(...rows.map(([name,value])=>{
    const card=document.createElement('div');card.className='metric';
    const label=document.createElement('span');label.textContent=name;
    const number=document.createElement('strong');number.textContent=value.toFixed(1)+' cm';card.append(label,number);return card;
  }));
  $('#notice').textContent=`Modello 3D stimato dalle silhouette. Griglia circa ${model.resolutionCm.toFixed(1)} cm: non è una precisione garantita. Abiti, movimento, prospettiva e orientamenti stimati influiscono sulle misure. Confrontale con un metro; peso e BMI non sono ricavati dalle immagini.`;
  $('#result').classList.add('show');phase='result';step(4);badge('#phase','Modello 3D pronto','ok');
  hint('Giro completo acquisito. Esplora il modello 3D e scarica misure e superficie.');updateControls();
  $('#result').scrollIntoView?.({behavior:'smooth',block:'start'});
  try{viewer ||= new BodyViewer($('#modelCanvas'));viewer.setModel(model);}catch(error){$('#viewerHint').textContent=error.message;}
}
function download(text,name,type){
  const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
$('#exportOBJ').addEventListener('click',()=>{if(model)download(exportOBJ(model),'wooviq-body-scan.obj','text/plain');});
$('#exportJSON').addEventListener('click',()=>{if(model)download(JSON.stringify({version:'4.0',units:'cm',metrics:model.metrics,method:model.method,resolutionCm:model.resolutionCm,validated:false},null,2),'wooviq-measurements.json','application/json');});
$('#zoom').addEventListener('input',event=>{if(viewer){viewer.zoom=Number(event.target.value);viewer.draw();}});
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
        inferenceId++;
        currentFrame=null;
        if(body){lastValidAt=now;currentFrame={body,angle:poseAngle(result.worldLandmarks?.[0]),frontFacing:(landmarks[0]?.visibility??0)>.65 && (landmarks[11]?.visibility??0)>.5 && (landmarks[12]?.visibility??0)>.5,mask:silhouette({data,width:mask.width,height:mask.height},body)};}
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
  const h = body && markerScale ? body.height * markerScale : null;
  $('#heightLive').textContent = h ? (h>=80&&h<=250 ? `${h.toFixed(1)} cm` : 'Verifica calibrazione') : '—';
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
window.addEventListener('pagehide', () => { stopCamera(); invalidateScan(); clearCalibration();updateControls(); });
window.addEventListener('orientationchange',()=>{if(stream){invalidateScan();clearCalibration();updateControls();hint('Orientamento cambiato: ripeti la calibrazione.');}});
updateControls(); initEngine();
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
