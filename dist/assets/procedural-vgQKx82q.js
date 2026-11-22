var U=Object.defineProperty;var X=(t,r,o)=>r in t?U(t,r,{enumerable:!0,configurable:!0,writable:!0,value:o}):t[r]=o;var T=(t,r,o)=>X(t,typeof r!="symbol"?r+"":r,o);const w=(t,r=4)=>{const o=t.getContext("webgl2",{antialias:!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0,alpha:!0,depth:!0});if(!o)throw new Error("当前浏览器不支持 WebGL2，请使用最新版 Chrome/Edge");const n=o.getExtension("EXT_texture_filter_anisotropic"),u=n?o.getParameter(n.MAX_TEXTURE_MAX_ANISOTROPY_EXT):1,a=o.getParameter(o.SAMPLES),e=Math.min(r,Math.max(1,a));return{gl:o,canvas:t,maxTextureSize:o.getParameter(o.MAX_TEXTURE_SIZE),max3dTextureSize:o.getParameter(o.MAX_3D_TEXTURE_SIZE),maxArrayLayers:o.getParameter(o.MAX_ARRAY_TEXTURE_LAYERS),maxAnisotropy:u,msaaSamples:e}},b=(t,r,o)=>{const n=t.createShader(r);if(!n)throw new Error("着色器对象创建失败");if(t.shaderSource(n,o),t.compileShader(n),!t.getShaderParameter(n,t.COMPILE_STATUS)){const u=t.getShaderInfoLog(n);throw t.deleteShader(n),new Error(`着色器编译失败: ${u}`)}return n},S=(t,r,o,n,u)=>{const a=b(t,t.VERTEX_SHADER,r),e=b(t,t.FRAGMENT_SHADER,o),s=t.createProgram();if(!s)throw new Error("程序对象创建失败");if(t.attachShader(s,a),t.attachShader(s,e),t.linkProgram(s),t.deleteShader(a),t.deleteShader(e),!t.getProgramParameter(s,t.LINK_STATUS)){const i=t.getProgramInfoLog(s);throw t.deleteProgram(s),new Error(`着色器链接失败: ${i}`)}const c={};for(const i of n)c[i]=t.getUniformLocation(s,i);const l={};for(const i of u)l[i]=t.getAttribLocation(s,i);return{program:s,uniforms:c,attribs:l}},M=t=>{const r=t.createVertexArray();if(!r)throw new Error("VAO 创建失败");const o=t.createBuffer();return t.bindVertexArray(r),t.bindBuffer(t.ARRAY_BUFFER,o),t.bufferData(t.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,2,t.FLOAT,!1,0,0),t.bindVertexArray(null),r},C=t=>{const r=t.createVertexArray();if(!r)throw new Error("VAO 创建失败");const o=t.createBuffer();return t.bindVertexArray(r),t.bindBuffer(t.ARRAY_BUFFER,o),t.bufferData(t.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,2,t.FLOAT,!1,0,0),t.bindVertexArray(null),r},d=t=>(t&t-1)===0,h=t=>{let r=1;for(;r<t;)r*=2;return r};class N{constructor(r,o=1536*1024*1024){T(this,"ctx");T(this,"cache",new Map);T(this,"lru",[]);T(this,"totalBytes",0);T(this,"maxBytes");this.ctx=r,this.maxBytes=o}has(r){return this.cache.has(r)}get(r){const o=this.cache.get(r);return o&&(this.lru=this.lru.filter(n=>n!==r),this.lru.push(r)),o}set(r,o){const n=this.cache.get(r);n&&(this.totalBytes-=n.byteSize,this.ctx.gl.deleteTexture(n.texture),this.lru=this.lru.filter(u=>u!==r)),this.cache.set(r,o),this.lru.push(r),this.totalBytes+=o.byteSize,this.evict()}evict(){for(;this.totalBytes>this.maxBytes&&this.lru.length>1;){const r=this.lru.shift();if(!r)break;const o=this.cache.get(r);o&&(this.totalBytes-=o.byteSize,this.ctx.gl.deleteTexture(o.texture),this.cache.delete(r))}}dispose(){const r=this.ctx.gl;for(const o of this.cache.values())r.deleteTexture(o.texture);this.cache.clear(),this.lru=[],this.totalBytes=0}}const G=(t,r,o,n,u)=>{const{gl:a,maxTextureSize:e,maxAnisotropy:s}=t,c=r.width,l=r.height,i=Math.min(u,e),f=Math.min(1,i/Math.max(c,l)),E=Math.max(1,Math.round(c*f)),m=Math.max(1,Math.round(l*f)),_=h(E),x=h(m),A=document.createElement("canvas");A.width=_,A.height=x;const p=A.getContext("2d",{willReadFrequently:!1});if(!p)throw new Error("2D 临时画布创建失败");p.drawImage(r,0,0,_,x);const R=a.createTexture();if(!R)throw new Error("纹理对象创建失败");a.bindTexture(a.TEXTURE_2D,R),a.pixelStorei(a.UNPACK_FLIP_Y_WEBGL,!1),a.texImage2D(a.TEXTURE_2D,0,a.RGBA8,a.RGBA,a.UNSIGNED_BYTE,A),a.generateMipmap(a.TEXTURE_2D),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_MIN_FILTER,a.LINEAR_MIPMAP_LINEAR),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_MAG_FILTER,a.LINEAR),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_WRAP_S,a.CLAMP_TO_EDGE),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_WRAP_T,a.CLAMP_TO_EDGE);const v=a.getExtension("EXT_texture_filter_anisotropic");return v&&a.texParameterf(a.TEXTURE_2D,v.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(8,s)),{texture:R,width:_,height:x,widthMm:o,heightMm:n,byteSize:_*x*4*1.33}},D=(t,r,o,n,u,a)=>{const{gl:e,maxAnisotropy:s}=t;let c=o,l=n,i=r;(!d(o)||!d(n))&&(c=h(o),l=h(n),i=I(r,o,n,c,l));const f=e.createTexture();if(!f)throw new Error("纹理对象创建失败");e.bindTexture(e.TEXTURE_2D,f),e.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,!1),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,c,l,0,e.RGBA,e.UNSIGNED_BYTE,i),e.generateMipmap(e.TEXTURE_2D),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR_MIPMAP_LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE);const E=e.getExtension("EXT_texture_filter_anisotropic");return E&&e.texParameterf(e.TEXTURE_2D,E.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(8,s)),{texture:f,width:c,height:l,widthMm:u,heightMm:a,byteSize:c*l*4*1.33}},I=(t,r,o,n,u)=>{const a=new Uint8Array(n*u*4);for(let e=0;e<u;e++){const s=Math.min(o-1,Math.floor(e*o/u));for(let c=0;c<n;c++){const l=Math.min(r-1,Math.floor(c*r/n)),i=(s*r+l)*4,f=(e*n+c)*4;a[f]=t[i],a[f+1]=t[i+1],a[f+2]=t[i+2],a[f+3]=t[i+3]}}return a},y=`#version 300 es
layout(location = 0) in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`,F=`#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o_color;

uniform int u_kind;
uniform float u_seed;
uniform float u_scale;
uniform float u_turbulence;
uniform vec3 u_baseColor;
uniform vec3 u_veinColor;

// 哈希与值噪声
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 6; i++) {
    v += amp * vnoise(p);
    p = rot * p * 2.02;
    amp *= 0.5;
  }
  return v;
}

// 域扭曲的流线，模拟大理石矿脉走向
float marbleField(vec2 p) {
  vec2 q = vec2(fbm(p + u_seed), fbm(p + vec2(5.2, 1.3) - u_seed));
  vec2 r = vec2(
    fbm(p + u_turbulence * q + vec2(1.7, 9.2)),
    fbm(p + u_turbulence * q + vec2(8.3, 2.8))
  );
  return fbm(p + u_turbulence * r);
}

void main() {
  vec2 p = v_uv * u_scale;
  vec3 col;
  if (u_kind == 0) {
    // 流动大理石：正弦条纹 + 域扭曲
    float f = marbleField(p * 2.0);
    float vein = sin((p.x * 0.8 + f * 2.2) * 3.14159);
    float line = smoothstep(0.82, 1.0, 1.0 - abs(vein));
    float soft = smoothstep(0.4, 1.0, 1.0 - abs(vein)) * 0.35;
    col = u_baseColor + (u_veinColor - u_baseColor) * clamp(line + soft, 0.0, 1.0);
  } else if (u_kind == 1) {
    // 粗脉大理石：少量宽矿脉
    float f = marbleField(p * 1.4);
    float vein = smoothstep(0.55, 0.78, f);
    float crack = smoothstep(0.86, 0.95, f) * 1.4;
    col = u_baseColor + (u_veinColor - u_baseColor) * clamp(vein * 0.8 + crack, 0.0, 1.0);
  } else {
    // 石英岩：细密颗粒 + 闪光晶点
    float grain = fbm(p * 6.0);
    float sparkle = step(0.985, hash21(floor(v_uv * 1400.0))) * 0.5;
    float band = smoothstep(0.45, 0.7, fbm(p * 1.2));
    col = u_baseColor + (u_veinColor - u_baseColor) * band * 0.6;
    col += vec3(grain * 0.12 + sparkle);
  }
  // 轻微压暗四角，增加板面质感
  float vig = 1.0 - 0.08 * length(v_uv - 0.5);
  o_color = vec4(col * vig, 1.0);
}`,B={"marble-flow":0,"marble-vein":1,quartzite:2},P=t=>{const r=parseInt(t.slice(1),16);return[(r>>16&255)/255,(r>>8&255)/255,(r&255)/255]},O=(t,r,o,n,u,a)=>{const{gl:e}=t,s=S(e,y,F,["u_kind","u_seed","u_scale","u_turbulence","u_baseColor","u_veinColor"],["a_pos"]),c=M(e),l=e.createFramebuffer(),i=e.createTexture();e.bindTexture(e.TEXTURE_2D,i),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,o,n,0,e.RGBA,e.UNSIGNED_BYTE,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.bindFramebuffer(e.FRAMEBUFFER,l),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,i,0),e.viewport(0,0,o,n),e.useProgram(s.program),e.bindVertexArray(c),e.uniform1i(s.uniforms.u_kind,B[r.kind]),e.uniform1f(s.uniforms.u_seed,r.seed%997/997),e.uniform1f(s.uniforms.u_scale,r.scale),e.uniform1f(s.uniforms.u_turbulence,r.turbulence),e.uniform3fv(s.uniforms.u_baseColor,P(r.baseColor)),e.uniform3fv(s.uniforms.u_veinColor,P(r.veinColor)),e.drawArrays(e.TRIANGLES,0,3);const f=new Uint8Array(o*n*4);e.readPixels(0,0,o,n,e.RGBA,e.UNSIGNED_BYTE,f),e.bindFramebuffer(e.FRAMEBUFFER,null),e.bindTexture(e.TEXTURE_2D,null),e.deleteFramebuffer(l),e.deleteTexture(i),e.deleteProgram(s.program),e.deleteVertexArray(c);const E=new Uint8Array(f.length),m=o*4;for(let _=0;_<n;_++)E.set(f.subarray(_*m,(_+1)*m),(n-1-_)*m);return D(t,E,o,n,u,a)};export{N as T,C as a,w as b,S as c,M as d,O as g,G as u};
