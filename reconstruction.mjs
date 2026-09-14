import { median } from './measurements.mjs';

function convexHull(points) {
  points.sort((a,b) => a[0]-b[0] || a[1]-b[1]);
  const cross = (o,a,b) => (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
  const lower=[], upper=[];
  for (const p of points) { while(lower.length>1 && cross(lower.at(-2),lower.at(-1),p)<=0) lower.pop(); lower.push(p); }
  for (const p of points.slice().reverse()) { while(upper.length>1 && cross(upper.at(-2),upper.at(-1),p)<=0) upper.pop(); upper.push(p); }
  lower.pop(); upper.pop(); return lower.concat(upper);
}
function sectionPerimeter(grid, nx, ny, y, spacing) {
  // Separate thin arm-to-torso bridges introduced by voxel quantization.
  // Erode one cell before choosing the torso, then restore its boundary only.
  const section=new Uint8Array(nx*nx), core=new Uint8Array(nx*nx);
  for(let z=0;z<nx;z++)for(let x=0;x<nx;x++)section[z*nx+x]=grid[(y*nx+z)*nx+x];
  for(let z=1;z<nx-1;z++)for(let x=1;x<nx-1;x++){
    const i=z*nx+x;core[i]=section[i]&&section[i-1]&&section[i+1]&&section[i-nx]&&section[i+nx]?1:0;
  }
  const seen = new Uint8Array(nx*nx); let largest=[];
  for(let z=0;z<nx;z++) for(let x=0;x<nx;x++) {
    const start=z*nx+x;
    if(seen[start] || !core[start]) continue;
    const cells=[start]; seen[start]=1;
    for(let i=0;i<cells.length;i++) {
      const id=cells[i], xx=id%nx, zz=Math.floor(id/nx);
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const a=xx+dx,b=zz+dz,k=b*nx+a;
        if(a>=0&&a<nx&&b>=0&&b<nx&&!seen[k]&&core[k]) { seen[k]=1;cells.push(k); }
      }
    }
    if(cells.length>largest.length) largest=cells;
  }
  if(largest.length<9) return null;
  const boundary=new Set();
  for(const id of largest){const x=id%nx,z=Math.floor(id/nx);for(const [dx,dz] of [[0,0],[1,0],[-1,0],[0,1],[0,-1]]){
    const a=x+dx,b=z+dz,k=b*nx+a;if(a>=0&&a<nx&&b>=0&&b<nx&&section[k])boundary.add(k);
  }}
  const points=[];
  for(const id of boundary) {
    const x=id%nx,z=Math.floor(id/nx);
    for(const [a,b] of [[x,z],[x+1,z],[x+1,z+1],[x,z+1]]) points.push([a*spacing,b*spacing]);
  }
  const hull=convexHull(points);
  return hull.reduce((n,p,i)=>n+Math.hypot(p[0]-hull[(i+1)%hull.length][0],p[1]-hull[(i+1)%hull.length][1]),0);
}
export function reconstruct(views, options={}) {
  if(views.length!==8) throw new Error('Servono tutte le 8 viste prima della ricostruzione.');
  const angles=views.map(v=>(v.angle+Math.PI*2)%(Math.PI*2)).sort((a,b)=>a-b);
  for(let i=0;i<8;i++) if(((i===7?angles[0]+Math.PI*2:angles[i+1])-angles[i])>Math.PI*5/12) throw new Error('Copertura angolare incompleta. Ripeti il giro.');
  const height=median(views.map(v=>v.heightCm));
  if(!height || height<80 || height>250) throw new Error('Scala non valida. Ripeti la calibrazione.');
  const nx=options.resolution || 80, ny=Math.round(nx*1.8), span=.9;
  const grid=new Uint8Array(nx*nx*ny), spacing=span*height/nx;
  const cameras=views.map(v=>({...v,cos:Math.cos(v.angle),sin:Math.sin(v.angle)}));
  if(cameras.some(v=>v.mask.data.length!==v.mask.width*v.mask.height)) throw new Error('Silhouette danneggiata.');
  let count=0;
  for(let y=0;y<ny;y++) for(let z=0;z<nx;z++) for(let x=0;x<nx;x++) {
    const xx=((x+.5)/nx-.5)*span, zz=((z+.5)/nx-.5)*span;
    let inside=true;
    for(const v of cameras) {
      const m=v.mask, u=Math.round(((xx*v.cos+zz*v.sin)/m.span+.5)*(m.width-1));
      const row=Math.round((y+.5)/ny*(m.height-1));
      if(u<0||u>=m.width) {inside=false;break;}
      // Intersect the observed silhouettes without inflating their widths.
      if(!m.data[row*m.width+u]) {inside=false;break;}
    }
    if(inside) {grid[(y*nx+z)*nx+x]=1;count++;}
  }
  if(count< nx*ny*.15) throw new Error('Le silhouette non sono coerenti. Mantieni posa e posizione durante il giro.');
  const metrics={height};
  for(const key of ['chest','waist','hip']) {
    const level=median(views.map(v=>v.levels?.[key]));
    if(level===null || level<.15 || level>.85) throw new Error('Riferimenti anatomici insufficienti. Ripeti la scansione.');
    const row=Math.round(level*(ny-1));
    const perimeter=median([-1,0,1].map(d=>sectionPerimeter(grid,nx,ny,row+d,spacing)));
    if(!perimeter || perimeter<20 || perimeter>220) throw new Error('Sezioni del busto non ricostruibili: ripeti con le braccia distanziate.');
    metrics[key]=perimeter;
  }
  const vertices=[],triangles=[], map=new Map();
  const vertex=(x,y,z)=>{
    const key=(y*(nx+1)+z)*(nx+1)+x;
    if(map.has(key)) return map.get(key);
    const id=vertices.length/3;map.set(key,id);
    vertices.push((x/nx-.5)*span*height,(.5-y/ny)*height,(z/nx-.5)*span*height);return id;
  };
  const faces=[
    [-1,0,0,[[0,0,0],[0,0,1],[0,1,1],[0,1,0]]],
    [1,0,0,[[1,0,1],[1,0,0],[1,1,0],[1,1,1]]],
    [0,-1,0,[[0,0,1],[0,0,0],[1,0,0],[1,0,1]]],
    [0,1,0,[[0,1,0],[0,1,1],[1,1,1],[1,1,0]]],
    [0,0,-1,[[1,0,0],[0,0,0],[0,1,0],[1,1,0]]],
    [0,0,1,[[0,0,1],[1,0,1],[1,1,1],[0,1,1]]]
  ];
  for(let y=0;y<ny;y++) for(let z=0;z<nx;z++) for(let x=0;x<nx;x++) {
    if(!grid[(y*nx+z)*nx+x]) continue;
    for(const [dx,dy,dz,corners] of faces) {
      const a=x+dx,b=y+dy,c=z+dz;
      if(a>=0&&a<nx&&b>=0&&b<ny&&c>=0&&c<nx&&grid[(b*nx+c)*nx+a])continue;
      const ids=corners.map(([i,j,k])=>vertex(x+i,y+j,z+k));
      // Camera rows point down; world Y points up, so reverse face winding.
      triangles.push(ids[0],ids[2],ids[1],ids[0],ids[3],ids[2]);
    }
  }
  return { vertices:new Float32Array(vertices), triangles:new Uint32Array(triangles), metrics, resolutionCm:spacing, method:'Visual hull ortografico da 8 silhouette; orientamenti stimati da posa', views:8 };
}
export function exportOBJ(model) {
  const lines=['# WoovIQ BodyScan: experimental silhouette reconstruction', '# Units: centimetres; not validated measurements'];
  for(let i=0;i<model.vertices.length;i+=3) lines.push(`v ${model.vertices[i].toFixed(3)} ${model.vertices[i+1].toFixed(3)} ${model.vertices[i+2].toFixed(3)}`);
  for(let i=0;i<model.triangles.length;i+=3) lines.push(`f ${model.triangles[i]+1} ${model.triangles[i+1]+1} ${model.triangles[i+2]+1}`);
  return lines.join('\n');
}
