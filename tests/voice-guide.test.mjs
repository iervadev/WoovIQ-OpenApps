import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {VoiceGuide,clipFor} from '../voice-guide.mjs';
function setup(){
 const spoken=[],statuses=[],events={},timers=new Map();let id=0;
 const player={play(){spoken.push(this.src);return Promise.resolve();},pause(){},addEventListener(n,f){events[n]=f;}};
 const guide=new VoiceGuide({player,status:t=>statuses.push(t),setTimer:f=>{timers.set(++id,f);return id;},clearTimer:i=>timers.delete(i)});
 return {guide,player,spoken,statuses,events,timers};
}
test('camera tap starts recorded audio synchronously without speech synthesis',()=>{
 const x=setup();x.guide.speak('Avvio della fotocamera.');assert.deepEqual(x.spoken,['./audio/camera.m4a']);assert.equal(x.player.muted,false);
 x.events.playing();assert.match(x.statuses.at(-1),/riproduzione/);assert.equal(x.timers.size,0);
});
test('same media element queues latest instruction without interrupting playback',()=>{
 const x=setup();x.guide.speak('Avvio della fotocamera.');x.guide.speak('Ruota lentamente');x.guide.speak('Completa il giro');
 assert.equal(x.spoken.length,1);x.events.ended();assert.deepEqual(x.spoken,['./audio/camera.m4a','./audio/return.m4a']);
 x.events.ended();assert.equal(x.timers.size,0);
});
test('blocked playback is reported and does not retry until reactivated',async()=>{
 const x=setup();x.player.play=()=>Promise.reject({name:'NotAllowedError'});x.guide.activate();await Promise.resolve();
 assert.match(x.statuses.at(-1),/bloccato/);assert.equal(x.guide.speak('Giro completo'),false);
 x.player.play=()=>Promise.resolve();x.guide.activate();assert.equal(x.guide.active,'ready');
});
test('cancel clears queue and ignores rejection of a superseded play promise',async()=>{
 const x=setup();let reject;x.player.play=()=>new Promise((_,r)=>reject=r);x.guide.speak('Avvio della fotocamera.');x.guide.speak('Ruota lentamente');x.guide.stop();
 reject({name:'AbortError'});await Promise.resolve();x.events.ended();assert.equal(x.guide.blocked,false);assert.equal(x.guide.active,null);assert.equal(x.timers.size,0);
});
test('load timeout and decode errors show failure rather than reporting playback',()=>{
 const x=setup();x.guide.activate();[...x.timers.values()][0]();assert.match(x.statuses.at(-1),/non avviato/);
 x.guide.activate();x.events.error();assert.match(x.statuses.at(-1),/File audio non disponibile/);assert.equal(x.timers.size,0);
});
test('rotation and prerequisite prompts resolve to shipped nonempty media files',()=>{
 const prompts=JSON.parse(readFileSync(new URL('../audio/prompts.json',import.meta.url)));
 for(const name of Object.keys(prompts)){
   const file=new URL(`../audio/${name}.m4a`,import.meta.url);assert.ok(existsSync(file));const data=readFileSync(file);assert.ok(data.length>4000);assert.equal(data.toString('ascii',4,8),'ftyp');
 }
 const checks=[['Premi prima Avvia','camera-required'],['Il motore AI si sta caricando','ai-loading'],['Il motore AI non è pronto','ai-error'],['Completa i due tocchi','calibration'],['Corpo incompleto','body'],['Guarda la fotocamera. Resta fermo','start'],['Raddrizza le gambe','straight'],['Allontana le braccia','arms'],['Per iniziare guarda','front'],['Resta sullo stesso punto','position'],['Torna alla posa iniziale','pose'],['Vista 315° acquisita. Completa il giro e torna di fronte.','return'],['Giro completo','complete']];
 for(let angle=0;angle<315;angle+=45)checks.push([`Vista ${angle}° acquisita. Ruota di altri 45° nello stesso verso.`,'captured']);
 for(const [text,clip] of checks)assert.equal(clipFor(text),clip);
 assert.equal(clipFor('Vista 45°: resta fermo (1/4).'),null);
});
