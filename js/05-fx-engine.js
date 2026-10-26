'use strict';
/* Efek berbasis WebGL: tiap efek = 1 fragment shader. Efek ditumpuk berurutan (ping-pong FBO),
   semua parameter bisa di-keyframe karena nilainya dievaluasi per frame lalu dikirim sebagai uniform. */
(function () {
const NUM = (k, l, min, max, def, step = 1, unit = '') => ({ k, l, min, max, def, step, unit });
const SEL = (k, l, opts, def = 0) => ({ k, l, type: 'sel', opts, def });

ML.FXDEF = {
  tiles: {
    name: 'Ubin (Tiles)', icon: 'grid',
    params: [NUM('count', 'Jumlah ubin', 1, 12, 2, 0.01), NUM('ox', 'Geser X', -100, 100, 0, 1, '%'), NUM('oy', 'Geser Y', -100, 100, 0, 1, '%'), SEL('mirror', 'Tepi cermin', ['Mati', 'Hidup'])],
    frag: `void main(){
      vec2 p=(vUV-.5)*u_count+.5+vec2(u_ox,u_oy)*.01;
      vec2 q=u_mirror>.5?1.-abs(1.-mod(p,2.)):fract(p);
      gl_FragColor=texture2D(u_tex,q);}`
  },
  oscillate: {
    name: 'Ombang-ambing (Oscillate)', icon: 'curve',
    params: [NUM('amp', 'Jarak', 0, 100, 10, 0.1, '%'), NUM('freq', 'Frekuensi (Hz)', 0, 10, 1, 0.01), NUM('angle', 'Arah', -180, 180, 0, 1, '°'), NUM('phase', 'Fase', -360, 360, 0, 1, '°'), NUM('scale', 'Denyut skala', -100, 100, 0, 1, '%')],
    frag: `void main(){
      float a=radians(u_angle), s=sin(6.2831853*u_freq*u_time+radians(u_phase));
      vec2 off=vec2(cos(a),sin(a))*u_amp*.01*s; off.y*=u_res.x/u_res.y;
      float sc=max(.01,1.+u_scale*.01*s);
      gl_FragColor=S((vUV-.5)/sc+.5-off);}`
  },
  swing: {
    name: 'Ayun (Swing)', icon: 'adjust',
    params: [NUM('amp', 'Sudut ayun', 0, 180, 20, 0.1, '°'), NUM('freq', 'Frekuensi (Hz)', 0, 10, 1, 0.01), NUM('px', 'Poros X', -50, 150, 50, 1, '%'), NUM('py', 'Poros Y', -50, 150, 50, 1, '%'), NUM('phase', 'Fase', -360, 360, 0, 1, '°')],
    frag: `void main(){
      float ang=radians(u_amp)*sin(6.2831853*u_freq*u_time+radians(u_phase));
      vec2 c=vec2(u_px,u_py)*.01; vec2 p=(vUV-c)*u_res;
      float cs=cos(ang), sn=sin(ang);
      p=vec2(cs*p.x+sn*p.y,-sn*p.x+cs*p.y);
      gl_FragColor=S(p/u_res+c);}`
  },
  motionblur: {
    name: 'Buram Gerak (Motion Blur)', icon: 'fx', special: true,
    params: [NUM('shutter', 'Rana (shutter)', 0, 720, 360, 1, '°'), NUM('samples', 'Sampel', 2, 32, 8, 1)]
  },
  mirror: {
    name: 'Cermin (Mirror)', icon: 'layers',
    params: [NUM('cx', 'Titik X', 0, 100, 50, 0.1, '%'), NUM('cy', 'Titik Y', 0, 100, 50, 0.1, '%'), NUM('angle', 'Sudut', -180, 180, 0, 1, '°'), SEL('side', 'Sisi', ['Kiri/atas disalin', 'Kanan/bawah disalin'])],
    frag: `void main(){
      vec2 c=vec2(u_cx,u_cy)*.01; float a=radians(u_angle); vec2 n=vec2(cos(a),sin(a));
      vec2 p=(vUV-c)*u_res; float d=dot(p,n);
      if(u_side<.5){ if(d<0.) p-=2.*d*n; } else { if(d>0.) p-=2.*d*n; }
      gl_FragColor=S(p/u_res+c);}`
  },
  lumakey: {
    name: 'Luma Key', icon: 'adjust',
    params: [NUM('th', 'Ambang', 0, 100, 50, 0.1, '%'), NUM('soft', 'Kehalusan', 0, 50, 5, 0.1, '%'), SEL('mode', 'Hapus', ['Bagian gelap', 'Bagian terang'])],
    frag: `void main(){
      vec4 c=texture2D(u_tex,vUV);
      vec3 rgb=c.a>0.?c.rgb/c.a:vec3(0.);
      float l=dot(rgb,vec3(.299,.587,.114));
      float so=max(u_soft*.01,.0001), th=u_th*.01;
      float k=smoothstep(th-so,th+so,l); if(u_mode>.5) k=1.-k;
      gl_FragColor=c*k;}`
  },
  copybg: {
    name: 'Salin Latar Belakang', icon: 'copy', needsBg: true,
    params: [NUM('amt', 'Jumlah', 0, 100, 100, 1, '%')],
    frag: `void main(){
      vec4 s=texture2D(u_tex,vUV); vec4 b=texture2D(u_bg,vUV);
      gl_FragColor=b*(s.a*u_amt*.01);}`
  },
  wave: {
    name: 'Lengkungan Gelombang (Wave Warp)', icon: 'curve',
    params: [NUM('amp', 'Tinggi gelombang', 0, 30, 3, 0.1, '%'), NUM('wl', 'Panjang gelombang', 2, 100, 25, 0.1, '%'), NUM('angle', 'Arah', -180, 180, 0, 1, '°'), NUM('speed', 'Kecepatan (Hz)', -5, 5, 0.5, 0.01), NUM('phase', 'Fase', -360, 360, 0, 1, '°')],
    frag: `void main(){
      float a=radians(u_angle); vec2 d=vec2(cos(a),sin(a)); vec2 pp=vec2(-d.y,d.x);
      vec2 p=(vUV-.5)*u_res; float wl=max(u_wl*.01*u_res.x,1.);
      float w=dot(p,d)/wl*6.2831853+6.2831853*u_speed*u_time+radians(u_phase);
      float disp=u_amp*.01*u_res.x*sin(w);
      gl_FragColor=S(vUV+pp*disp/u_res);}`
  }
};
ML.FX_ORDER = ['tiles', 'oscillate', 'swing', 'motionblur', 'mirror', 'lumakey', 'copybg', 'wave'];

const XI = {};
ML.xmlImage = src => { let o = XI[src]; if (!o) { o = XI[src] = { img: new Image(), ok: false }; o.img.onload = () => { o.ok = true; }; o.img.src = 'effects/' + src; } return o.ok ? o.img : null; };

ML.makeEffect = type => {
  const d = ML.FXDEF[type], e = { id: ML.uid(), type, on: true, p: {} };
  d.params.forEach(p => e.p[p.k] = ML.A(p.def));
  return e;
};

const VERT = `attribute vec2 a; uniform float u_flip; varying vec2 vUV;
void main(){ vUV=vec2(a.x*.5+.5,.5-a.y*.5); gl_Position=vec4(a.x,a.y*u_flip,0.,1.); }`;
const HEAD = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUV; uniform sampler2D u_tex; uniform sampler2D u_bg; uniform vec2 u_res; uniform float u_time; uniform vec4 u_A; uniform vec2 u_T; uniform vec2 u_Lz;
vec4 S(vec2 uv){ if(uv.x<0.||uv.x>1.||uv.y<0.||uv.y>1.) return vec4(0.); return texture2D(u_tex,uv); }
`;

const IDENT4 = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
/* header vertex shader untuk efek XML yang membawa vertex shader sendiri (vertShaderInit = quad layar penuh) */
const VHEAD = `precision highp float; attribute vec2 a; uniform float u_flip; varying vec2 vUV; uniform vec2 u_res; uniform float u_time; uniform vec4 u_A; uniform vec2 u_T; uniform vec2 u_Lz; uniform float u_pass; uniform mat4 u_orient;
void vertShaderInit(){ vUV=vec2(a.x*.5+.5,.5-a.y*.5); gl_Position=vec4(a.x,a.y*u_flip,0.,1.); }
`;
ML.FXDEF.__copy = { name: 'copy', params: [], frag: 'void main(){ gl_FragColor=texture2D(u_tex,vUV); }' };

ML.FX = class {
  constructor() {
    this.cv = document.createElement('canvas'); this.cv.width = this.cv.height = 2;
    const gl = this.gl = this.cv.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
    this.ok = !!gl; this.progs = {}; this.w = this.h = 0;
    if (!gl) return;
    this.buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.src = this.tex(); this.bg = this.tex();
    this.blank = this.tex(); gl.bindTexture(gl.TEXTURE_2D, this.blank); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    this.fb = [null, null].map(() => { const t = this.tex(); return { t, f: gl.createFramebuffer() }; });
  }
  /** buffer perantara efek multi-pass (ukuran = layar / downsample), disimpan per jenis efek */
  bufsFor(type, d, w, h) {
    const gl = this.gl, st = this.bufStore || (this.bufStore = {});
    let o = st[type]; if (o && o.w === w && o.h === h) return o.m;
    if (o) Object.values(o.m).forEach(b => { gl.deleteTexture(b.t); gl.deleteFramebuffer(b.f); });
    const m = {}; d.bufs.forEach(b => {
      const bw = Math.max(1, Math.ceil(w / b.ds)), bh = Math.max(1, Math.ceil(h / b.ds)), t = this.tex(), f = gl.createFramebuffer();
      gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, bw, bh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      m[b.id] = { t, f, w: bw, h: bh };
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); st[type] = { w, h, m }; return m;
  }
  /** tekstur gambar bawaan efek (resource/*.webp); sebelum selesai dimuat dipakai tekstur kosong */
  imgTex(src) {
    const gl = this.gl, c = this.itex || (this.itex = {}); let o = c[src];
    const im = ML.xmlImage(src);
    if (o && (o.real || !im)) return o;
    if (!o) o = c[src] = { t: this.tex(), w: 1, h: 1, real: false };
    gl.bindTexture(gl.TEXTURE_2D, o.t); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    if (im) { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im); o.w = im.naturalWidth; o.h = im.naturalHeight; o.real = true; }
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 128, 255]));
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    return o;
  }
  dispose() { if (this.ok) { const x = this.gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); this.ok = false; } }
  tex() {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  resize(w, h) {
    if (!this.ok || (w === this.w && h === this.h)) return;
    const gl = this.gl; this.w = this.cv.width = w; this.h = this.cv.height = h;
    this.fb.forEach(o => {
      gl.bindTexture(gl.TEXTURE_2D, o.t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, o.f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, o.t, 0);
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  /** program per efek (dan per grup shader untuk efek XML yang punya grup) */
  prog(type, gid) {
    const d = ML.FXDEF[type]; if (!d) return null;
    const grp = d.groups && gid != null ? d.groups[gid] : null, key = grp ? type + '|' + gid : type;
    if (this.progs[key] !== undefined) return this.progs[key];
    const gl = this.gl, fsrc = grp ? grp.frag : d.frag, vsrc = grp ? grp.vert : d.vert;
    if (!fsrc) return (this.progs[key] = null);
    const uni = d.params.map(p => 'uniform float u_' + p.k + ';').join('\n');
    const mk = (t, src) => { const sh = gl.createShader(t); gl.shaderSource(sh, src); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { console.error(key, gl.getShaderInfoLog(sh)); return null; } return sh; };
    const vs = mk(gl.VERTEX_SHADER, vsrc ? VHEAD + uni + '\n' + vsrc : VERT), fs = mk(gl.FRAGMENT_SHADER, HEAD + uni + '\n' + fsrc);
    if (!vs || !fs) return (this.progs[key] = null);
    const p = gl.createProgram(); gl.attachShader(p, vs); gl.attachShader(p, fs); gl.bindAttribLocation(p, 0, 'a'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.error(key, gl.getProgramInfoLog(p)); return (this.progs[key] = null); }
    const loc = {}, ex = ['u_pass', 'u_orient', 'u_V', 'u_ls'];
    (d.bufs || []).forEach(b => ex.push('u_b_' + b.id, 'u_bs_' + b.id)); (d.imgs || []).forEach(b => ex.push('u_i_' + b.id, 'u_is_' + b.id));
    ['u_tex', 'u_bg', 'u_res', 'u_time', 'u_flip', 'u_A', 'u_T', 'u_Lz'].concat(ex, d.params.map(q => 'u_' + q.k)).forEach(n => loc[n] = gl.getUniformLocation(p, n));
    return (this.progs[key] = { p, loc });
  }
  /** tekstur antara untuk iterasi / tahap bertingkat; dipakai per kedalaman rekursi sub-efek */
  midFor(depth, k, w, h) {
    const gl = this.gl, pool = this.mid || (this.mid = {}), key = depth * 2 + k; let o = pool[key];
    if (!o) o = pool[key] = { t: this.tex(), f: gl.createFramebuffer(), w: 0, h: 0 };
    if (o.w !== w || o.h !== h) {
      gl.bindTexture(gl.TEXTURE_2D, o.t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, o.f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, o.t, 0); gl.bindFramebuffer(gl.FRAMEBUFFER, null); o.w = w; o.h = h;
    }
    return o;
  }
  /** jalankan satu efek: tahap grup shader x iterasi; keluaran ke out = {f, w, h, flip} */
  exec(type, vals, inTex, out, time, geo, w, h, depth, groups) {
    const d = ML.FXDEF[type];
    if (groups === undefined && d.scriptGroups && ML.xmlGroups) groups = ML.xmlGroups(type, vals, time);
    let stages = groups ? groups.filter(g => !d.groups || d.groups[g]) : [d.defGroup == null ? null : d.defGroup];
    if (groups && !stages.length) stages = [];
    const it = d.iter && vals[d.iter] != null ? Math.max(1, Math.min(8, Math.round(vals[d.iter]))) : 1, steps = [];
    for (let i = 0; i < it; i++) stages.forEach(g => steps.push(g));
    if (!steps.length) { this.step('__copy', null, {}, inTex, out, time, geo, w, h, depth); return; }
    let cur = inTex;
    steps.forEach((g, j) => {
      const last = j === steps.length - 1, m = last ? null : this.midFor(depth, j % 2, w, h);
      this.step(type, g, vals, cur, last ? out : { f: m.f, w, h, flip: -1 }, time, geo, w, h, depth);
      if (m) cur = m.t;
    });
  }
  step(type, gid, vals, inTex, out, time, geo, w, h, depth) {
    const gl = this.gl, d = ML.FXDEF[type], pr = this.prog(type, gid); if (!pr) return;
    const seq = d.passes || [null], bufs = d.bufs && d.bufs.length ? this.bufsFor(type, d, w, h) : null;
    seq.forEach((pe, k) => {
      const toOut = !pe || !pe.target || k === seq.length - 1, B = !toOut && bufs ? bufs[pe.target] : null;
      if (pe && pe.effect && !toOut) { /* pass memanggil efek lain (mis. Gaussian Blur) */
        const sk = ML.XML_ID && ML.XML_ID[pe.effect], sd = sk && ML.FXDEF[sk];
        if (sd && B && depth < 3) {
          const sv = {}; sd.params.forEach(q => { sv[q.k] = q.k in vals ? vals[q.k] : q.def; });
          this.exec(sk, sv, pe.src && bufs[pe.src] ? bufs[pe.src].t : inTex, { f: B.f, w: B.w, h: B.h, flip: -1 }, time, geo, w, h, depth + 1);
        } else if (B) { gl.bindFramebuffer(gl.FRAMEBUFFER, B.f); gl.viewport(0, 0, B.w, B.h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buf); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        return;
      }
      const vw = B ? B.w : out.w, vh = B ? B.h : out.h;
      gl.bindFramebuffer(gl.FRAMEBUFFER, B ? B.f : out.f); gl.viewport(0, 0, vw, vh);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(pr.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, inTex); gl.uniform1i(pr.loc.u_tex, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.bg); gl.uniform1i(pr.loc.u_bg, 1);
      let u = 2;
      (d.bufs || []).forEach(b => {
        const o = bufs[b.id], l = pr.loc['u_b_' + b.id];
        gl.activeTexture(gl.TEXTURE0 + u); gl.bindTexture(gl.TEXTURE_2D, o === B ? this.blank : o.t); /* tujuan render tidak boleh sekaligus dibaca */
        if (l) gl.uniform1i(l, u); const ls = pr.loc['u_bs_' + b.id]; if (ls) gl.uniform2f(ls, o.w, o.h); u++;
      });
      (d.imgs || []).forEach(b => {
        const l = pr.loc['u_i_' + b.id], t = this.imgTex(b.src); gl.activeTexture(gl.TEXTURE0 + u); gl.bindTexture(gl.TEXTURE_2D, t.t);
        if (l) gl.uniform1i(l, u); const ls = pr.loc['u_is_' + b.id]; if (ls) gl.uniform2f(ls, t.w, t.h); u++;
      });
      gl.uniform1f(pr.loc.u_pass, k); gl.uniform1f(pr.loc.u_ls, geo && geo.lsOn && !depth ? 1 : 0);
      gl.uniform2f(pr.loc.u_res, w, h); gl.uniform1f(pr.loc.u_time, time); gl.uniform1f(pr.loc.u_flip, B ? -1 : out.flip);
      const G = geo || { A: [1, 0, 0, 1], T: [w / 2, h / 2], Z: [w, h] };
      gl.uniform4f(pr.loc.u_A, G.A[0], G.A[1], G.A[2], G.A[3]); gl.uniform2f(pr.loc.u_T, G.T[0], G.T[1]); gl.uniform2f(pr.loc.u_Lz, G.Z[0], G.Z[1]);
      if (pr.loc.u_orient) gl.uniformMatrix4fv(pr.loc.u_orient, false, G.O || IDENT4);
      if (pr.loc.u_V) { const V = G.V || [0, 0, 0, 0]; gl.uniform4f(pr.loc.u_V, V[0], V[1], V[2], V[3]); }
      for (const kk in vals) { const l = pr.loc['u_' + kk]; if (l) gl.uniform1f(l, vals[kk]); }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    });
  }
  /** passes: [{type, vals:{k:number}, groups?}]; hasil digambar ke this.cv (ukuran sama dengan src) */
  run(srcCanvas, bgCanvas, passes, time, geo) {
    const gl = this.gl, w = Math.max(1, srcCanvas.width), h = Math.max(1, srcCanvas.height);
    passes = passes.filter(p => ML.FXDEF[p.type] && (ML.FXDEF[p.type].frag || ML.FXDEF[p.type].groups) && this.prog(p.type, ML.FXDEF[p.type].defGroup));
    this.resize(w, h);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.src);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, srcCanvas);
    if (passes.some(p => ML.FXDEF[p.type].needsBg) && bgCanvas) {
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.bg);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bgCanvas);
    }
    gl.viewport(0, 0, w, h); gl.disable(gl.BLEND);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    let cur = this.src, lsGeo = null;
    { /* sumber ruang-layer (Tiles): dipakai bila efek pertama memintanya dan renderer menyediakan kanvasnya */
      const d0 = passes[0] && ML.FXDEF[passes[0].type];
      if (d0 && d0.layerSpace && geo && geo.ls && geo.ls.width > 1) {
        if (!this.lsTex) this.lsTex = this.tex();
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.lsTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, geo.ls);
        cur = this.lsTex; lsGeo = Object.assign({}, geo, { T: geo.lsT || geo.T, lsOn: true });
      }
    }
    if (!passes.length) { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); return this.cv; }
    passes.forEach((ps, i) => {
      const last = i === passes.length - 1, tgt = last ? null : this.fb[i % 2];
      this.exec(ps.type, ps.vals, cur, tgt ? { f: tgt.f, w, h, flip: -1 } : { f: null, w, h, flip: 1 }, time, (i === 0 && lsGeo) || geo, w, h, 0, ps.groups);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      if (tgt) cur = tgt.t;
    });
    return this.cv;
  }
};
})();

