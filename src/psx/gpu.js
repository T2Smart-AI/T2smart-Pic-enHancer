/* T2Smart-PicHancer — M1 WebGL2 grade + detail renderer.
   GPU port of T2SEngine.gradePass + detailPass (pixel-parity with the CPU path).
   Flow: base canvas -> texture -> grade program -> FBO -> separable box blur
   (H+V) -> detail composite -> readPixels -> ImageData (caller runs heal/text on CPU).
   Look grades run through a cached 32^3 3D LUT (trilinear in-shader), so all 50+
   looks work with zero shader recompiles. Curves run through a 256x1 RGBA LUT.
   Grain is a deterministic spatial hash (no shimmer, matches fixed CPU seed).
   Always reads back (no direct-to-screen yet) — readback of 0.96MP is ~3-5ms,
   still ~10x faster than the CPU detail pass it replaces. */
(function () {
  "use strict";

  let gl = null, tried = false, ok = false;
  let progGrade = null, progBlur = null, progDetail = null, progLayer = null, progLens = null, progBokeh = null, progFace = null;
  let texSrc = null, texLUT = null, texCurve = null, texMask = null;
  let texGrade = null, texBH = null, texBV = null, texLens = null, texBokeh = null;
  let fboGrade = null, fboBH = null, fboBV = null, fboLens = null, fboBokeh = null;
  let FW = 0, FH = 0;
  const LUT_N = 32;
  let lutLastId = null;

  const VERT = `#version 300 es
out vec2 vUv;
void main(){
  vec2 p = vec2(gl_VertexID==0?-1.0:(gl_VertexID==1?3.0:-1.0),
                gl_VertexID==0?-1.0:(gl_VertexID==1?-1.0:3.0));
  vUv = p*0.5+0.5;
  gl_Position = vec4(p,0.0,1.0);
}`;

  const FRAG_GRADE = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uRes;
uniform float uExpM, uTmp, uTnt, uCF, uHL, uSH, uWH, uBL;
uniform float uVib, uSatM, uFade, uDeh, uVig, uGrain, uSeed, uLookAmt;
uniform float uShift, uMirror, uPixelN, uPixelAmt, uHalf, uScan, uEdge, uLeak, uLeakVar;
uniform float uPoster;
uniform float uUseLUT, uUseCurves;
uniform sampler2D uLUT;
uniform float uLutN;
uniform sampler2D uCurves;
out vec4 outColor;
vec3 fetchLUT(vec3 idx){
  return texelFetch(uLUT, ivec2(int(idx.z)*int(uLutN)+int(idx.x), int(idx.y)), 0).rgb*255.0;
}
vec3 sampleLUT(vec3 c){
  vec3 p = clamp(c/255.0,0.0,1.0)*(uLutN-1.0);
  vec3 p0 = floor(p); vec3 f = p-p0;
  vec3 p1 = min(p0+1.0, uLutN-1.0);
  vec3 c000=fetchLUT(vec3(p0.x,p0.y,p0.z)), c100=fetchLUT(vec3(p1.x,p0.y,p0.z));
  vec3 c010=fetchLUT(vec3(p0.x,p1.y,p0.z)), c110=fetchLUT(vec3(p1.x,p1.y,p0.z));
  vec3 c001=fetchLUT(vec3(p0.x,p0.y,p1.z)), c101=fetchLUT(vec3(p1.x,p0.y,p1.z));
  vec3 c011=fetchLUT(vec3(p0.x,p1.y,p1.z)), c111=fetchLUT(vec3(p1.x,p1.y,p1.z));
  return mix(mix(mix(c000,c100,f.x),mix(c010,c110,f.x),f.y),
             mix(mix(c001,c101,f.x),mix(c011,c111,f.x),f.y), f.z);
}
float sstep(float a,float b,float x){
  float t = clamp((x-a)/(b-a),0.0,1.0); return t*t*(3.0-2.0*t);
}
float hashInt(vec2 p, float seed){
  uint x = uint(int(p.x)); uint y = uint(int(p.y)); uint s = uint(int(seed));
  uint h = x*374761393u + y*668265263u + s*974634u;
  h = (h ^ (h >> 13u))*1274126177u;
  h ^= h >> 16u;
  return float(h)/4294967296.0;
}
void main(){
  vec3 c = texture(uSrc, vUv).rgb*255.0;
  vec2 px1 = vec2(1.0)/uRes;
  if(abs(uShift)>0.001){ float s = uShift*px1.x; c.r = texture(uSrc, vUv+vec2(s,0.0)).r*255.0; c.b = texture(uSrc, vUv-vec2(s,0.0)).b*255.0; }
  if(uMirror>0.0005){ vec3 mm = texture(uSrc, vec2(1.0-vUv.x, vUv.y)).rgb*255.0; c = mix(c, mm, uMirror); }
  if(uPixelN>1.5){ vec2 bp = floor(vUv*uRes/uPixelN)*uPixelN+0.5*uPixelN; vec3 pp2 = texture(uSrc, bp/uRes).rgb*255.0; c = mix(c, pp2, uPixelAmt); }
  if(uLookAmt>0.0005 && uUseLUT>0.5){ c = mix(c, sampleLUT(c), uLookAmt); }
  if(uPoster>1.5){ c = floor(c/255.0*uPoster)/uPoster*255.0; }
  c *= uExpM;
  c.r += uTmp*0.5; c.b -= uTmp*0.5;
  c.g += uTnt*0.42; c.r -= uTnt*0.18; c.b -= uTnt*0.18;
  c = uCF*(c-128.0)+128.0;
  float lum01 = clamp((0.2126*c.r+0.7152*c.g+0.0722*c.b)/255.0,0.0,1.0);
  float hlM = smoothstep(0.5,1.0,lum01);
  float shM = 1.0-smoothstep(0.0,0.5,lum01);
  float kH = uHL/100.0*62.0*hlM;
  c += kH*(kH>=0.0 ? (1.0-c/255.0) : (c/255.0));
  float kS = uSH/100.0*62.0*shM;
  c += kS*(kS>=0.0 ? (1.0-c/255.0) : (c/255.0));
  vec3 cn = c/255.0;
  c += uWH*0.42*cn*cn;
  vec3 iv = 1.0-cn;
  c += uBL*0.42*iv*iv;
  if(uUseCurves>0.5){
    c.r = texture(uCurves, vec2((clamp(c.r,0.0,255.0)+0.5)/256.0,0.5)).r*255.0;
    c.g = texture(uCurves, vec2((clamp(c.g,0.0,255.0)+0.5)/256.0,0.5)).g*255.0;
    c.b = texture(uCurves, vec2((clamp(c.b,0.0,255.0)+0.5)/256.0,0.5)).b*255.0;
    c.r = texture(uCurves, vec2((clamp(c.r,0.0,255.0)+0.5)/256.0,0.5)).a*255.0;
    c.g = texture(uCurves, vec2((clamp(c.g,0.0,255.0)+0.5)/256.0,0.5)).a*255.0;
    c.b = texture(uCurves, vec2((clamp(c.b,0.0,255.0)+0.5)/256.0,0.5)).a*255.0;
  }
  float lum = 0.2126*c.r+0.7152*c.g+0.0722*c.b;
  if(abs(uVib)>0.0005){
    float mx = max(c.r,max(c.g,c.b)), mn = min(c.r,min(c.g,c.b));
    float s0 = mx<=0.0 ? 0.0 : (mx-mn)/(mx+1.0);
    float kk = 1.0+(uVib/100.0)*(1.0-s0)*1.1;
    c = vec3(lum)+(c-vec3(lum))*kk;
  }
  c = vec3(lum)+(c-vec3(lum))*uSatM;
  if(abs(uFade)>0.0005){
    float f = uFade/100.0;
    c += f*30.0*(1.0-c/255.0)-f*12.0*(c/255.0);
  }
  if(abs(uDeh)>0.0005){
    float mid = 1.0-abs(lum/255.0-0.5)*2.0;
    float k3 = uDeh/100.0;
    c += k3*((c-128.0)*0.22*mid+(c-vec3(lum))*0.25);
  }
  if(uVig>0.0005){
    vec2 xy = vUv*uRes; vec2 cc = uRes*0.5;
    float maxD = max(1.0,length(cc));
    float dist = length((xy-cc)/maxD);
    float m = 1.0-min(1.0,uVig/100.0)*0.8*pow(sstep(0.42,1.0,dist),1.4);
    c *= m;
  }
  if(uLeak>0.0005){
    float LK = uLeak/100.0;
    if(uLeakVar>1.5){
      float mT = LK*(1.0-vUv.y)*(1.0-vUv.y);
      float mB = LK*vUv.y*vUv.y;
      c += vec3(mT*150.0+mB*12.0, mT*95.0+mB*110.0, mT*30.0+mB*125.0);
    } else {
      float mL = LK*(1.0-vUv.x)*(1.0-vUv.x);
      float t2 = clamp(vUv.x+(1.0-vUv.y), 0.0, 1.0);
      float mR = LK*t2*t2*0.5;
      c += vec3(mL*140.0+mR*150.0, mL*70.0+mR*30.0, mL*22.0+mR*95.0);
    }
  }
  if(uHalf>0.0005){
    vec2 pp = vUv*uRes;
    vec2 gg = mod(pp, 5.0)-2.0;
    float dd = clamp(length(gg)/2.6, 0.0, 1.0);
    float lh = clamp((0.2126*c.r+0.7152*c.g+0.0722*c.b)/255.0, 0.0, 1.0);
    float rr = sqrt(lh);
    float dt = 1.0-sstep(rr-0.16, rr+0.16, dd);
    float ink = mix(25.0, 238.0, dt);
    c = mix(c, vec3(ink), uHalf/100.0);
  }
  if(uScan>0.0005){
    float yy = floor(vUv.y*uRes.y);
    float sl = mod(yy,2.0)<1.0 ? 1.0 : 0.74;
    c *= mix(1.0, sl, uScan/100.0);
  }
  if(uEdge>0.0005){
    float e00 = dot(texture(uSrc, vUv-vec2(px1.x,px1.y)).rgb*255.0, vec3(0.3333333));
    float e10 = dot(texture(uSrc, vUv-vec2(0.0,px1.y)).rgb*255.0, vec3(0.3333333));
    float e20 = dot(texture(uSrc, vUv+vec2(px1.x,-px1.y)).rgb*255.0, vec3(0.3333333));
    float e01 = dot(texture(uSrc, vUv-vec2(px1.x,0.0)).rgb*255.0, vec3(0.3333333));
    float e21 = dot(texture(uSrc, vUv+vec2(px1.x,0.0)).rgb*255.0, vec3(0.3333333));
    float e02 = dot(texture(uSrc, vUv+vec2(-px1.x,px1.y)).rgb*255.0, vec3(0.3333333));
    float e12 = dot(texture(uSrc, vUv+vec2(0.0,px1.y)).rgb*255.0, vec3(0.3333333));
    float e22 = dot(texture(uSrc, vUv+vec2(px1.x,px1.y)).rgb*255.0, vec3(0.3333333));
    float dXe = -e00-2.0*e01-e02+e20+2.0*e21+e22;
    float dYe = -e00-2.0*e10-e20+e02+2.0*e12+e22;
    float ee = clamp((abs(dXe)+abs(dYe))/255.0, 0.0, 1.0);
    float ek = clamp(ee*uEdge/100.0*1.35, 0.0, 1.0);
    c = c*(1.0-0.3*ek) + vec3(30.0,225.0,255.0)*ek;
  }
  if(uGrain>0.0005){
    float n = (hashInt(floor(vUv*uRes), uSeed)-0.5)*(uGrain/100.0)*54.0;
    c += vec3(n);
  }
  outColor = vec4(clamp(c,0.0,255.0)/255.0,1.0);
}`;

  const FRAG_BLUR = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uStep;
out vec4 o;
void main(){
  vec3 s = texture(uTex,vUv).rgb;
  s += texture(uTex,vUv-uStep*2.0).rgb;
  s += texture(uTex,vUv-uStep).rgb;
  s += texture(uTex,vUv+uStep).rgb;
  s += texture(uTex,vUv+uStep*2.0).rgb;
  o = vec4(s/5.0,1.0);
}`;

  const FRAG_DETAIL = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uOrig, uBlur;
uniform float uDetAmt, uLumMix, uColMix;
out vec4 o;
void main(){
  vec3 r = texture(uOrig,vUv).rgb*255.0;
  vec3 b = texture(uBlur,vUv).rgb*255.0;
  r += (r-b)*uDetAmt;
  r = mix(r,b,uLumMix);
  if(abs(uColMix)>0.0005){
    float lum = 0.2126*r.r+0.7152*r.g+0.0722*r.b;
    float lumB = 0.2126*b.r+0.7152*b.g+0.0722*b.b;
    r = vec3(lum)+mix(r-vec3(lum), b-vec3(lumB), vec3(uColMix));
  }
  o = vec4(clamp(r,0.0,255.0)/255.0,1.0);
}`;

  // Lens correction warp: distortion (k1>0 fixes barrel) + lateral CA + vignette lift.
  // Must match T2S_LENS.lensPass mapping exactly.
  const FRAG_LENS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform float uAsp, uK1, uCA, uVig, uMaxSide;
out vec4 o;
void main(){
  vec2 p = vec2((vUv.x-0.5)*uAsp, vUv.y-0.5);
  float r2 = dot(p,p);
  float f = 1.0-uK1*r2;
  vec2 suv = vec2(0.5+p.x*f/uAsp, 0.5+p.y*f);
  vec3 c;
  if(abs(uCA)>0.0001){
    float cf = 1.0+(uCA/uMaxSide)*r2*24.0;
    vec2 dlt = suv-0.5;
    c.r = texture(uSrc, 0.5+dlt*cf).r;
    c.g = texture(uSrc, suv).g;
    c.b = texture(uSrc, 0.5+dlt/cf).b;
    c *= 255.0;
  } else {
    c = texture(uSrc, suv).rgb*255.0;
  }
  if(uVig>0.0005){
    float maxR = length(vec2(0.5*uAsp,0.5));
    float g = min(2.0, 1.0+uVig/100.0*pow(smoothstep(0.4,1.0,length(p)/maxR),1.0)*1.2);
    c *= g;
  }
  o = vec4(clamp(c,0.0,255.0)/255.0,1.0);
}`;

  // M3 portrait: depth bokeh gather (poisson disk, CoC-scaled) + highlight bloom.
  const FRAG_BOKEH = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uRes;
uniform float uMaxR, uHi, uFx, uFy, uSize, uFeather, uMode, uAngle, uAsp;
out vec4 o;
float coc(vec2 uv){
  float d;
  if(uMode>0.5){
    d = abs((uv.x-uFx)*cos(uAngle)+(uv.y-uFy)*sin(uAngle))*max(uAsp,1.0);
  } else {
    vec2 dd = vec2((uv.x-uFx)*uAsp, uv.y-uFy);
    d = length(dd)/length(vec2(0.5*uAsp,0.5));
  }
  return clamp((d-uSize)/max(uFeather,0.05),0.0,1.0);
}
void main(){
  float c = coc(vUv);
  vec3 acc = texture(uSrc,vUv).rgb;
  if(c>0.003 && uMaxR>0.5){
    float hj = fract(sin(dot(vUv*uRes, vec2(12.9898,78.233)))*43758.5453);
    float an = hj*6.2831853;
    mat2 rot = mat2(cos(an),-sin(an),sin(an),cos(an));
    vec2 R = vec2(uMaxR*c)/uRes;
    acc += texture(uSrc,vUv+R*(rot*vec2(-0.94,-0.40))).rgb; acc += texture(uSrc,vUv+R*(rot*vec2(0.94,0.40))).rgb;
    acc += texture(uSrc,vUv+R*(rot*vec2(-0.64,0.70))).rgb; acc += texture(uSrc,vUv+R*(rot*vec2(0.64,-0.70))).rgb;
    acc += texture(uSrc,vUv+R*(rot*vec2(-0.31,-0.95))).rgb; acc += texture(uSrc,vUv+R*(rot*vec2(0.31,0.95))).rgb;
    acc += texture(uSrc,vUv+R*(rot*vec2(-0.13,-0.50))).rgb; acc += texture(uSrc,vUv+R*(rot*vec2(0.13,0.50))).rgb;
    acc += texture(uSrc,vUv+R*(rot*vec2(-0.55,-0.13))).rgb; acc += texture(uSrc,vUv+R*(rot*vec2(0.55,0.13))).rgb;
    acc += texture(uSrc,vUv+R*(rot*vec2(-0.26,0.26))).rgb; acc += texture(uSrc,vUv+R*(rot*vec2(0.26,-0.26))).rgb;
    acc += texture(uSrc,vUv+R*(rot*vec2(-0.80,0.10))).rgb; acc += texture(uSrc,vUv+R*(rot*vec2(0.80,-0.10))).rgb;
    acc += texture(uSrc,vUv+R*(rot*vec2(-0.40,0.55))).rgb; acc += texture(uSrc,vUv+R*(rot*vec2(0.40,-0.55))).rgb;
    acc += texture(uSrc,vUv+R*(rot*vec2(0.05,-0.80))).rgb; acc += texture(uSrc,vUv+R*(rot*vec2(-0.05,0.80))).rgb;
    acc += texture(uSrc,vUv+R*(rot*vec2(0.70,0.55))).rgb; acc += texture(uSrc,vUv+R*(rot*vec2(-0.70,-0.55))).rgb;
    acc += texture(uSrc,vUv+R*(rot*vec2(0.30,-0.35))).rgb; acc += texture(uSrc,vUv+R*(rot*vec2(-0.30,0.35))).rgb;
    acc += texture(uSrc,vUv+R*(rot*vec2(0.0,0.0))).rgb; acc += texture(uSrc,vUv+R*(rot*vec2(0.45,0.0))).rgb;
    acc /= 25.0;
    float wgt = c;
    vec3 sharp = texture(uSrc,vUv).rgb;
    acc = mix(sharp, acc, wgt);
  }
  vec3 col = acc*255.0;
  if(uHi>0.0005 && c>0.003){
    float lum = 0.2126*col.r+0.7152*col.g+0.0722*col.b;
    float bloom = max(0.0,lum-200.0)/55.0*uHi*c*25.0;
    col += bloom*vec3(1.0,0.98,0.94);
  }
  o = vec4(clamp(col,0.0,255.0)/255.0,1.0);
}`;

  // M3 face refine: skin-weighted lighten/warmth/smooth inside ≤4 ellipses.
  const FRAG_FACE = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uImg, uBlur;
uniform vec4 uFaces[4];
uniform float uFaceOn[4];
uniform float uLighten, uSmooth, uWarm;
out vec4 o;
float skin(vec3 c){
  float y = 0.299*c.r+0.587*c.g+0.114*c.b;
  if(y<40.0) return 0.0;
  float cb = 128.0-0.169*c.r-0.331*c.g+0.5*c.b;
  float cr = 128.0+0.5*c.r-0.419*c.g-0.081*c.b;
  return (cb>77.0&&cb<127.0&&cr>133.0&&cr<173.0)?1.0:0.0;
}
void main(){
  vec3 c = texture(uImg,vUv).rgb*255.0;
  float m = 0.0;
  for(int i=0;i<4;i++){
    if(uFaceOn[i]<0.5) continue;
    vec2 dd = (vUv-uFaces[i].xy)/max(uFaces[i].zw,vec2(1e-4));
    float e = dot(dd,dd);
    if(e<1.0) m = max(m, 1.0-e*e);
  }
  if(m>0.01){
    float sk = skin(c);
    m *= 0.35+0.65*sk;
    vec3 b = texture(uBlur,vUv).rgb*255.0;
    c += (b-c)*(uSmooth/100.0*m);
    float k = uLighten*0.6*m;
    vec3 up = 1.0-c/255.0, dn = c/255.0;
    c += k*(k>=0.0?up:dn);
    c.r += uWarm*0.3*m; c.b -= uWarm*0.3*m;
  }
  o = vec4(clamp(c,0.0,255.0)/255.0,1.0);
}`;

  // M2 selective layer: same pixel math as T2S_MASKS.applyLayers, masked by uMask.r.
  const FRAG_LAYER = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uImg, uMask;
uniform float uExpM, uTmp, uTnt, uCF, uHL, uSH, uWH, uBL, uVib, uSatM, uOp;
out vec4 o;
void main(){
  vec3 c = texture(uImg,vUv).rgb*255.0;
  float m = texture(uMask,vUv).r*uOp;
  if(m>0.003){
    vec3 a = c*uExpM;
    a.r += uTmp*0.5; a.b -= uTmp*0.5;
    a.g += uTnt*0.42; a.r -= uTnt*0.18; a.b -= uTnt*0.18;
    a = uCF*(a-128.0)+128.0;
    float lum01 = clamp((0.2126*a.r+0.7152*a.g+0.0722*a.b)/255.0,0.0,1.0);
    float kH = uHL/100.0*62.0*smoothstep(0.5,1.0,lum01);
    a += kH*(kH>=0.0 ? (1.0-a/255.0) : (a/255.0));
    float kS = uSH/100.0*62.0*(1.0-smoothstep(0.0,0.5,lum01));
    a += kS*(kS>=0.0 ? (1.0-a/255.0) : (a/255.0));
    vec3 cn = a/255.0;
    a += uWH*0.42*cn*cn;
    vec3 iv = 1.0-cn;
    a += uBL*0.42*iv*iv;
    float lum = 0.2126*a.r+0.7152*a.g+0.0722*a.b;
    if(abs(uVib)>0.0005){
      float mx = max(a.r,max(a.g,a.b)), mn = min(a.r,min(a.g,a.b));
      float s0 = mx<=0.0 ? 0.0 : (mx-mn)/(mx+1.0);
      a = vec3(lum)+(a-vec3(lum))*(1.0+(uVib/100.0)*(1.0-s0)*1.1);
    }
    a = vec3(lum)+(a-vec3(lum))*uSatM;
    c = mix(c, clamp(a,0.0,255.0), m);
  }
  o = vec4(clamp(c,0.0,255.0)/255.0,1.0);
}`;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error("shader: " + log);
    }
    return s;
  }
  function link(vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error("link: " + gl.getProgramInfoLog(p));
    }
    return p;
  }
  function mkTex(nearest) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, nearest ? gl.NEAREST : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, nearest ? gl.NEAREST : gl.LINEAR);
    return t;
  }
  function mkTarget() {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, FW, FH);
    const f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error("fbo incomplete " + FW + "x" + FH);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return [t, f];
  }

  function ensure() {
    if (tried) return ok;
    tried = true;
    try {
      const cv = document.createElement("canvas");
      gl = cv.getContext("webgl2", { antialias: false, depth: false, stencil: false, alpha: false, preserveDrawingBuffer: false });
      if (!gl) { ok = false; return ok; }
      try { gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE); } catch (e) {}
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      const vs = compile(gl.VERTEX_SHADER, VERT);
      progGrade = link(vs, compile(gl.FRAGMENT_SHADER, FRAG_GRADE));
      progBlur = link(vs, compile(gl.FRAGMENT_SHADER, FRAG_BLUR));
      progDetail = link(vs, compile(gl.FRAGMENT_SHADER, FRAG_DETAIL));
      progLayer = link(vs, compile(gl.FRAGMENT_SHADER, FRAG_LAYER));
      progLens = link(vs, compile(gl.FRAGMENT_SHADER, FRAG_LENS));
      progBokeh = link(vs, compile(gl.FRAGMENT_SHADER, FRAG_BOKEH));
      progFace = link(vs, compile(gl.FRAGMENT_SHADER, FRAG_FACE));
      for (const p of [progGrade, progBlur, progDetail, progLayer, progLens, progBokeh, progFace]) {
        p._u = {};
        const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < n; i++) {
          const inf = gl.getActiveUniform(p, i);
          p._u[inf.name] = gl.getUniformLocation(p, inf.name);
        }
      }
      texSrc = mkTex(false);
      texLUT = mkTex(true);
      texCurve = mkTex(false);
      texMask = mkTex(false);
      ok = true;
    } catch (e) {
      console.warn("[t2s-gpu] disabled:", e);
      ok = false;
    }
    return ok;
  }

  function ensureTargets(w, h) {
    if (FW === w && FH === h && texGrade) return;
    for (const t of [texGrade, texBH, texBV, texLens, texBokeh]) if (t) gl.deleteTexture(t);
    for (const f of [fboGrade, fboBH, fboBV, fboLens, fboBokeh]) if (f) gl.deleteFramebuffer(f);
    FW = w; FH = h;
    [texGrade, fboGrade] = mkTarget();
    [texBH, fboBH] = mkTarget();
    [texBV, fboBV] = mkTarget();
    [texLens, fboLens] = mkTarget();
    [texBokeh, fboBokeh] = mkTarget();
    gl.viewport(0, 0, w, h);
  }

  function setTex(unit, tex, loc) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(loc, unit);
  }

  function buildLUT(look) {
    // 32^3 lattice evaluated through the look's JS grade fn, packed as 1024x32 RGBA.
    // Layout must match sampleLUT's fetch: texel x = b*N + r, y = g.
    const N = LUT_N, W = N * N, H = N;
    const data = new Uint8Array(W * H * 4);
    const g = look.grade;
    let p = 0;
    for (let gg = 0; gg < N; gg++) {
      for (let b = 0; b < N; b++) {
        for (let r = 0; r < N; r++) {
          const R = r / (N - 1) * 255, G = gg / (N - 1) * 255, B = b / (N - 1) * 255;
          const q = g(R, G, B);
          data[p++] = q[0] < 0 ? 0 : q[0] > 255 ? 255 : Math.round(q[0]);
          data[p++] = q[1] < 0 ? 0 : q[1] > 255 ? 255 : Math.round(q[1]);
          data[p++] = q[2] < 0 ? 0 : q[2] > 255 ? 255 : Math.round(q[2]);
          data[p++] = 255;
        }
      }
    }
    gl.bindTexture(gl.TEXTURE_2D, texLUT);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  }

  function drawTo(fbo) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, FW, FH);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function process(base, S, look, stack) {
    if (!ensure()) throw new Error("webgl2 unavailable");
    if (gl.isContextLost()) throw new Error("gl context lost");
    const w = base.width, h = base.height;
    if (!w || !h) throw new Error("empty base");
    ensureTargets(w, h);
    const U = progGrade._u;

    // upload base (top row -> texture row 0; readback order matches ImageData, no flip needed)
    gl.bindTexture(gl.TEXTURE_2D, texSrc);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, base);

    // lens warp first (resampling on raw pixels, before grading)
    let gradeTex = texSrc;
    const LN = S.lens;
    if (LN && LN.enabled && ((LN.k1 || 0) || (LN.ca || 0) || (LN.vig || 0))) {
      gl.useProgram(progLens);
      const UN = progLens._u;
      setTex(0, texSrc, UN.uSrc);
      gl.uniform1f(UN.uAsp, w / h);
      gl.uniform1f(UN.uK1, LN.k1 || 0);
      gl.uniform1f(UN.uCA, LN.ca || 0);
      gl.uniform1f(UN.uVig, LN.vig || 0);
      gl.uniform1f(UN.uMaxSide, Math.max(w, h));
      drawTo(fboLens);
      gradeTex = texLens;
    }

    // M3 bokeh on raw pixels (optical blur precedes grading)
    const BK = S.bokeh;
    if (BK && BK.enabled && (BK.amount || 0) > 0) {
      gl.useProgram(progBokeh);
      const UB = progBokeh._u;
      setTex(0, gradeTex, UB.uSrc);
      gl.uniform2f(UB.uRes, w, h);
      gl.uniform1f(UB.uMaxR, (BK.amount || 0) / 100 * Math.min(w, h) * 0.045);
      gl.uniform1f(UB.uHi, (BK.highlights || 0) / 100);
      gl.uniform1f(UB.uFx, BK.fx == null ? 0.5 : BK.fx);
      gl.uniform1f(UB.uFy, BK.fy == null ? 0.5 : BK.fy);
      gl.uniform1f(UB.uSize, BK.size == null ? 0.22 : BK.size);
      gl.uniform1f(UB.uFeather, BK.feather == null ? 0.4 : BK.feather);
      gl.uniform1f(UB.uMode, (BK.mode || "point") === "linear" ? 1 : 0);
      gl.uniform1f(UB.uAngle, ((BK.angle || 0) * Math.PI) / 180);
      gl.uniform1f(UB.uAsp, w / h);
      drawTo(fboBokeh);
      gradeTex = texBokeh;
    }

    // Committed look stack (explicit array; collage cells pass none): run each
    // layer through progGrade with tone uniforms zeroed, ping-ponging scratch
    // targets. Mirrors T2SEngine.gradeStack exactly (same LUT + uniforms).
    if (stack && stack.length) {
      const all = window.T2S_LOOKS || [];
      const pairs = [[texGrade, fboGrade], [texBH, fboBH], [texBV, fboBV]];
      let pi = 0;
      for (const Ld of stack) {
        if (!Ld) continue;
        const amt = Ld.amount == null ? 100 : Ld.amount;
        if (!(amt > 0)) continue;
        const lk = all.find((q) => q.id === Ld.id);
        if (!lk || lk.id === "normal" || !lk.grade) continue;
        const laA = Math.min(1, amt / 100);
        if (laA <= 0.0005) continue;
        if (lutLastId !== lk.id) { buildLUT(lk); lutLastId = lk.id; }
        let dst = pairs[pi % pairs.length];
        if (dst[0] === gradeTex) { pi++; dst = pairs[pi % pairs.length]; }
        pi++;
        const fxN = lk.fx || {};
        gl.useProgram(progGrade);
        setTex(0, gradeTex, U.uSrc);
        gl.uniform2f(U.uRes, w, h);
        gl.uniform1f(U.uExpM, 1);
        gl.uniform1f(U.uTmp, 0);
        gl.uniform1f(U.uTnt, 0);
        gl.uniform1f(U.uCF, 1);
        gl.uniform1f(U.uHL, 0);
        gl.uniform1f(U.uSH, 0);
        gl.uniform1f(U.uWH, 0);
        gl.uniform1f(U.uBL, 0);
        gl.uniform1f(U.uVib, 0);
        gl.uniform1f(U.uSatM, 1);
        gl.uniform1f(U.uFade, (fxN.fade || 0) * laA);
        gl.uniform1f(U.uDeh, 0);
        gl.uniform1f(U.uVig, (fxN.vignette || 0) * laA * 0.5);
        gl.uniform1f(U.uGrain, (fxN.grain || 0) * laA * 0.5);
        gl.uniform1f(U.uShift, (fxN.shift || 0) * laA);
        gl.uniform1f(U.uMirror, ((fxN.mirror || 0) / 100) * laA);
        gl.uniform1f(U.uPixelN, Math.round(fxN.pixel || 0));
        gl.uniform1f(U.uPixelAmt, (fxN.pixel || 0) > 1 ? laA : 0);
        gl.uniform1f(U.uHalf, (fxN.half || 0) * laA);
        gl.uniform1f(U.uScan, (fxN.scan || 0) * laA);
        gl.uniform1f(U.uEdge, (fxN.edge || 0) * laA);
        gl.uniform1f(U.uLeak, (fxN.leak || 0) * laA);
        gl.uniform1f(U.uLeakVar, fxN.leakVar || 1);
        gl.uniform1f(U.uPoster, Math.round(fxN.poster || 0));
        gl.uniform1f(U.uSeed, 7.0);
        gl.uniform1f(U.uLookAmt, laA);
        gl.uniform1f(U.uUseLUT, 1);
        gl.uniform1f(U.uUseCurves, 0);
        setTex(1, texLUT, U.uLUT); gl.uniform1f(U.uLutN, LUT_N);
        drawTo(dst[1]);
        gradeTex = dst[0];
      }
    }

    // look LUT
    const lookAmt = (look && look.id !== "normal") ? (S.lookAmount == null ? 1 : S.lookAmount / 100) : 0;
    let useLUT = 0;
    if (look && look.id !== "normal" && lookAmt > 0.0005 && look.grade) {
      if (lutLastId !== look.id) { buildLUT(look); lutLastId = look.id; }
      useLUT = 1;
    }

    // curves LUT via shared CPU builder (pixel-identical math)
    let useCurves = 0;
    const clut = window.T2SEngine && window.T2SEngine.curvesLUT
      ? window.T2SEngine.curvesLUT(S.curves) : null;
    if (clut) {
      const cd = new Uint8Array(256 * 4);
      for (let i = 0; i < 256; i++) {
        cd[i * 4] = clut.r[i]; cd[i * 4 + 1] = clut.g[i];
        cd[i * 4 + 2] = clut.b[i]; cd[i * 4 + 3] = clut.m[i];
      }
      gl.bindTexture(gl.TEXTURE_2D, texCurve);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, cd);
      useCurves = 1;
    }

    // combined look FX (must match engine.js gradePass exactly)
    const la100 = (S.lookAmount == null ? 100 : S.lookAmount) / 100;
    const fade = (S.fade || 0) + (look && look.fx && look.fx.fade ? look.fx.fade * la100 : 0);
    const vig = (S.vignette || 0) + (look && look.fx && look.fx.vignette ? look.fx.vignette * la100 * 0.5 : 0);
    const grn = (S.grain || 0) + (look && look.fx && look.fx.grain ? look.fx.grain * la100 * 0.5 : 0);
    const con = S.contrast || 0;
    const cF = (259 * (con * 2.55 + 255)) / (255 * (259 - con * 2.55));

    gl.useProgram(progGrade);
    setTex(0, gradeTex, U.uSrc);
    gl.uniform2f(U.uRes, w, h);
    gl.uniform1f(U.uExpM, Math.pow(2, S.exposure || 0));
    gl.uniform1f(U.uTmp, S.temperature || 0);
    gl.uniform1f(U.uTnt, S.tint || 0);
    gl.uniform1f(U.uCF, cF);
    gl.uniform1f(U.uHL, S.highlights || 0);
    gl.uniform1f(U.uSH, S.shadows || 0);
    gl.uniform1f(U.uWH, S.whites || 0);
    gl.uniform1f(U.uBL, S.blacks || 0);
    gl.uniform1f(U.uVib, S.vibrance || 0);
    gl.uniform1f(U.uSatM, 1 + (S.saturation || 0) / 100);
    gl.uniform1f(U.uFade, fade);
    gl.uniform1f(U.uDeh, S.dehaze || 0);
    gl.uniform1f(U.uVig, vig);
    gl.uniform1f(U.uGrain, grn);
    const fxN = (look && look.fx) || {};
    const laA = (S.lookAmount == null ? 100 : S.lookAmount) / 100;
    gl.uniform1f(U.uShift, (fxN.shift || 0) * laA);
    gl.uniform1f(U.uMirror, ((fxN.mirror || 0) / 100) * laA);
    gl.uniform1f(U.uPixelN, Math.round(fxN.pixel || 0));
    gl.uniform1f(U.uPixelAmt, (fxN.pixel || 0) > 1 ? laA : 0);
    gl.uniform1f(U.uHalf, (fxN.half || 0) * laA);
    gl.uniform1f(U.uScan, (fxN.scan || 0) * laA);
    gl.uniform1f(U.uEdge, (fxN.edge || 0) * laA);
    gl.uniform1f(U.uLeak, (fxN.leak || 0) * laA);
    gl.uniform1f(U.uLeakVar, fxN.leakVar || 1);
    gl.uniform1f(U.uPoster, lookAmt > 0.0005 ? Math.round(fxN.poster || 0) : 0);
    gl.uniform1f(U.uSeed, 7.0);
    gl.uniform1f(U.uLookAmt, lookAmt);
    gl.uniform1f(U.uUseLUT, useLUT);
    gl.uniform1f(U.uUseCurves, useCurves);
    if (useLUT) { setTex(1, texLUT, U.uLUT); gl.uniform1f(U.uLutN, LUT_N); }
    if (useCurves) setTex(2, texCurve, U.uCurves);
    drawTo(fboGrade);

    const needDetail = (S.clarity || 0) !== 0 || (S.texture || 0) !== 0 ||
      (S.sharpen || 0) > 0 || (S.lumNR || 0) > 0 || (S.colorNR || 0) > 0;
    let finalFbo = fboGrade;
    if (needDetail) {
      gl.useProgram(progBlur);
      const UB = progBlur._u;
      setTex(0, texGrade, UB.uTex);
      gl.uniform2f(UB.uStep, 1 / w, 0);
      drawTo(fboBH);
      setTex(0, texBH, UB.uTex);
      gl.uniform2f(UB.uStep, 0, 1 / h);
      drawTo(fboBV);
      gl.useProgram(progDetail);
      const UD = progDetail._u;
      setTex(0, texGrade, UD.uOrig);
      setTex(1, texBV, UD.uBlur);
      const cl = (S.clarity || 0) / 100, tx = (S.texture || 0) / 100, sh = (S.sharpen || 0) / 100;
      gl.uniform1f(UD.uDetAmt, cl * 0.9 + tx * 0.45 + sh * 1.1);
      gl.uniform1f(UD.uLumMix, (S.lumNR || 0) / 100 * 0.85);
      gl.uniform1f(UD.uColMix, (S.colorNR || 0) / 100);
      drawTo(fboBH);
      finalFbo = fboBH;
    }
    let finalTex = finalFbo === fboBH ? texBH : texGrade;

    // M2 selective layers: ping-pong between the two targets not holding `finalTex`.
    if (S.layers && S.layers.length && window.T2S_MASKS) {
      const pairs = [[texGrade, fboGrade], [texBH, fboBH], [texBV, fboBV], [texLens, fboLens]];
      let pi = 0;
      gl.useProgram(progLayer);
      const UL = progLayer._u;
      for (const L of S.layers) {
        if (L.visible === false || (L.opacity == null ? 100 : L.opacity) <= 0) continue;
        const mc = window.T2S_MASKS.rasterize(L, w, h);
        gl.bindTexture(gl.TEXTURE_2D, texMask);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, mc);
        let dst = pairs[pi % 4];
        if (dst[0] === finalTex) { pi++; dst = pairs[pi % 4]; }
        pi++;
        const a = L.adj || {};
        const con = a.contrast || 0;
        setTex(0, finalTex, UL.uImg);
        setTex(1, texMask, UL.uMask);
        gl.uniform1f(UL.uExpM, Math.pow(2, a.exposure || 0));
        gl.uniform1f(UL.uTmp, a.temperature || 0);
        gl.uniform1f(UL.uTnt, a.tint || 0);
        gl.uniform1f(UL.uCF, (259 * (con * 2.55 + 255)) / (255 * (259 - con * 2.55)));
        gl.uniform1f(UL.uHL, a.highlights || 0);
        gl.uniform1f(UL.uSH, a.shadows || 0);
        gl.uniform1f(UL.uWH, a.whites || 0);
        gl.uniform1f(UL.uBL, a.blacks || 0);
        gl.uniform1f(UL.uVib, a.vibrance || 0);
        gl.uniform1f(UL.uSatM, 1 + (a.saturation || 0) / 100);
        gl.uniform1f(UL.uOp, (L.opacity == null ? 100 : L.opacity) / 100);
        drawTo(dst[1]);
        finalTex = dst[0]; finalFbo = dst[1];
      }
    }

    // M3 face refine after layers (skin-weighted, uses its own blur)
    const FC = S.face;
    const faceOn = FC && FC.enabled && FC.faces && FC.faces.filter((f) => f.on !== false);
    if (faceOn && faceOn.length && ((FC.lighten || 0) || (FC.smooth || 0) || (FC.warmth || 0))) {
      // smooth support blur of current result
      gl.useProgram(progBlur);
      const UB2 = progBlur._u;
      setTex(0, finalTex, UB2.uTex);
      gl.uniform2f(UB2.uStep, 1 / w, 0);
      drawTo(fboBH);
      setTex(0, texBH, UB2.uTex);
      gl.uniform2f(UB2.uStep, 0, 1 / h);
      drawTo(fboBV);
      gl.useProgram(progFace);
      const UF = progFace._u;
      setTex(0, finalTex, UF.uImg);
      setTex(1, texBV, UF.uBlur);
      const fv = new Float32Array(16), fo = new Float32Array(4);
      for (let i = 0; i < 4; i++) {
        const f = faceOn[i];
        if (f) { fv[i * 4] = f.cx; fv[i * 4 + 1] = f.cy; fv[i * 4 + 2] = f.rx; fv[i * 4 + 3] = f.ry; fo[i] = 1; }
      }
      const locV = UF.uFaces || UF["uFaces[0]"], locO = UF.uFaceOn || UF["uFaceOn[0]"];
      gl.uniform4fv(locV, fv);
      gl.uniform1fv(locO, fo);
      gl.uniform1f(UF.uLighten, FC.lighten || 0);
      gl.uniform1f(UF.uSmooth, FC.smooth || 0);
      gl.uniform1f(UF.uWarm, FC.warmth || 0);
      drawTo(fboBH);
      finalTex = texBH; finalFbo = fboBH;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, finalFbo);
    const out = new ImageData(w, h);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(out.data.buffer));
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return out;
  }

  function ready() { return ensure(); }

  window.T2SGPU = { ready, process, LUT_SIZE: LUT_N };
})();
