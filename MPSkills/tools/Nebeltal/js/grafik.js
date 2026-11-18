/* ══════════════════════════════════════════════════════════════
   Nebeltal — js/grafik.js   ·   3D-Bild mit reinem WebGL 1
   ══════════════════════════════════════════════════════════════
   Keine Bibliothek (kein three.js im vendor/ nötig): ein Gitter für
   die Landschaft, ein paar Grundkörper (Kugel, Kegel, Kasten) und daraus die
   Pinguin-Figur (drawPenguin), alles
   mit demselben Nebel. Der Nebel hängt NICHT an der Kamera, sondern
   an der Figur: sichtbar ist nur ein Kreis um die Stelle, an der man
   steht (uFogR). Zum Auflösen am Ende wird uFogR groß.

     const g = NTGrafik.create(canvas)
     g.setWorld(welt, theme)       Gitter bauen
     g.frame(scene)                ein Bild zeichnen, scene = {
        cam:{eye,at}, player:{x,y,z,ground,yaw,tilt,squash,phase,walk}, fogR, objects:[…] }
   ══════════════════════════════════════════════════════════════ */

window.NTGrafik = (function () {
  'use strict';

  /* ── kleine Matrix-Mathematik (spaltenweise wie OpenGL) ── */
  // Normalen-Matrix = (obere 3×3 von m)⁻¹ᵀ, damit gestauchte Kugeln richtig beleuchtet werden
  function normalMat(m) {
    const a = m[0], b = m[1], c = m[2], d = m[4], e = m[5], f = m[6], g = m[8], h = m[9], i = m[10];
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    const det = a * A + b * B + c * C || 1e-9;
    // Kofaktoren / det = (M⁻¹)ᵀ, spaltenweise
    return [A / det, B / det, C / det,
      -(b * i - c * h) / det, (a * i - c * g) / det, -(a * h - b * g) / det,
      (b * f - c * e) / det, -(a * f - c * d) / det, (a * e - b * d) / det];
  }

  const M = {
    persp(fov, asp, n, f) {
      const t = 1 / Math.tan(fov / 2), d = 1 / (n - f);
      return [t / asp,0,0,0, 0,t,0,0, 0,0,(f + n) * d,-1, 0,0,2 * f * n * d,0];
    },
    look(e, c, u) {
      let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2];
      let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
      let xx = u[1] * zz - u[2] * zy, xy = u[2] * zx - u[0] * zz, xz = u[0] * zy - u[1] * zx;
      l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
      const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
      return [xx,yx,zx,0, xy,yy,zy,0, xz,yz,zz,0,
        -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1];
    },
    mul(a, b) {
      const o = new Array(16);
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
        o[c * 4 + r] = s;
      }
      return o;
    },
    // Verschieben · Drehen um y · Kippen um x · Größe
    trs(x, y, z, yaw, tilt, sx, sy, sz) {
      const cy = Math.cos(yaw), sny = Math.sin(yaw), ct = Math.cos(tilt || 0), st = Math.sin(tilt || 0);
      // R = Ry · Rx
      const r00 = cy, r01 = sny * st, r02 = sny * ct;
      const r10 = 0, r11 = ct, r12 = -st;
      const r20 = -sny, r21 = cy * st, r22 = cy * ct;
      return [r00 * sx, r10 * sx, r20 * sx, 0,
              r01 * sy, r11 * sy, r21 * sy, 0,
              r02 * sz, r12 * sz, r22 * sz, 0,
              x, y, z, 1];
    },
    rx(a) { const c = Math.cos(a), s = Math.sin(a); return [1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]; },
    rz(a) { const c = Math.cos(a), s = Math.sin(a); return [c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1]; },
    scl(x, y, z) { return [x,0,0,0, 0,y,0,0, 0,0,z,0, 0,0,0,1]; }
  };

  const VS_T = `
    attribute vec3 aPos; attribute vec3 aNor;
    uniform mat4 uVP;
    varying vec3 vPos; varying vec3 vNor;
    void main(){ vPos=aPos; vNor=aNor; gl_Position=uVP*vec4(aPos,1.0); }`;
  const FS_T = `
    #ifdef GL_OES_standard_derivatives
    #extension GL_OES_standard_derivatives : enable
    #endif
    precision mediump float;
    varying vec3 vPos; varying vec3 vNor;
    uniform vec3 uLight; uniform vec2 uPlayer; uniform float uFogR; uniform vec3 uFog;
    uniform float uH0; uniform float uH1; uniform float uStep;
    uniform vec3 uC0; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3;
    uniform float uAmb; uniform float uPlain; uniform vec3 uPlainC;
    uniform float uIce; uniform vec3 uIceC; uniform float uPlainAmb; uniform float uLineK;
    void main(){
      float t=clamp((vPos.y-uH0)/(uH1-uH0),0.0,1.0);
      vec3 c = t<0.33 ? mix(uC0,uC1,t/0.33) : (t<0.66 ? mix(uC1,uC2,(t-0.33)/0.33) : mix(uC2,uC3,(t-0.66)/0.34));
      c=mix(c,uPlainC,uPlain);
      vec3 n=normalize(vNor);
      // Eiswelt (nur mit eigener Palette, uIce > 0): steile Hänge = blankes Eis, Schnee mit Korn
      if(uIce>0.0){
        float sl=1.0-n.y;
        c=mix(c,uIceC,smoothstep(0.12,0.45,sl)*uIce*(1.0-uPlain));   // einfarbig = auch kein Eis an Steilhängen
        // Sastrugi: vom Wind geformte Schneerippen, weich statt Pixel-Korn
        float rip=sin(vPos.x*1.9+vPos.z*0.5+sin(vPos.z*0.37+vPos.x*0.11)*3.0);
        c*=1.0+rip*0.035*uIce*(1.0-uPlain*0.4);
      }
      float am=mix(uAmb,uPlainAmb,uPlain);   // einfarbig = flaches Licht, Hänge kaum zu erkennen
      float l=am+(1.0-am)*max(dot(n,uLight),0.0);
      c*=l;
      float q=vPos.y/uStep;
      #ifdef GL_OES_standard_derivatives
      float w=fwidth(q);
      float line=1.0-smoothstep(0.0,w*1.4,abs(fract(q+0.5)-0.5));
      #else
      float line=1.0-smoothstep(0.0,0.06,abs(fract(q+0.5)-0.5));
      #endif
      c=mix(c,c*uLineK+(uLineK>1.0?vec3(0.05):vec3(0.0)),line*0.55*(1.0-uPlain));   // dunkle Palette: helle Höhenlinien
      float d=distance(vPos.xz,uPlayer);
      float f=smoothstep(uFogR*0.45,uFogR,d);
      gl_FragColor=vec4(mix(c,uFog,f),1.0);
    }`;
  const VS_O = `
    attribute vec3 aPos; attribute vec3 aNor;
    uniform mat4 uVP; uniform mat4 uM;
    varying vec3 vPos; varying vec3 vNor;
    void main(){ vec4 w=uM*vec4(aPos,1.0); vPos=w.xyz; vNor=mat3(uM)*aNor; gl_Position=uVP*w; }`;
  const FS_O = `
    precision mediump float;
    varying vec3 vPos; varying vec3 vNor;
    uniform vec3 uLight; uniform vec2 uPlayer; uniform float uFogR; uniform vec3 uFog;
    uniform vec3 uColor; uniform float uAmb; uniform float uGlow;
    void main(){
      vec3 n=normalize(vNor);
      float l=uAmb+(1.0-uAmb)*max(dot(n,uLight),0.0);
      vec3 c=mix(uColor*l,uColor,uGlow);
      float d=distance(vPos.xz,uPlayer);
      float f=smoothstep(uFogR*0.45,uFogR,d)*(1.0-uGlow*0.6);
      gl_FragColor=vec4(mix(c,uFog,f),1.0);
    }`;

  /* Figur: weiches Licht (umschlingend), Randlicht, Glanz; Muster aus der
     Objekt-Position (vLoc) gerechnet, damit Bauch/Gesicht scharf und ohne
     aufgeklebte Teile sind.  uPat: 0 = einfarbig, 1 = Pinguin-Körper,
     2 = Strickschal (Ring), 3 = Schal-Zipfel, 4 = weicher Schatten */
  const VS_C = `
    attribute vec3 aPos; attribute vec3 aNor;
    uniform mat4 uVP; uniform mat4 uM; uniform mat3 uN;
    varying vec3 vPos; varying vec3 vNor; varying vec3 vLoc;
    void main(){ vec4 w=uM*vec4(aPos,1.0); vPos=w.xyz; vLoc=aPos; vNor=uN*aNor; gl_Position=uVP*w; }`;
  const FS_C = `
    #ifdef GL_OES_standard_derivatives
    #extension GL_OES_standard_derivatives : enable
    #endif
    precision mediump float;
    varying vec3 vPos; varying vec3 vNor; varying vec3 vLoc;
    uniform vec3 uLight; uniform vec3 uEye; uniform vec2 uPlayer; uniform float uFogR; uniform vec3 uFog;
    uniform vec3 uColor; uniform vec3 uColor2; uniform float uGlow; uniform float uPat; uniform float uSpec;
    uniform float uAlpha; uniform float uAmb; uniform float uDarkTheme;
    float inside(float d){
      #ifdef GL_OES_standard_derivatives
      float w=fwidth(d)*0.9+0.0015;
      #else
      float w=0.015;
      #endif
      return 1.0-smoothstep(-w,w,d);
    }
    float smin(float a,float b,float k){ float h=clamp(0.5+0.5*(b-a)/k,0.0,1.0); return mix(b,a,h)-k*h*(1.0-h); }
    void main(){
      vec3 c=uColor;
      if(uPat>3.5){                                   // Schatten
        float r=length(vLoc.xz);
        gl_FragColor=vec4(uColor,uAlpha*(1.0-smoothstep(0.15,1.0,r)));
        return;
      }
      if(uPat>0.5 && uPat<1.5){                        // Körper
        float phi=atan(vLoc.x,vLoc.z), y=vLoc.y;
        float sb=phi*0.78, sf=phi*0.66;
        float belly=length(vec2(sb/0.6,(y-0.78)/0.7))-1.0;
        float lobe=length(vec2(abs(sf)-0.19,(y-1.99)*1.05))-0.255;
        float chin=length(vec2(sf/0.40,(y-1.74)/0.19))-1.0;
        float face=smin(lobe,chin*0.2,0.07);
        float wM=max(inside(belly*0.3),inside(face));
        vec3 white=mix(vec3(0.93,0.9,0.84),vec3(1.0,0.99,0.96),clamp((y-0.2)/1.2,0.0,1.0));
        c=mix(uColor,white,wM);
        float bl=length(vec2(abs(sf)-0.35,(y-1.79)*1.2));
        c=mix(c,vec3(1.0,0.6,0.65),(1.0-smoothstep(0.04,0.12,bl))*0.85*inside(face));
      } else if(uPat>1.5 && uPat<2.5){                 // Schal: Rippen + helle Streifen
        float a=atan(vLoc.x,vLoc.z);
        float st=fract(a*5.0/6.2832);
        c=mix(uColor,uColor2,step(0.82,st));
        c*=0.86+0.14*(0.5+0.5*sin(a*70.0));
      } else if(uPat>2.5){                             // Zipfel: Querstreifen + Fransen-Kante
        float st=fract(vLoc.y*1.6+0.2);
        c=mix(uColor,uColor2,step(0.72,st));
        c*=0.88+0.12*(0.5+0.5*sin(vLoc.x*40.0));
      }
      vec3 n=normalize(vNor), v=normalize(uEye-vPos);
      float nd=dot(n,uLight);
      float wrap=clamp((nd+0.5)/1.5,0.0,1.0); wrap*=wrap;
      vec3 sky=mix(vec3(0.82,0.88,1.0),vec3(0.55,0.62,0.85),uDarkTheme);
      vec3 gnd=mix(vec3(0.62,0.56,0.48),vec3(0.3,0.3,0.34),uDarkTheme);
      vec3 hemi=mix(gnd,sky,n.y*0.5+0.5);
      vec3 lit=c*(hemi*(uAmb+0.18)+wrap*(1.0-uAmb)*vec3(1.0,0.97,0.92));
      float fr=1.0-max(dot(n,v),0.0);
      lit+=pow(fr,3.0)*0.32*mix(vec3(1.0),sky,0.4);
      vec3 h=normalize(uLight+v);
      lit+=pow(max(dot(n,h),0.0),uSpec>0.6?90.0:32.0)*uSpec*vec3(1.0,0.98,0.95);
      c=mix(lit,c,uGlow);
      float d=distance(vPos.xz,uPlayer);
      float f=smoothstep(uFogR*0.45,uFogR,d);
      gl_FragColor=vec4(mix(c,uFog,f),1.0);
    }`;

  function compile(gl, vs, fs) {
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.bindAttribLocation(p, 0, 'aPos'); gl.bindAttribLocation(p, 1, 'aNor');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name] = gl.getUniformLocation(p, a.name); }
    return { p, u };
  }

  /* ── Grundkörper ── */
  function sphere(seg) {
    const pos = [], idx = [];
    for (let i = 0; i <= seg; i++) {
      const th = i / seg * Math.PI;
      for (let j = 0; j <= seg; j++) {
        const ph = j / seg * Math.PI * 2;
        pos.push(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph));
      }
    }
    for (let i = 0; i < seg; i++) for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j, b = a + seg + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    return { pos, nor: pos.slice(), idx };
  }
  function cone(seg) {          // Spitze bei y=1, Boden bei y=0, Radius 1
    const pos = [], nor = [], idx = [];
    for (let j = 0; j <= seg; j++) {
      const a = j / seg * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const k = 1 / Math.SQRT2;
      pos.push(c, 0, s, 0, 1, 0);
      nor.push(c * k, k, s * k, c * k, k, s * k);
    }
    for (let j = 0; j < seg; j++) { const a = j * 2; idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
    const base = pos.length / 3;
    pos.push(0, 0, 0); nor.push(0, -1, 0);
    for (let j = 0; j <= seg; j++) {
      const a = j / seg * Math.PI * 2;
      pos.push(Math.cos(a), 0, Math.sin(a)); nor.push(0, -1, 0);
    }
    for (let j = 0; j < seg; j++) idx.push(base, base + 1 + j + 1, base + 1 + j);
    return { pos, nor, idx };
  }
  function box() {
    const pos = [], nor = [], idx = [];
    const F = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
    for (const n of F) {
      const u = n[1] ? [1,0,0] : [0,1,0];
      const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
      const b = pos.length / 3;
      for (const [a, c] of [[-1,-1],[1,-1],[1,1],[-1,1]]) {
        pos.push(n[0] + a * u[0] + c * v[0], n[1] + a * u[1] + c * v[1], n[2] + a * u[2] + c * v[2]);
        nor.push(...n);
      }
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3, b, b + 2, b + 1, b, b + 3, b + 2);
    }
    return { pos, nor, idx };
  }
  function flagCloth() {        // Dreieck in der x/y-Ebene, beidseitig
    return { pos: [0,0,0, 1.6,-0.5,0, 0,-1,0], nor: [0,0,1, 0,0,1, 0,0,1], idx: [0,1,2, 0,2,1] };
  }

  /* Gitterfläche f(u, v) → Punkt; Normalen aus den Nachbarn */
  function grid(f, nu, nv) {
    const P = [];
    for (let i = 0; i <= nv; i++) for (let j = 0; j <= nu; j++) P.push(f(j / nu, i / nv));
    const pos = [], nor = [], idx = [];
    const at = (i, j) => P[Math.max(0, Math.min(nv, i)) * (nu + 1) + ((j + nu) % nu)];
    for (let i = 0; i <= nv; i++) for (let j = 0; j <= nu; j++) {
      const p = P[i * (nu + 1) + j];
      const a = at(i, j + 1), b = at(i, j - 1), c = at(i + 1, j), d = at(i - 1, j);
      const du = [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dv = [c[0] - d[0], c[1] - d[1], c[2] - d[2]];
      let n = [du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]];
      let l = Math.hypot(...n);
      if (l < 1e-6) n = [0, i === 0 ? -1 : 1, 0], l = 1;
      pos.push(...p); nor.push(n[0] / l, n[1] / l, n[2] / l);
    }
    for (let i = 0; i < nv; i++) for (let j = 0; j < nu; j++) {
      const a = i * (nu + 1) + j, b = a + nu + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
    return { pos, nor, idx };
  }
  // Pinguin-Körper: Bauch-Ei + Kopf, weich verschmolzen; vorn = +z, Boden y = 0
  const PB = { by: 0.83, bry: 0.83, brx: 0.8, hy: 1.93, hr: 0.66, top: 2.59 };
  function penguinBody() {
    const smax = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; };
    const prof = y => {
      const rb = PB.brx * Math.sqrt(Math.max(0, 1 - ((y - PB.by) / PB.bry) ** 2));
      const rh = PB.hr * Math.sqrt(Math.max(0, 1 - ((y - PB.hy) / PB.hr) ** 2));
      return smax(rb, rh, 0.16);
    };
    return grid((u, v) => {
      const y = PB.top * (1 - Math.cos(Math.PI * v)) / 2;
      const r = (v <= 0 || v >= 1) ? 0 : prof(y);
      const a = u * Math.PI * 2, dz = y < 1.45 ? 0.9 : 0.95;
      return [Math.sin(a) * r, y, Math.cos(a) * r * dz];
    }, 64, 90);
  }
  function torus(R, r) {
    return grid((u, v) => {
      const a = u * Math.PI * 2, b = v * Math.PI * 2;
      return [Math.sin(a) * (R + r * Math.cos(b)), r * Math.sin(b), Math.cos(a) * (R + r * Math.cos(b))];
    }, 72, 16);
  }

  function create(canvas) {
    const gl = canvas.getContext('webgl', { antialias: true }) || canvas.getContext('experimental-webgl');
    if (!gl) return null;
    gl.getExtension('OES_standard_derivatives');
    const progT = compile(gl, VS_T, FS_T);
    const progO = compile(gl, VS_O, FS_O);
    const progC = compile(gl, VS_C, FS_C);

    function upload(m) {
      const o = { n: m.idx.length };
      o.vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, o.vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(m.pos), gl.STATIC_DRAW);
      o.nb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, o.nb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(m.nor), gl.STATIC_DRAW);
      o.ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, o.ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(m.idx), gl.STATIC_DRAW);
      return o;
    }
    const meshes = { sphere: upload(sphere(14)), ball: upload(sphere(32)), body: upload(penguinBody()), ring: upload(torus(1, 0.15)), cone: upload(cone(18)), box: upload(box()), cloth: upload(flagCloth()) };

    // Dynamisches Band auf dem Boden (Pfeil, Ring) – jedes Bild neu
    const dyn = { vb: gl.createBuffer(), nb: gl.createBuffer(), ib: gl.createBuffer(), n: 0 };

    let terrain = null, world = null, pal = null;

    function setWorld(w, theme) {
      world = w;
      const Wd = w.W, N = w.meshN || Math.min(250, Math.round(140 * Wd / 50));   // Uint16-Indizes: höchstens 65 535 Ecken
      const pos = [], nor = [], idx = [];
      let h0 = Infinity, h1 = -Infinity;
      for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
        const x = -Wd + 2 * Wd * j / N, z = -Wd + 2 * Wd * i / N, y = w.h(x, z);
        const g = w.grad(x, z);
        const l = Math.hypot(g[0], 1, g[1]);
        pos.push(x, y, z); nor.push(-g[0] / l, 1 / l, -g[1] / l);
        if (y < h0) h0 = y; if (y > h1) h1 = y;
      }
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const a = i * (N + 1) + j, b = a + N + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
      if (terrain) { gl.deleteBuffer(terrain.vb); gl.deleteBuffer(terrain.nb); gl.deleteBuffer(terrain.ib); }
      terrain = upload({ pos, nor, idx });
      terrain.h0 = h0; terrain.h1 = Math.min(h1, h0 + (w.kind === 'model' ? 24 : 26));
      // Welten, die sich verformen (Level 7), behalten ihre Farbskala
      if (w.hRange) { terrain.h0 = w.hRange[0]; terrain.h1 = w.hRange[1]; }
      setTheme(theme);
    }

    function hex(s) { const n = parseInt(s.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
    let custom = null;
    function setTheme(theme) {
      const dark = theme === 'dark';
      pal = custom || (dark ? palDark : palLight);
    }
    /* Eigene Palette (Showroom Eiswelt): {fog, c:[4 hex], amb, light, ice, iceC, plainC, dark}.
       null = wieder die normale hell/dunkel-Palette. */
    function setPalette(p, theme) {
      custom = p ? { fog: hex(p.fog), c: p.c.map(hex), amb: p.amb == null ? 0.45 : p.amb,
        light: norm(p.light || [-0.45, 0.8, 0.4]), ice: p.ice || 0, iceC: hex(p.iceC || '#9cc6e0'),
        plainC: p.plainC ? hex(p.plainC) : null, plainAmb: p.plainAmb, lineK: p.lineK, dark: !!p.dark } : null;
      setTheme(theme);
    }
    const palDark = {
      dark: true,
      fog: hex('#141a2b'), c: ['#1f5f66', '#3f7d4f', '#7d7a5c', '#a7a6b4'].map(hex), amb: 0.38,
      light: norm([-0.4, 0.8, 0.45])
    }, palLight = {
      fog: hex('#dfe6ea'), c: ['#2b8c86', '#78b660', '#cbb784', '#efe9dc'].map(hex), amb: 0.45,
      light: norm([-0.45, 0.8, 0.4])
    };
    function norm(v) { const l = Math.hypot(...v); return v.map(x => x / l); }
    const fogColor = () => pal ? pal.fog : [0.87, 0.9, 0.92];

    function bind(o) {
      gl.bindBuffer(gl.ARRAY_BUFFER, o.vb); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, o.nb); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, o.ib);
    }

    /* Ein Band auf dem Boden: Punkte [x, z, breite] entlang einer Linie,
       jede Ecke auf Bodenhöhe + lift. Für Pfeil und Ring. */
    function groundStrip(pts, closed, lift) {
      const pos = [], nor = [], idx = [];
      const n = pts.length;
      for (let i = 0; i < n; i++) {
        const p = pts[i], q = pts[Math.min(n - 1, i + 1)], o = pts[Math.max(0, i - 1)];
        let dx = q[0] - o[0], dz = q[1] - o[1];
        if (closed) { const a = pts[(i + 1) % n], b = pts[(i - 1 + n) % n]; dx = a[0] - b[0]; dz = a[1] - b[1]; }
        const l = Math.hypot(dx, dz) || 1, nx = -dz / l * p[2], nz = dx / l * p[2];
        for (const s of [-1, 1]) {
          const x = p[0] + nx * s, z = p[1] + nz * s;
          pos.push(x, world.h(x, z) + lift, z); nor.push(0, 1, 0);
        }
      }
      const segs = closed ? n : n - 1;
      for (let i = 0; i < segs; i++) {
        const a = i * 2, b = ((i + 1) % n) * 2;
        idx.push(a, b, a + 1, a + 1, b, b + 1, a, a + 1, b, a + 1, b + 1, b);
      }
      return { pos, nor, idx };
    }
    function drawDyn(m) {
      gl.bindBuffer(gl.ARRAY_BUFFER, dyn.vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(m.pos), gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, dyn.nb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(m.nor), gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, dyn.ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(m.idx), gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, dyn.vb); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, dyn.nb); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
      gl.drawElements(gl.TRIANGLES, m.idx.length, gl.UNSIGNED_SHORT, 0);
    }

    function frame(sc) {
      const dpr = sc.dpr || 1;
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h);
      const fog = fogColor();
      gl.clearColor(fog[0], fog[1], fog[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      if (!terrain) return;
      gl.enable(gl.DEPTH_TEST);
      gl.enableVertexAttribArray(0); gl.enableVertexAttribArray(1);

      const vp = M.mul(M.persp(sc.fov || 0.95, w / h, 0.3, 600), M.look(sc.cam.eye, sc.cam.at, [0, 1, 0]));
      const P = sc.player;

      // Landschaft
      gl.useProgram(progT.p);
      const u = progT.u;
      gl.uniformMatrix4fv(u.uVP, false, vp);
      gl.uniform3fv(u.uLight, pal.light);
      gl.uniform2f(u.uPlayer, sc.fogAt ? sc.fogAt[0] : P.x, sc.fogAt ? sc.fogAt[1] : P.z);
      gl.uniform1f(u.uFogR, sc.fogR);
      gl.uniform3fv(u.uFog, fog);
      gl.uniform1f(u.uH0, terrain.h0); gl.uniform1f(u.uH1, terrain.h1);
      gl.uniform1f(u.uStep, 1.0);
      gl.uniform3fv(u.uC0, pal.c[0]); gl.uniform3fv(u.uC1, pal.c[1]);
      gl.uniform3fv(u.uC2, pal.c[2]); gl.uniform3fv(u.uC3, pal.c[3]);
      gl.uniform1f(u.uAmb, pal.amb);
      gl.uniform1f(u.uPlain, sc.plain || 0);
      gl.uniform3fv(u.uPlainC, pal.plainC || pal.c[1].map((v, i) => v + (pal.c[2][i] - v) * 0.35));
      gl.uniform1f(u.uIce, pal.ice || 0);
      gl.uniform1f(u.uPlainAmb, pal.plainAmb == null ? pal.amb : pal.plainAmb);
      if (u.uLineK) gl.uniform1f(u.uLineK, pal.lineK || 0.72);
      gl.uniform3fv(u.uIceC, pal.iceC || [0.6, 0.78, 0.88]);
      bind(terrain);
      gl.drawElements(gl.TRIANGLES, terrain.n, gl.UNSIGNED_SHORT, 0);

      // Körper
      gl.useProgram(progO.p);
      const o = progO.u;
      gl.uniformMatrix4fv(o.uVP, false, vp);
      gl.uniform3fv(o.uLight, pal.light);
      gl.uniform2f(o.uPlayer, sc.fogAt ? sc.fogAt[0] : P.x, sc.fogAt ? sc.fogAt[1] : P.z);
      gl.uniform1f(o.uFogR, sc.fogR);
      gl.uniform3fv(o.uFog, fog);
      gl.uniform1f(o.uAmb, pal.amb);

      const draw = (mesh, m, color, glow) => {
        gl.uniformMatrix4fv(o.uM, false, m);
        gl.uniform3fv(o.uColor, color);
        gl.uniform1f(o.uGlow, glow || 0);
        bind(meshes[mesh]);
        gl.drawElements(gl.TRIANGLES, meshes[mesh].n, gl.UNSIGNED_SHORT, 0);
      };

      for (const ob of sc.objects || []) {
        if (ob.type === 'dot') draw('sphere', M.trs(ob.x, ob.y, ob.z, 0, 0, ob.r, ob.r * (ob.flat || 1), ob.r), ob.color, ob.glow);
        else if (ob.type === 'strip') {
          gl.uniformMatrix4fv(o.uM, false, M.trs(0, 0, 0, 0, 0, 1, 1, 1));
          gl.uniform3fv(o.uColor, ob.color); gl.uniform1f(o.uGlow, ob.glow || 0);
          drawDyn(groundStrip(ob.pts, ob.closed, ob.lift || 0.12));
        } else if (ob.type === 'flag') {
          const y = world.h(ob.x, ob.z), k = ob.s || 1;
          draw('box', M.trs(ob.x, y + 2.2 * k, ob.z, 0, 0, 0.09 * k, 2.2 * k, 0.09 * k), [0.95, 0.95, 0.95], 0.2);
          draw('cloth', M.trs(ob.x, y + 4.4 * k, ob.z, ob.yaw || 0, 0, 1.4 * k, 1.4 * k, 1.4 * k), ob.color, 0.35);
          draw('sphere', M.trs(ob.x, y, ob.z, 0, 0, 0.6 * k, 0.18 * k, 0.6 * k), ob.color, 0.5);
        }
      }

      // Figur: kleiner Pinguin (eigenes Programm progC)
      if (P && !P.hidden) drawPenguin(P, sc.playerColor || [1, 0.55, 0.2], vp, sc);
      // weitere Pinguine (Lobby von „Gemeinsam spielen“, js/mehr.js): je eigene Schalfarbe
      for (const q of sc.others || []) drawPenguin(q, q.color || [1, 0.55, 0.2], vp, sc);
    }

    /* Der Pinguin. Körper und Kopf sind EIN Drehkörper, Bauch/Gesicht/
       Bäckchen malt der Shader. Watscheln: Rollen links/rechts im Schritt,
       der freie Fuß hebt ab, Flossen schwingen gegengleich, Körper federt;
       im Sprung Flossen ausgebreitet; im Stehen atmen + blinzeln. */
    function drawPenguin(P, col, vp, sc) {
      const sq = P.squash || 1, walk = Math.max(0, Math.min(1, P.walk || 0));
      const ph = (P.phase || 0) * 2.2, now = performance.now() / 1000 + (P.seed || 0);
      const air = Math.max(0, Math.min(1, ((P.y || 0) - (P.ground || 0) - 0.25) / 1.2));
      const sw = Math.sin(ph);
      const roll = sw * 0.17 * walk;
      const wob = Math.cos(ph) * 0.09 * walk;
      const bounce = 1 - Math.abs(Math.cos(ph)) * 0.05 * walk;
      const breathe = 1 + Math.sin(now * 2.4) * 0.016 * (1 - walk);
      const blink = (now % 3.9) < 0.13 ? 0.1 : 1;
      // Upgrade 18.11.2026: steht er still, winkt er ab und zu mit der rechten Flosse; im Sprung geht der Schnabel auf
      const idle = (1 - walk) * (1 - air), wt = ((now + 2.3 + (P.seed ? 0 : Math.abs(P.x * 0.37 + P.z * 0.53))) % 8.5 + 8.5) % 8.5;   // ohne seed: Ort versetzt, damit nicht alle zugleich winken
      const wave = idle * (wt < 1.5 ? Math.sin(Math.PI * wt / 1.5) : 0);
      const open = Math.max(air, wave * 0.45);
      const S = 0.9 * (P.scale || 1);          // scale: größere Pinguine auf der Karte der Lehrkraft (mehr.js)
      const fog = fogColor(), dark = !!pal.dark;
      const c = progC.u;
      gl.useProgram(progC.p);
      gl.uniformMatrix4fv(c.uVP, false, vp);
      gl.uniform3fv(c.uLight, pal.light);
      gl.uniform3fv(c.uEye, sc.cam.eye);
      gl.uniform2f(c.uPlayer, sc.fogAt ? sc.fogAt[0] : P.x, sc.fogAt ? sc.fogAt[1] : P.z);
      gl.uniform1f(c.uFogR, sc.fogR);
      gl.uniform3fv(c.uFog, fog);
      gl.uniform1f(c.uAmb, pal.amb);
      gl.uniform1f(c.uDarkTheme, dark ? 1 : 0);
      const draw = (mesh, m, color, o) => {
        o = o || {};
        gl.uniformMatrix4fv(c.uM, false, m);
        gl.uniformMatrix3fv(c.uN, false, normalMat(m));
        gl.uniform3fv(c.uColor, color);
        gl.uniform3fv(c.uColor2, o.c2 || color);
        gl.uniform1f(c.uGlow, o.glow || 0);
        gl.uniform1f(c.uPat, o.pat || 0);
        gl.uniform1f(c.uSpec, o.spec == null ? 0.18 : o.spec);
        gl.uniform1f(c.uAlpha, o.alpha || 0);
        bind(meshes[mesh]);
        gl.drawElements(gl.TRIANGLES, meshes[mesh].n, gl.UNSIGNED_SHORT, 0);
      };

      // weicher Schatten, liegt auf dem Hang
      const g = world.grad(P.x, P.z), sr = 0.95 * S / (1 + air * 0.8);
      gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE); gl.depthMask(false);
      draw('ball', [sr, g[0] * sr, 0, 0, 0, 0.01, 0, 0, 0, g[1] * sr, sr, 0, P.x, P.ground + 0.07, P.z, 1],
        dark ? [0.02, 0.03, 0.06] : [0.12, 0.14, 0.1], { pat: 4, alpha: (dark ? 0.55 : 0.38) * (1 - air * 0.5) });
      gl.disable(gl.BLEND); gl.depthMask(true);

      const base = M.mul(M.trs(P.x, P.y, P.z, (P.yaw || 0) + wob, P.tilt || 0, 1, 1, 1),
        M.mul(M.rz(roll), M.scl(S / Math.sqrt(sq), S * sq * breathe * bounce, S / Math.sqrt(sq))));
      const part = (mesh, m, color, o) => draw(mesh, M.mul(base, m), color, o);
      const T = (x, y, z, sx, sy, sz) => M.trs(x, y, z, 0, 0, sx, sy, sz);
      const chain = (...ms) => ms.reduce((a, b) => M.mul(a, b));

      const navy = dark ? [0.2, 0.25, 0.4] : [0.16, 0.2, 0.32];
      const orange = [1, 0.6, 0.16], beakC = [1, 0.74, 0.2];
      const cream = [1, 0.96, 0.86];

      // Füße (Schwimmfüße mit drei Zehen-Wülsten); der freie hebt ab
      for (const s of [-1, 1]) {
        const up = Math.max(0, s * sw) * walk, fwd = s * sw * 0.16 * walk;
        const F = chain(M.trs(0.3 * s, 0.05 + up * 0.2, 0.2 + fwd, 0.18 * s, -up * 0.5, 1, 1, 1));
        part('ball', M.mul(F, T(0, 0, 0.06, 0.2, 0.075, 0.24)), orange, { spec: 0.3 });
        for (const t of [-1, 0, 1]) part('ball', M.mul(F, T(t * 0.11, -0.005, 0.27 - Math.abs(t) * 0.03, 0.075, 0.06, 0.1)), orange, { spec: 0.3 });
      }
      // Körper + Kopf aus einem Guss
      part('body', M.scl(1, 1, 1), navy, { pat: 1, spec: 0.22 });
      // Schwänzchen
      part('cone', chain(M.trs(0, 0.3, -0.5, 0, 0, 1, 1, 1), M.rx(-2.25), M.scl(0.2, 0.26, 0.07)), navy, { spec: 0.1 });
      // Flossen: gegengleich im Schritt, im Sprung ausgebreitet
      for (const s of [-1, 1]) {
        const wv = s > 0 ? wave * (2.35 + 0.35 * Math.sin(wt * 13)) : 0;
        const flap = 0.2 + walk * (0.12 + 0.14 * Math.sin(ph + (s > 0 ? 0 : Math.PI))) + air * 1.05 + wv;
        part('ball', chain(M.trs(0.7 * s, 1.36, -0.02, 0, 0, 1, 1, 1), M.rz(flap * s), M.rx(0.12 - wv * 0.25),
          T(0, -0.4, 0, 0.1, 0.46, 0.25)), navy, { spec: 0.2 });
      }
      // Augen: groß, glänzend, mit zwei Lichtpunkten
      for (const s of [-1, 1]) {
        const ph2 = 0.34 * s, el = 0.1, R = PB.hr;
        const ex = Math.sin(ph2) * Math.cos(el) * R * 0.97, ey = PB.hy + Math.sin(el) * R * 0.97, ez = Math.cos(ph2) * Math.cos(el) * R * 0.95 * 0.97;
        part('ball', chain(M.trs(ex, ey, ez, ph2, -el, 1, 1, 1), M.scl(0.105, 0.135 * blink, 0.07)), [0.04, 0.04, 0.07], { spec: 1 });
        if (blink === 1) {
          part('ball', M.trs(ex + 0.035 * s * 0.3 - 0.02, ey + 0.05, ez + 0.06, 0, 0, 0.034, 0.034, 0.02), [1, 1, 1], { glow: 1 });
          part('ball', M.trs(ex + 0.03, ey - 0.045, ez + 0.06, 0, 0, 0.016, 0.016, 0.01), [1, 1, 1], { glow: 1 });
        } else {
          part('ball', chain(M.trs(ex, ey - 0.005, ez + 0.01, ph2, -el, 1, 1, 1), M.scl(0.1, 0.018, 0.07)), navy, {});
        }
      }
      // Schnabel: Ober- und Unterschnabel, leicht nach unten; im Sprung (und beim Winken) geht er auf
      const bz = PB.hr * 0.95 * 0.96, by = PB.hy - 0.08;
      if (open > 0.08) part('ball', T(0, by - 0.035, bz - 0.01, 0.07, 0.06 * open + 0.02, 0.05), [0.45, 0.08, 0.12], { spec: 0.2 });
      part('cone', chain(M.trs(0, by + 0.012, bz, 0, 0, 1, 1, 1), M.rx(Math.PI / 2 + 0.2 - open * 0.18), M.scl(0.14, 0.23, 0.075)), beakC, { spec: 0.55 });
      part('cone', chain(M.trs(0, by - 0.04, bz - 0.01, 0, 0, 1, 1, 1), M.rx(Math.PI / 2 + 0.36 + open * 0.7), M.scl(0.105, 0.16, 0.05)), orange, { spec: 0.35 });
      // Haarbüschel oben
      for (const [t, h, lean] of [[-0.05, 0.15, -0.5], [0.01, 0.2, 0.0], [0.06, 0.13, 0.55]]) {
        part('cone', chain(M.trs(t, PB.top - 0.06, 0.02, 0, 0, 1, 1, 1), M.rz(-lean), M.rx(-0.3), M.scl(0.06, h, 0.055)), navy, { spec: 0.05 });
      }
      // Strickschal in Spielerfarbe, Knoten vorn seitlich, zwei Zipfel wehen mit
      const light = col.map(v => v + (1 - v) * 0.72);
      part('ring', chain(M.trs(0, 1.5, 0.02, 0, 0.12, 1, 1, 1), M.scl(0.6, 0.75, 0.57)), col, { pat: 2, c2: light, spec: 0.08 });
      const kn = [0.3, 1.42, 0.5];
      part('ball', T(kn[0], kn[1], kn[2], 0.12, 0.11, 0.09), col, { pat: 2, c2: light, spec: 0.08 });
      for (const [k, sway0] of [[0, 0.18], [1, -0.08]]) {
        const sway = sway0 + roll * 1.6 + Math.sin(now * 3 + k) * 0.04 + walk * 0.1 * Math.sin(ph * 2 + k);
        const Z = chain(M.trs(kn[0] + k * 0.05, kn[1] - 0.02, kn[2] + 0.02 - k * 0.04, 0, -0.18 - walk * 0.25, 1, 1, 1), M.rz(sway));
        part('ball', M.mul(Z, T(0, -0.3, 0, 0.12, 0.32, 0.035)), col, { pat: 3, c2: light, spec: 0.05 });
        // Fransen am Ende des Zipfels
        for (const fx of [-0.07, 0, 0.07]) part('ball', M.mul(Z, T(fx, -0.64 - Math.abs(fx) * 0.3, 0, 0.022, 0.07, 0.02)), light, { spec: 0.02 });
      }
    }

    // Bildschirmposition eines Weltpunkts (für Beschriftungen in HTML)
    function project(sc, p) {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      const vp = M.mul(M.persp(sc.fov || 0.95, w / h, 0.3, 600), M.look(sc.cam.eye, sc.cam.at, [0, 1, 0]));
      const x = vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12];
      const y = vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13];
      const ww = vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15];
      if (ww <= 0) return null;
      return { x: (x / ww * 0.5 + 0.5) * w, y: (1 - (y / ww * 0.5 + 0.5)) * h };
    }

    // Umkehrung: Bildschirmpunkt → Punkt auf der Ebene y = y0 (Lobby: dahin laufen, wo man tippt)
    function unproject(sc, sx, sy, y0) {
      const w = canvas.clientWidth, h = canvas.clientHeight, e = sc.cam.eye, a = sc.cam.at;
      let f = [a[0] - e[0], a[1] - e[1], a[2] - e[2]];
      const fl = Math.hypot(f[0], f[1], f[2]) || 1; f = f.map(v => v / fl);
      let r = [f[1] * 0 - f[2] * 1, f[2] * 0 - f[0] * 0, f[0] * 1 - f[1] * 0];      // f × (0,1,0)
      const rl = Math.hypot(r[0], r[1], r[2]) || 1; r = r.map(v => v / rl);
      const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
      const t = Math.tan((sc.fov || 0.95) / 2), nx = (sx / w) * 2 - 1, ny = 1 - (sy / h) * 2;
      const d = [0, 1, 2].map(i => f[i] + r[i] * nx * t * (w / h) + u[i] * ny * t);
      if (Math.abs(d[1]) < 1e-6) return null;
      const k = ((y0 || 0) - e[1]) / d[1];
      if (k <= 0) return null;
      return { x: e[0] + d[0] * k, z: e[2] + d[2] * k };
    }

    return { setWorld, setTheme, setPalette, frame, project, unproject, gl };
  }

  return { create };
})();
