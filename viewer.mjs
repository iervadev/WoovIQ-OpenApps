export class BodyViewer {
  constructor(canvas) {
    this.canvas=canvas; this.gl=canvas.getContext('webgl',{antialias:true,alpha:false});
    this.yaw=.35;this.pitch=0;this.zoom=1.7;this.buffer=null;
    if(!this.gl) throw new Error('Visualizzazione 3D non disponibile: puoi comunque scaricare il modello OBJ.');
    const gl=this.gl;
    const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error('Errore del renderer 3D.');return s;};
    const vertex=shader(gl.VERTEX_SHADER,`
      attribute vec3 position;attribute vec3 normal;
      uniform float yaw;uniform float pitch;uniform float zoom;uniform float aspect;uniform float height;
      varying vec3 n;
      vec3 rotate(vec3 p){p=vec3(cos(yaw)*p.x+sin(yaw)*p.z,p.y,-sin(yaw)*p.x+cos(yaw)*p.z);return vec3(p.x,cos(pitch)*p.y-sin(pitch)*p.z,sin(pitch)*p.y+cos(pitch)*p.z);}
      void main(){vec3 p=rotate(position/height);n=rotate(normal);gl_Position=vec4(p.x*zoom/aspect,p.y*zoom,p.z*.5,1.0);}`);
    const fragment=shader(gl.FRAGMENT_SHADER,`precision mediump float;varying vec3 n;void main(){float light=.32+.68*abs(dot(normalize(n),normalize(vec3(.4,.8,1.))));gl_FragColor=vec4(vec3(.25,.78,.86)*light,1.);}`);
    this.program=gl.createProgram();gl.attachShader(this.program,vertex);gl.attachShader(this.program,fragment);gl.linkProgram(this.program);
    gl.deleteShader(vertex);gl.deleteShader(fragment);
    if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw new Error('Impossibile inizializzare la vista 3D.');
    canvas.addEventListener('pointerdown',e=>{this.drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
    canvas.addEventListener('pointermove',e=>{if(!this.drag)return;this.yaw+=(e.clientX-this.drag.x)*.012;this.pitch=Math.max(-.7,Math.min(.7,this.pitch+(e.clientY-this.drag.y)*.008));this.drag={x:e.clientX,y:e.clientY};this.draw();});
    for(const event of ['pointerup','pointercancel'])canvas.addEventListener(event,()=>{this.drag=null;});
    canvas.addEventListener('keydown',e=>{if(e.key==='ArrowLeft')this.yaw-=.15;else if(e.key==='ArrowRight')this.yaw+=.15;else return;e.preventDefault();this.draw();});
    this.resizeObserver=new ResizeObserver(()=>this.draw());this.resizeObserver.observe(canvas);
  }
  setModel(model) {
    this.model=model;const gl=this.gl, data=[];
    for(let i=0;i<model.triangles.length;i+=3) {
      const points=[0,1,2].map(k=>Array.from(model.vertices.slice(model.triangles[i+k]*3,model.triangles[i+k]*3+3)));
      const a=points[1].map((v,k)=>v-points[0][k]),b=points[2].map((v,k)=>v-points[0][k]);
      const n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],length=Math.hypot(...n)||1;
      for(const p of points)data.push(...p,...n.map(v=>v/length));
    }
    if(this.buffer)gl.deleteBuffer(this.buffer);
    this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);
    this.count=data.length/6;this.draw();
  }
  clear(){if(this.buffer)this.gl.deleteBuffer(this.buffer);this.buffer=null;this.model=null;this.gl.clear(this.gl.COLOR_BUFFER_BIT|this.gl.DEPTH_BUFFER_BIT);}
  draw(){
    if(!this.model || !this.buffer)return;
    const gl=this.gl,rect=this.canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);
    this.canvas.width=Math.max(1,Math.round(rect.width*dpr));this.canvas.height=Math.max(1,Math.round(rect.height*dpr));
    gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clearColor(.02,.04,.08,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.useProgram(this.program);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
    for(const [name,offset] of [['position',0],['normal',12]]){const loc=gl.getAttribLocation(this.program,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,3,gl.FLOAT,false,24,offset);}
    for(const [name,value] of Object.entries({yaw:this.yaw,pitch:this.pitch,zoom:this.zoom,aspect:this.canvas.width/this.canvas.height,height:this.model.metrics.height}))gl.uniform1f(gl.getUniformLocation(this.program,name),value);
    gl.drawArrays(gl.TRIANGLES,0,this.count);
  }
}
