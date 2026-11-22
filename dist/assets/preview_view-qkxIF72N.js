const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/export_bom-DijYBAru.js","assets/index-DA7b69wh.js","assets/index-DnID4ghe.css","assets/base_button-DZj3DtcC.js","assets/base_button-Cy8hxbuQ.css","assets/procedural-vgQKx82q.js"])))=>i.map(i=>d[i]);
var se=Object.defineProperty;var oe=(l,e,o)=>e in l?se(l,e,{enumerable:!0,configurable:!0,writable:!0,value:o}):l[e]=o;var D=(l,e,o)=>oe(l,typeof e!="symbol"?e+"":e,o);import{G as ne,d as ae,I as re,D as ie,l as le,m as ce,o as ue,J as de,c as U,g as L,h as k,b as x,F as he,x as pe,s as j,t as B,r as V,y as H,N as X,a as z,u as ve,i as R,E as me,S as Y,j as fe,_ as xe}from"./index-DA7b69wh.js";import{P as _e,B as F}from"./base_button-DZj3DtcC.js";import{c as be,b as ge,u as we,g as ye}from"./procedural-vgQKx82q.js";const Ee=`#version 300 es
layout(location = 0) in vec3 a_pos;       // 场景世界坐标，毫米
layout(location = 1) in vec2 a_slabMm;    // 该顶点对应的大板毫米坐标（侧边同样延续此坐标）
layout(location = 2) in vec3 a_normal;
uniform mat4 u_viewProj;
out vec2 v_slabMm;
out vec3 v_normal;
out vec3 v_worldPos;
void main() {
  v_slabMm = a_slabMm;
  v_normal = a_normal;
  v_worldPos = a_pos;
  gl_Position = u_viewProj * vec4(a_pos, 1.0);
}`,Se=`#version 300 es
precision highp float;
in vec2 v_slabMm;
in vec3 v_normal;
in vec3 v_worldPos;
uniform sampler2D u_tex;
uniform vec2 u_slabSize;
uniform int u_finish;
uniform vec3 u_camPos;
uniform vec3 u_lightDir;
out vec4 o_color;

// 简化 Cook-Torrance 风格：粗糙度按表面处理分级
float distribution(float ndh, float rough) {
  float a = rough * rough;
  float a2 = a * a;
  float d = ndh * ndh * (a2 - 1.0) + 1.0;
  return a2 / max(0.0001, 3.14159 * d * d);
}

void main() {
  vec2 uv = v_slabMm / u_slabSize;
  vec3 albedo = texture(u_tex, uv).rgb;
  vec3 n = normalize(v_normal);
  vec3 l = normalize(u_lightDir);
  vec3 v = normalize(u_camPos - v_worldPos);
  vec3 h = normalize(l + v);
  float ndl = max(dot(n, l), 0.0);
  float ndh = max(dot(n, h), 0.0);
  float ndv = max(dot(n, v), 0.0);

  float rough;
  float specStrength;
  if (u_finish == 0) {        // 亮光面：低粗糙，强镜面
    rough = 0.12;
    specStrength = 0.9;
  } else if (u_finish == 1) { // 哑光面：高粗糙，弱镜面
    rough = 0.55;
    specStrength = 0.35;
  } else {                    // 荔枝面：微凹凸，漫反射为主
    rough = 0.75;
    specStrength = 0.18;
    float bump = fract(sin(dot(v_slabMm * 1.2, vec2(12.9898, 78.233))) * 43758.5453);
    n = normalize(n + vec3(bump - 0.5) * 0.12);
  }

  float d = distribution(ndh, rough);
  vec3 fresnel = mix(vec3(0.04), albedo, pow(1.0 - ndv, 5.0));
  vec3 spec = fresnel * d * specStrength;
  vec3 diffuse = albedo * (1.0 - specStrength * 0.5) * ndl;
  vec3 ambient = albedo * 0.32;
  vec3 col = ambient + diffuse + spec;
  o_color = vec4(col, 1.0);
}`,Te=(l,e,o,d)=>{const r=1/Math.tan(l/2),h=1/(o-d);return[r/e,0,0,0,0,r,0,0,0,0,(d+o)*h,-1,0,0,2*d*o*h,0]},Me=(l,e,o)=>{const d=(u,c)=>[u[0]-c[0],u[1]-c[1],u[2]-c[2]],r=(u,c)=>[u[1]*c[2]-u[2]*c[1],u[2]*c[0]-u[0]*c[2],u[0]*c[1]-u[1]*c[0]],h=u=>{const c=Math.hypot(u[0],u[1],u[2]);return[u[0]/c,u[1]/c,u[2]/c]},i=h(d(l,e)),v=h(r(o,i)),b=r(i,v);return[v[0],b[0],i[0],0,v[1],b[1],i[1],0,v[2],b[2],i[2],0,-v[0]*l[0]-v[1]*l[1]-v[2]*l[2],-b[0]*l[0]-b[1]*l[1]-b[2]*l[2],-i[0]*l[0]-i[1]*l[1]-i[2]*l[2],1]},Ae=(l,e)=>{const o=new Array(16).fill(0);for(let d=0;d<4;d++)for(let r=0;r<4;r++)o[d*4+r]=l[r]*e[d*4]+l[4+r]*e[d*4+1]+l[8+r]*e[d*4+2]+l[12+r]*e[d*4+3];return o};class Ce{constructor(e){D(this,"ctx");D(this,"program");D(this,"meshes",[]);D(this,"camera",{eye:[2600,2200,2600],target:[0,0,0]});this.ctx=e,this.program=be(e.gl,Ee,Se,["u_viewProj","u_tex","u_slabSize","u_finish","u_camPos","u_lightDir"],["a_pos","a_slabMm","a_normal"])}setCamera(e,o){this.camera={eye:e,target:o}}buildCountertopMesh(e,o,d){const r=this.ctx.gl,h=e.placement,i=h.w/2,v=h.h/2,b=40,u=d,c=Math.cos(h.angle),A=Math.sin(h.angle),_=(w,T)=>{const n=e.mirrorU?-w:w;return[h.cx+n*c-T*A,h.cy+n*A+T*c]},p=[],y=(w,T,n,t)=>{for(const s of[w,T,n])p.push(...t.slice(s*8,s*8+8))},g=[],E=[[-i,-v],[i,-v],[i,v],[-i,v]];for(const[w,T]of E){const[n,t]=_(w,T);g.push(w,T,0,n,t,0,0,1)}y(0,1,2,g),y(0,2,3,g);const M=[{idx:[0,1],n:[0,-1],dropHere:u},{idx:[1,2],n:[1,0],dropHere:0},{idx:[2,3],n:[0,1],dropHere:0},{idx:[3,0],n:[-1,0],dropHere:0}];for(const w of M){const[T,n]=w.idx,[t,s]=w.n,m=E[T],f=E[n],P=b+w.dropHere,I=[],N=(W,J,K,Q,Z)=>{const[ee,te]=_(Q,Z);I.push(W,J,K,ee,te,t,s,0)};N(m[0],m[1],0,m[0],m[1]),N(f[0],f[1],0,f[0],f[1]),N(f[0],f[1],-P,f[0]+t*P,f[1]+s*P),N(m[0],m[1],-P,m[0]+t*P,m[1]+s*P),y(0,1,2,I),y(0,2,3,I),p.push(...I)}const S=r.createVertexArray(),C=r.createBuffer();r.bindVertexArray(S),r.bindBuffer(r.ARRAY_BUFFER,C),r.bufferData(r.ARRAY_BUFFER,new Float32Array(p),r.STATIC_DRAW);const O=8*4;r.enableVertexAttribArray(0),r.vertexAttribPointer(0,3,r.FLOAT,!1,O,0),r.enableVertexAttribArray(1),r.vertexAttribPointer(1,2,r.FLOAT,!1,O,3*4),r.enableVertexAttribArray(2),r.vertexAttribPointer(2,3,r.FLOAT,!1,O,5*4),r.bindVertexArray(null),this.meshes.push({vao:S,vertexCount:p.length/8,texture:o,slabSize:{w:o.widthMm,h:o.heightMm},finish:"polished"})}setFinish(e){for(const o of this.meshes)o.finish=e}clearMeshes(){const e=this.ctx.gl;for(const o of this.meshes)e.deleteVertexArray(o.vao);this.meshes=[]}render(){const e=this.ctx.gl;e.viewport(0,0,this.ctx.canvas.width,this.ctx.canvas.height),e.clearColor(.96,.96,.95,1),e.clear(e.COLOR_BUFFER_BIT|e.DEPTH_BUFFER_BIT),e.enable(e.DEPTH_TEST);const o=this.ctx.canvas.width/this.ctx.canvas.height,d=Te(Math.PI/5,o,10,2e4),r=Me(this.camera.eye,this.camera.target,[0,0,1]),h=Ae(d,r);e.useProgram(this.program.program),e.uniformMatrix4fv(this.program.uniforms.u_viewProj,!1,new Float32Array(h)),e.uniform3fv(this.program.uniforms.u_camPos,this.camera.eye),e.uniform3fv(this.program.uniforms.u_lightDir,[.4,.6,.8]);const i={polished:0,honed:1,leathered:2};for(const v of this.meshes)e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,v.texture.texture),e.uniform1i(this.program.uniforms.u_tex,0),e.uniform2f(this.program.uniforms.u_slabSize,v.slabSize.w,v.slabSize.h),e.uniform1i(this.program.uniforms.u_finish,i[v.finish]),e.bindVertexArray(v.vao),e.drawArrays(e.TRIANGLES,0,v.vertexCount);e.bindVertexArray(null),e.disable(e.DEPTH_TEST)}dispose(){this.clearMeshes()}}const a=(l,e)=>`${l}
${e}`,$=(l,e)=>{const o=[];o.push(a(0,"POLYLINE")),o.push(a(8,e)),o.push(a(66,1)),o.push(a(70,1));for(const d of l)o.push(a(0,"VERTEX")),o.push(a(8,e)),o.push(a(10,d.x.toFixed(2))),o.push(a(20,d.y.toFixed(2)));return o.push(a(0,"SEQEND")),o.push(a(8,e)),{lines:o}},G=(l,e,o,d,r=18)=>({lines:[a(0,"TEXT"),a(8,d),a(10,l.toFixed(2)),a(20,e.toFixed(2)),a(40,r),a(1,o)]}),Pe=(l,e,o,d)=>({lines:[a(0,"CIRCLE"),a(8,d),a(10,l.toFixed(2)),a(20,e.toFixed(2)),a(40,o.toFixed(2))]}),Le=l=>{const{slabs:e,pieces:o,faces:d}=l,r=new Map(d.map(c=>[c.id,c])),h=[],i=[];i.push(a(0,"SECTION")),i.push(a(2,"HEADER")),i.push(a(9,"$ACADVER")),i.push(a(1,"AC1009")),i.push(a(9,"$INSUNITS")),i.push(a(70,4)),i.push(a(0,"ENDSEC")),i.push(a(0,"SECTION")),i.push(a(2,"TABLES")),i.push(a(0,"TABLE")),i.push(a(2,"LAYER")),i.push(a(70,4));const v=[{name:"SLAB_OUTLINE",color:8},{name:"CUT_LINE",color:1},{name:"HOLE",color:3},{name:"LABEL",color:5}];for(const c of v)i.push(a(0,"LAYER")),i.push(a(2,c.name)),i.push(a(70,0)),i.push(a(62,c.color)),i.push(a(6,"CONTINUOUS"));i.push(a(0,"ENDTAB")),i.push(a(0,"ENDSEC")),i.push(a(0,"SECTION")),i.push(a(2,"ENTITIES"));const b=[a(0,"ENDSEC"),a(0,"EOF")];for(const c of e){h.push($([{x:0,y:0},{x:c.widthMm,y:0},{x:c.widthMm,y:c.heightMm},{x:0,y:c.heightMm}],"SLAB_OUTLINE")),h.push(G(10,c.heightMm-25,c.code,"LABEL",22));const A=o.filter(_=>_.slabId===c.id);for(const _ of A){const p=r.get(_.faceId);h.push($(ne(_.placement),"CUT_LINE"));const y=p?`${p.name} #${_.seq}`:`#${_.seq}`;if(h.push(G(_.placement.cx-30,_.placement.cy,y,"LABEL")),p)for(const g of p.holes){const E=_.placement.cx+(g.rect.x+g.rect.w/2-p.widthMm/2),M=_.placement.cy+(g.rect.y+g.rect.h/2-p.heightMm/2);if(g.kind==="faucet")h.push(Pe(E,M,g.rect.w/2,"HOLE"));else{const S=g.rect.w/2,C=g.rect.h/2;h.push($([{x:E-S,y:M-C},{x:E+S,y:M-C},{x:E+S,y:M+C},{x:E-S,y:M+C}],"HOLE"))}}}}const u=h.flatMap(c=>c.lines);return[...i,...u,...b].join(`
`)},q=(l,e,o)=>{const d=new Blob([l],{type:o}),r=URL.createObjectURL(d),h=document.createElement("a");h.href=r,h.download=e,h.click(),URL.revokeObjectURL(r)},ke=Object.freeze(Object.defineProperty({__proto__:null,buildDxf:Le,downloadTextFile:q},Symbol.toStringTag,{value:"Module"})),Ie={class:"page"},Re={key:0,class:"empty card"},Fe={key:1,class:"workspace"},Be={class:"canvas-card card"},Oe={class:"view-controls"},De={class:"side card"},Ne={class:"finish-list"},Ue=["onClick"],ze={class:"finish-label"},je={class:"finish-desc"},Ve={class:"room-tabs"},$e={class:"plan-meta"},He={class:"meta-line"},Xe={class:"meta-line"},Ye={class:"meta-line"},Ge={class:"meta-line"},qe=ae({__name:"preview_view",props:{planId:{}},setup(l){const e=l,o=me(),d=re(),r=ie(),h=le(),i=ce(),v=V(),b=X(),u=X(),c=new Map,A=V("polished"),_=V("kitchen"),p=H(()=>d.plans.find(n=>n.id===e.planId)),y=H(()=>p.value?r.projects.find(n=>n.id===p.value.projectId):void 0),g=async n=>{const t=c.get(n);if(t)return t;const s=h.byId(n);if(!s)throw new Error("大板数据缺失");const m=b.value;let f;if(s.source==="photo"&&s.photo){const P=await fe(s.photo.blobKey),I=await createImageBitmap(P);f=we(m,I,s.widthMm,s.heightMm,i.settings.workingTextureMax),I.close()}else f=ye(m,s.procedural,Math.min(2048,m.maxTextureSize),Math.min(1024,m.maxTextureSize),s.widthMm,s.heightMm);return c.set(n,f),f},E=async()=>{var t;if(!p.value||!u.value)return;u.value.clearMeshes();const n=new Map((t=y.value)==null?void 0:t.faces.map(s=>[s.id,s]));for(const s of p.value.pieces){const m=await g(s.slabId),f=n.get(s.faceId);u.value.buildCountertopMesh(s,m,(f==null?void 0:f.dropEdgeMm)??0)}u.value.setFinish(A.value),u.value.render()},M=n=>{var t,s;A.value=n,(t=u.value)==null||t.setFinish(n),(s=u.value)==null||s.render()},S=n=>{if(!u.value)return;const t=n*Math.PI/180,s=3600;u.value.setCamera([Math.cos(t)*s,Math.sin(t)*s,2400],[0,0,0]),u.value.render()},C=()=>{const n=v.value;n&&n.toBlob(t=>{var f;if(!t)return;const s=URL.createObjectURL(t),m=document.createElement("a");m.href=s,m.download=`${((f=p.value)==null?void 0:f.name)??"layout"}-preview.png`,m.click(),URL.revokeObjectURL(s)},"image/png")},O=()=>{C()},w=()=>{!p.value||!y.value||Y(async()=>{const{buildDxf:n}=await Promise.resolve().then(()=>ke);return{buildDxf:n}},void 0).then(({buildDxf:n})=>{const t=h.slabs.filter(m=>p.value.slabIds.includes(m.id)),s=n({slabs:t,pieces:p.value.pieces,faces:y.value.faces});q(s,`${p.value.name}.dxf`,"application/dxf")})},T=()=>{!p.value||!y.value||Y(async()=>{const{exportBomCsv:n}=await import("./export_bom-DijYBAru.js");return{exportBomCsv:n}},__vite__mapDeps([0,1,2,3,4,5])).then(({exportBomCsv:n})=>{const t=h.slabs.filter(s=>p.value.slabIds.includes(s.id));n(p.value,y.value.faces,t,`${p.value.name}-bom.csv`)})};return ue(async()=>{await d.open(e.planId);const n=v.value,t=ge(n,i.settings.msaaSamples);b.value=t,u.value=new Ce(t);const s=Math.min(window.devicePixelRatio,2);n.width=Math.round(n.clientWidth*s),n.height=Math.round(n.clientHeight*s),u.value.setCamera([2600,-2200,2400],[0,0,0]),await E()}),de(()=>{var n,t;(n=u.value)==null||n.dispose();for(const s of c.values())(t=b.value)==null||t.gl.deleteTexture(s.texture)}),(n,t)=>(z(),U("div",Ie,[L(_e,{title:"渲染预览",subtitle:"真实尺寸贴回场景，侧边与下垂边纹理物理连续"},{actions:k(()=>[L(F,{onClick:t[0]||(t[0]=s=>ve(o).back())},{default:k(()=>[...t[6]||(t[6]=[R("返回",-1)])]),_:1}),L(F,{onClick:w},{default:k(()=>[...t[7]||(t[7]=[R("导出 DXF",-1)])]),_:1}),L(F,{onClick:T},{default:k(()=>[...t[8]||(t[8]=[R("用料清单",-1)])]),_:1}),L(F,{variant:"primary",onClick:O},{default:k(()=>[...t[9]||(t[9]=[R("导出 PNG",-1)])]),_:1})]),_:1}),p.value?(z(),U("div",Fe,[x("div",Be,[x("canvas",{ref_key:"canvasRef",ref:v,class:"gl-canvas"},null,512),x("div",Oe,[L(F,{size:"sm",onClick:t[1]||(t[1]=s=>S(-30))},{default:k(()=>[...t[10]||(t[10]=[R("左转 30°",-1)])]),_:1}),L(F,{size:"sm",onClick:t[2]||(t[2]=s=>S(30))},{default:k(()=>[...t[11]||(t[11]=[R("右转 30°",-1)])]),_:1}),L(F,{size:"sm",onClick:t[3]||(t[3]=s=>S(0))},{default:k(()=>[...t[12]||(t[12]=[R("复位视角",-1)])]),_:1})])]),x("aside",De,[t[14]||(t[14]=x("p",{class:"side-title"},"表面处理",-1)),x("div",Ne,[(z(),U(he,null,pe([{key:"polished",label:"亮光面",desc:"低粗糙强镜面"},{key:"honed",label:"哑光面",desc:"高粗糙弱反射"},{key:"leathered",label:"荔枝面",desc:"微凹凸漫反射"}],s=>x("button",{key:s.key,class:j(["finish-item",{active:A.value===s.key}]),onClick:m=>M(s.key)},[x("span",ze,B(s.label),1),x("span",je,B(s.desc),1)],10,Ue)),64))]),t[15]||(t[15]=x("p",{class:"side-title"},"场景",-1)),x("div",Ve,[x("button",{class:j(["room-tab",{active:_.value==="kitchen"}]),onClick:t[4]||(t[4]=s=>_.value="kitchen")}," 厨房 ",2),x("button",{class:j(["room-tab",{active:_.value==="living-room"}]),onClick:t[5]||(t[5]=s=>_.value="living-room")}," 客厅 ",2)]),x("div",$e,[t[13]||(t[13]=x("p",{class:"side-title"},"方案数据",-1)),x("p",He,"切割件 "+B(p.value.pieces.length)+" 个",1),x("p",Xe,"投入大板 "+B(p.value.slabIds.length)+" 张",1),x("p",Ye,"利用率 "+B((p.value.utilization*100).toFixed(1))+"%",1),x("p",Ge,"对纹缝 "+B(p.value.seams.length)+" 条",1)])])])):(z(),U("div",Re,"没有打开的排版方案。"))]))}}),We=xe(qe,[["__scopeId","data-v-a01ef4fa"]]),et=Object.freeze(Object.defineProperty({__proto__:null,default:We},Symbol.toStringTag,{value:"Module"}));export{q as d,et as p};
