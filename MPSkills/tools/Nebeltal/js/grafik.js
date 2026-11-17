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
    uniform float uAmb; uniform float uPlain;
    void main(){
      float t=clamp((vPos.y-uH0)/(uH1-uH0),0.0,1.0);
      vec3 c = t<0.33 ? mix(uC0,uC1,t/0.33) : (t<0.66 ? mix(uC1,uC2,(t-0.33)/0.33) : mix(uC2,uC3,(t-0.66)/0.34));
      c=mix(c,mix(uC1,uC2,0.35),uPlain);
      vec3 n=normalize(vNor);
      float l=uAmb+(1.0-uAmb)*max(dot(n,uLight),0.0);
      c*=l;
      float q=vPos.y/uStep;
      #ifdef GL_OES_standard_derivatives
      float w=fwidth(q);
      float line=1.0-smoothstep(0.0,w*1.4,abs(fract(q+0.5)-0.5));
      #else
      float line=1.0-smoothstep(0.0,0.06,abs(fract(q+0.5)-0.5));
      #endif
      c=mix(c,c*0.72,line*0.55*(1.0-uPlain));
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

  function create(canvas) {
    const gl = canvas.getContext('webgl', { antialias: true }) || canvas.getContext('experimental-webgl');
    if (!gl) return null;
    gl.getExtension('OES_standard_derivatives');
    const progT = compile(gl, VS_T, FS_T);
    const progO = compile(gl, VS_O, FS_O);

    function upload(m) {
      const o = { n: m.idx.length };
      o.vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, o.vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(m.pos), gl.STATIC_DRAW);
      o.nb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, o.nb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(m.nor), gl.STATIC_DRAW);
      o.ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, o.ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(m.idx), gl.STATIC_DRAW);
      return o;
    }
    const meshes = { sphere: upload(sphere(14)), ball: upload(sphere(30)), cone: upload(cone(18)), box: upload(box()), cloth: upload(flagCloth()) };

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
    function setTheme(theme) {
      const dark = theme === 'dark';
      pal = dark ? {
        fog: hex('#141a2b'), c: ['#1f5f66', '#3f7d4f', '#7d7a5c', '#a7a6b4'].map(hex), amb: 0.38,
        light: norm([-0.4, 0.8, 0.45])
      } : {
        fog: hex('#dfe6ea'), c: ['#2b8c86', '#78b660', '#cbb784', '#efe9dc'].map(hex), amb: 0.45,
        light: norm([-0.45, 0.8, 0.4])
      };
    }
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
          const y = world.h(ob.x, ob.z);
          draw('box', M.trs(ob.x, y + 2.2, ob.z, 0, 0, 0.09, 2.2, 0.09), [0.95, 0.95, 0.95], 0.2);
          draw('cloth', M.trs(ob.x, y + 4.4, ob.z, ob.yaw || 0, 0, 1.4, 1.4, 1.4), ob.color, 0.35);
          draw('sphere', M.trs(ob.x, y, ob.z, 0, 0, 0.6, 0.18, 0.6), ob.color, 0.5);
        }
      }

      // Figur: kleiner Pinguin. Kippt mit dem Hang, staucht beim Landen,
      // watschelt beim Laufen (Rollen links/rechts, Füße abwechselnd,
      // Flossen schwingen), blinzelt im Stehen. Schal = playerColor.
      if (P && !P.hidden) drawPenguin(P, sc.playerColor || [1, 0.55, 0.2], draw);
    }

    function drawPenguin(P, col, draw) {
      const sq = P.squash || 1, walk = Math.max(0, Math.min(1, P.walk || 0));
      const ph = (P.phase || 0) * 2.2, now = performance.now() / 1000;
      const air = Math.max(0, Math.min(1, ((P.y || 0) - (P.ground || 0) - 0.25) / 1.2));
      const sw = Math.sin(ph);
      const roll = sw * 0.2 * walk;                       // watscheln
      const wob = Math.cos(ph) * 0.1 * walk;              // Hüfte dreht leicht mit
      const breathe = 1 + Math.sin(now * 2.4) * 0.018 * (1 - walk);
      const blink = (now % 3.7) < 0.12 ? 0.12 : 1;
      draw('ball', M.trs(P.x, P.ground + 0.06, P.z, 0, 0, 0.66, 0.03, 0.66), [0.16, 0.2, 0.18], 0.6);   // Schatten
      const base = M.mul(M.trs(P.x, P.y, P.z, (P.yaw || 0) + wob, P.tilt || 0, 1, 1, 1),
        M.mul(M.rz(roll), M.scl(1 / Math.sqrt(sq), sq * breathe, 1 / Math.sqrt(sq))));
      const part = (mesh, m, c, glow) => draw(mesh, M.mul(base, m), c, glow);
      const T = (x, y, z, sx, sy, sz) => M.trs(x, y, z, 0, 0, sx, sy, sz);

      const dark = [0.2, 0.25, 0.38], white = [0.98, 0.97, 0.93], beak = [1, 0.72, 0.18],
        feet = [0.98, 0.56, 0.14], eye = [0.06, 0.06, 0.09], blush = [1, 0.62, 0.66];

      // Füße: der gerade freie Fuß hebt ab und schwingt nach vorn
      for (const s of [-1, 1]) {
        const up = Math.max(0, s * sw) * walk, fwd = s * sw * 0.18 * walk;
        part('ball', T(0.27 * s, 0.07 + up * 0.22, 0.24 + fwd, 0.22, 0.08, 0.32), feet, 0.12);
      }
      // Körper, Bauch, Schwänzchen
      part('cone', M.mul(M.trs(0, 0.28, -0.5, 0, 0, 1, 1, 1), M.mul(M.rx(-2.1), M.scl(0.2, 0.32, 0.1))), dark, 0.12);
      part('ball', T(0, 0.98, 0, 0.7, 0.95, 0.64), dark, 0.12);
      part('ball', T(0, 0.86, 0.3, 0.52, 0.74, 0.4), white, 0.1);
      // Flossen: schwingen beim Laufen, breiten sich im Sprung aus
      for (const s of [-1, 1]) {
        const a = 0.22 + walk * 0.18 * (0.6 + 0.4 * Math.sin(ph * 2 + (s > 0 ? 0 : Math.PI))) + air * 1.0;
        part('ball', M.mul(M.trs(0.6 * s, 1.35, 0, 0, 0, 1, 1, 1),
          M.mul(M.rz(a * s), T(0, -0.42, 0, 0.13, 0.5, 0.3))), dark, 0.12);
      }
      // Schal in der Farbe des Spielers, ein Zipfel hängt hinten herunter
      part('ball', T(0, 1.58, 0.02, 0.6, 0.15, 0.56), col, 0.15);
      part('box', M.mul(M.trs(0.12, 1.3, -0.5, 0, 0, 1, 1, 1), M.mul(M.rz(0.15 + roll * 1.5), M.scl(0.11, 0.26, 0.05))), col, 0.15);
      // Kopf (groß = niedlich), helles Gesicht
      const hy = 2.0;
      part('ball', T(0, hy, 0.02, 0.56, 0.52, 0.54), dark, 0.12);
      part('ball', T(0, hy - 0.04, 0.22, 0.42, 0.38, 0.36), white, 0.1);
      // Augen mit Glanzpunkt, Bäckchen
      for (const s of [-1, 1]) {
        part('ball', T(0.17 * s, hy + 0.04, 0.53, 0.085, 0.11 * blink, 0.07), eye, 0);
        if (blink === 1) part('ball', T(0.15 * s + 0.03, hy + 0.09, 0.59, 0.03, 0.03, 0.02), [1, 1, 1], 1);
        part('ball', T(0.31 * s, hy - 0.12, 0.46, 0.09, 0.05, 0.04), blush, 0.5);
      }
      // Schnabel nach vorn
      part('cone', M.mul(M.trs(0, hy - 0.1, 0.52, 0, 0, 1, 1, 1), M.mul(M.rx(Math.PI / 2), M.scl(0.13, 0.26, 0.09))), beak, 0.2);
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

    return { setWorld, setTheme, frame, project, gl };
  }

  return { create };
})();
