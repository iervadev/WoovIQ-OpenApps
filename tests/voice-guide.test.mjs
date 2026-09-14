import test from 'node:test';
import assert from 'node:assert/strict';
import {VoiceGuide} from '../voice-guide.mjs';
function setup(){
  const spoken=[],statuses=[],timers=new Map(),events={};let id=0,cancels=0,resumes=0;
  const synth={paused:false,voices:[],getVoices(){return this.voices;},addEventListener(n,f){events[n]=f;},speak(u){spoken.push(u);},cancel(){cancels++;},resume(){resumes++;}};
  const guide=new VoiceGuide({synth,Utterance:class{constructor(text){this.text=text;}},status:t=>statuses.push(t),setTimer:f=>{timers.set(++id,f);return id;},clearTimer:i=>timers.delete(i)});
  return {guide,synth,spoken,statuses,timers,events,get cancels(){return cancels;},get resumes(){return resumes;}};
}
test('tap immediately starts Italian voice and resumes paused synthesis',()=>{
 const x=setup();x.synth.paused=true;x.synth.voices=[{lang:'en-US'},{lang:'it-IT',localService:true}];x.guide.test();
 assert.equal(x.spoken.length,1);assert.equal(x.spoken[0].voice,x.synth.voices[1]);assert.equal(x.spoken[0].volume,1);assert.equal(x.resumes,1);assert.equal(x.cancels,0);
});
test('instructions wait without interruption and superseded queued corrections are discarded',()=>{
 const x=setup();x.guide.speak('prima');x.guide.speak('vecchia');x.guide.speak('nuova');
 assert.equal(x.spoken.length,1);x.spoken[0].onstart();x.spoken[0].onend();
 assert.deepEqual(x.spoken.map(u=>u.text),['prima','nuova']);assert.equal(x.cancels,0);
 x.spoken[1].onend();assert.equal(x.timers.size,0);
});
test('voices loaded asynchronously are selected on the next utterance',()=>{
 const x=setup();x.synth.voices=[{lang:'it-IT'}];x.events.voiceschanged();x.guide.speak('ciao');assert.equal(x.spoken[0].voice,x.synth.voices[0]);
});
test('blocked or silent engine surfaces an actionable error and can retry',()=>{
 const x=setup();x.guide.test();x.spoken[0].onerror({error:'not-allowed'});assert.match(x.statuses.at(-1),/tocco/);
 x.guide.test();[...x.timers.values()][0]();assert.match(x.statuses.at(-1),/non ha avviato/);assert.equal(x.cancels,2);
 x.guide.test();assert.equal(x.spoken.length,3);
});
test('cancel discards queued instructions and stale callbacks cannot restart speech',()=>{
 const x=setup();x.guide.speak('a');x.guide.speak('b');const old=x.spoken[0];x.guide.stop();old.onend();old.onerror({error:'canceled'});
 assert.equal(x.spoken.length,1);assert.equal(x.timers.size,0);assert.equal(x.guide.active,null);
});
test('unsupported browser and synthesis exceptions do not throw into scan flow',()=>{
 const messages=[];const missing=new VoiceGuide({status:t=>messages.push(t)});assert.equal(missing.speak('a'),false);assert.match(messages[0],/non disponibile/);
 const x=setup();x.synth.speak=()=>{throw Error('engine');};assert.equal(x.guide.speak('a'),false);assert.match(x.statuses.at(-1),/Impossibile/);assert.equal(x.timers.size,0);
});
