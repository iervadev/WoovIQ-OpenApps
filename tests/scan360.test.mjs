import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scan360, poseAngle, wrapAngle } from '../scan360.mjs';
import { phantomViews } from './fixtures.mjs';
import { reconstruct, exportOBJ } from '../reconstruction.mjs';

export function makeView(angle, width=128, height=192) {
  const a=.12,b=.075, span=.9, radius=Math.hypot(a*Math.cos(angle),b*Math.sin(angle));
  const data=new Uint8Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(Math.abs((x/(width-1)-.5)*span)<radius)data[y*width+x]=1;
  return { angle, heightCm:175, mask:{data,width,height,span}, levels:{chest:.3,waist:.45,hip:.55} };
}
const body={height:700,centerX:500,topMask:10,bottomMask:190,maskHeight:200,shoulder:.2,levels:{chest:.3,waist:.45,hip:.55}};
function frame(angle, overrides={}){return {angle,body:{...body,...overrides},mask:makeView(angle).mask,frontFacing:Math.abs(wrapAngle(angle))<.1};}
function feed(scan,angle,start,overrides){let result;for(let i=0;i<4;i++)result=scan.add(frame(angle,overrides),start+i*300);return result;}

test('full clockwise and counterclockwise rotations require eight views and closure',()=>{
  for(const sign of [-1,1]){
    const scan=new Scan360(.25);
    for(let i=0;i<8;i++){
      const result=feed(scan,wrapAngle(sign*i*Math.PI/4),i*2000);
      assert.equal(result.captured,i);assert.equal(scan.complete,false);
    }
    assert.equal(scan.views.length,8);
    assert.equal(feed(scan,0,16000).done,true);assert.equal(scan.complete,true);
  }
});
test('a repeated front, skipped views, missing poses and displacement cannot complete',()=>{
  const scan=new Scan360(.25);feed(scan,0,0);
  feed(scan,0,2000);assert.equal(scan.views.length,1);
  feed(scan,Math.PI/2,4000);assert.equal(scan.views.length,1);
  feed(scan,Math.PI/4,6000,{height:500});assert.equal(scan.views.length,1);
  feed(scan,Math.PI/4,8000,{centerX:700});assert.equal(scan.views.length,1);
  assert.match(scan.add(null,190000).error,/Tempo scaduto/);
});
test('invalid calibration and missing orientation never get a default metric scale',()=>{
  assert.throws(()=>new Scan360(0));assert.equal(poseAngle(null),null);
  const scan=new Scan360(1);assert.match(scan.add(frame(0),0).error,/Altezza/);
});
test('visual hull reconstructs a known elliptical cylinder and exports a metric surface',()=>{
  const views=Array.from({length:8},(_,i)=>makeView(i*Math.PI/4));
  const model=reconstruct(views,{resolution:48});
  assert.equal(model.metrics.height,175);assert.ok(model.vertices.length>0);assert.ok(model.triangles.length>0);
  const a=.12*175,b=.075*175,expected=Math.PI*(3*(a+b)-Math.sqrt((3*a+b)*(a+3*b)));
  assert.ok(Math.abs(model.metrics.waist-expected)/expected<.15,`${model.metrics.waist} vs ${expected}`);
  assert.ok(model.triangles.every(i=>i<model.vertices.length/3));
  let volume=0;
  for(let i=0;i<model.triangles.length;i+=3){
    const [a,b,c]=[0,1,2].map(k=>model.vertices.slice(model.triangles[i+k]*3,model.triangles[i+k]*3+3));
    volume+=a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]);
  }
  assert.ok(volume>0,'exported faces must point outward');
  assert.match(exportOBJ(model),/# Units: centimetres/);
  assert.ok(exportOBJ(model).includes('\nf '));
});
test('incomplete or empty silhouettes cannot produce a plausible-looking mesh',()=>{
  assert.throws(()=>reconstruct([]),/8 viste/);
  const views=Array.from({length:8},(_,i)=>makeView(i*Math.PI/4));
  views[4].mask.data.fill(0);assert.throws(()=>reconstruct(views,{resolution:24}),/coerenti/);
  assert.throws(()=>reconstruct(Array(8).fill(makeView(0))),/Copertura/);
});

test('arms separated from the torso do not get included in the chest circumference',()=>{
  const model=reconstruct(phantomViews());
  assert.ok(model.metrics.chest>75&&model.metrics.chest<110);
  assert.ok(model.metrics.waist>65&&model.metrics.waist<95);
});
test('bent posture and arms against torso are rejected at scan start',()=>{
  const scan=new Scan360(.25);
  assert.match(scan.add(frame(0,{standing:false}),0).message,/Raddrizza/);
  assert.match(scan.add(frame(0,{armsClear:false}),1000).message,/braccia/);
  assert.equal(scan.views.length,0);
});
