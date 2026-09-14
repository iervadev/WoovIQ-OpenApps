// Analytical phantom used only by tests, never by the scan or result UI.
export function phantomViews() {
  const parts=[
    [0,.065,.047,.065,.047], [0,.15,.03,.04,.035],
    [0,.27,.105,.105,.055], [0,.4,.082,.10,.052], [0,.51,.105,.085,.073],
    [-.18,.3,.032,.12,.033],[.18,.3,.032,.12,.033],
    [-.23,.45,.027,.095,.027],[.23,.45,.027,.095,.027],
    [-.25,.54,.025,.035,.018],[.25,.54,.025,.035,.018],
    [-.056,.67,.047,.15,.05],[.056,.67,.047,.15,.05],
    [-.06,.86,.03,.105,.036],[.06,.86,.03,.105,.036],
    [-.06,.98,.034,.02,.06],[.06,.98,.034,.02,.06]
  ];
  return Array.from({length:8},(_,index)=>{
    const angle=index*Math.PI/4,width=128,height=192,span=.9,data=new Uint8Array(width*height);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const xx=(x/(width-1)-.5)*span,yy=y/(height-1);
      if(parts.some(([cx,cy,rx,ry,rz])=>{
        const projected=Math.hypot(rx*Math.cos(angle),rz*Math.sin(angle));
        return ((xx-cx*Math.cos(angle))/projected)**2+((yy-cy)/ry)**2<=1;
      }))data[y*width+x]=1;
    }
    return {angle,heightCm:175,levels:{chest:.28,waist:.4,hip:.51},mask:{width,height,span,data}};
  });
}
