import {phantomView} from './fixtures.mjs';
import {Scan360,wrapAngle} from '../scan360.mjs';
import {BodyViewer} from '../viewer.mjs';
import {exportOBJ} from '../reconstruction.mjs';
import {VoiceGuide} from '../voice-guide.mjs';
const $=s=>document.querySelector(s),canvas=$('#silhouette'),ctx=canvas.getContext('2d');
// VoiceGuide uses document-relative audio URLs; resolve them to the app root here.
const media=$('#audio');
const player={get src(){return media.src;},set src(path){media.src=new URL('../'+path,location.href).href;},play:()=>media.play(),pause:()=>media.pause(),addEventListener:(...args)=>media.addEventListener(...args),set muted(v){media.muted=v;},set volume(v){media.volume=v;},set preload(v){media.preload=v;}};
const voice=new VoiceGuide({player,status:text=>$('#audioStatus').textContent=text});
$('#audioStatus').textContent='La voce parte con l’avvio della simulazione.';
const say=text=>{if($('#voice').checked)voice.speak(text);};
$('#voice').onchange=()=>{if($('#voice').checked)voice.activate();else voice.stop();};
let timer,worker,viewer,run=0,model;
function draw(mask){const img=ctx.createImageData(mask.width,mask.height);for(let i=0;i<mask.data.length;i++){const k=i*4;img.data[k]=mask.data[i]?70:6;img.data[k+1]=mask.data[i]?210:13;img.data[k+2]=mask.data[i]?220:23;img.data[k+3]=255;}ctx.putImageData(img,0,0);}
function cleanup(){clearInterval(timer);worker?.terminate();worker=null;voice.stop();run++;$('#start').disabled=false;$('#stop').disabled=true;}
$('#stop').onclick=()=>{cleanup();$('#status').textContent='Interrotto: il giro incompleto non produce un modello.';};
$('#start').onclick=()=>{
 cleanup();const job=run,scan=new Scan360(.25);let angle=0,from=0,target=0,moveAt=performance.now()+3200;const began=performance.now(),log=[];
 model=null;viewer?.clear();$('#controls').hidden=true;$('#details').textContent='';$('#progress').value=0;$('#start').disabled=true;$('#stop').disabled=false;
 $('#views').replaceChildren(...Array.from({length:9},(_,i)=>{const el=document.createElement('span');el.textContent=i===8?'360° ritorno':`${i*45}°`;return el;}));
 say('Guarda la fotocamera. Resta fermo fino alla prossima indicazione.');
 $('#status').textContent='Inizio: sagoma frontale, attesa dei campioni stabili.';
 timer=setInterval(()=>{
  const now=performance.now();if(now<moveAt)return;
  const t=Math.min(1,(now-moveAt)/1800);angle=from+(target-from)*t;
  const sample=phantomView(angle),frame={angle:wrapAngle(angle),mask:sample.mask,frontFacing:Math.abs(wrapAngle(angle))<.12,body:{height:700,centerX:500,topMask:0,bottomMask:191,maskHeight:192,shoulder:.2,standing:true,armsClear:true,levels:sample.levels}};
  draw(frame.mask);const outcome=scan.add(frame,now);$('#progress').value=scan.progress;$('#angle').textContent=`Rotazione: ${Math.round(angle*180/Math.PI)}° · ${scan.views.length} / 8 viste`;
  if(outcome.message)$('#status').textContent=outcome.message;
  if(outcome.error){cleanup();$('#status').textContent='FAIL: '+outcome.error;return;}
  if(outcome.captured!==undefined){
   $('#views').children[outcome.captured].className='done';log.push({view:outcome.captured*45,atMs:Math.round(now-began)});say(outcome.message);
   // Begin the next turn only after this view has actually been accepted.
   from=angle;target=scan.views.length*Math.PI/4;moveAt=now+500;
  }
  if(outcome.done){
   clearInterval(timer);$('#views').children[8].className='done';$('#progress').value=100;$('#angle').textContent='Rotazione: 360° · 8 / 8 viste · ritorno frontale verificato';
   say('Giro completo. Ricostruzione del modello.');$('#status').textContent='Giro completo verificato. Ricostruzione delle viste acquisite…';
   worker=new Worker('../reconstruction-worker.js',{type:'module'});
   worker.onerror=e=>{cleanup();$('#status').textContent='FAIL: '+e.message;};
   worker.onmessage=({data})=>{
    if(job!==run)return;worker.terminate();worker=null;$('#start').disabled=false;$('#stop').disabled=true;
    if(data.error){$('#status').textContent='FAIL: '+data.error;return;}
    try{model=data.model;viewer??=new BodyViewer($('#model'));viewer.setModel(model);$('#controls').hidden=false;$('#status').textContent='PASS: otto viste acquisite, ritorno a 360° verificato e modello 3D ricostruito.';
    $('#details').textContent=JSON.stringify({synthetic:true,acquiredViews:log,closureVerified:scan.complete,durationMs:Math.round(performance.now()-began),metrics:model.metrics,triangles:model.triangles.length/3},null,2);
    }catch(e){$('#status').textContent='FAIL: '+e.message;}
   };
   worker.postMessage({views:scan.views});
  }
 },100);
};
$('#zoom').oninput=e=>{if(viewer){viewer.zoom=Number(e.target.value);viewer.draw();}};
$('#rotate').onclick=()=>{if(viewer){viewer.yaw+=Math.PI/2;viewer.draw();}};
$('#download').onclick=()=>{if(!model)return;const url=URL.createObjectURL(new Blob([exportOBJ(model)],{type:'text/plain'})),a=document.createElement('a');a.href=url;a.download='synthetic-360.obj';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);};
window.addEventListener('pagehide',cleanup);draw(phantomView(0).mask);
