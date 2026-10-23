'use strict';
(function () {
const NUM = (k, l, min, max, def, step = 1, unit = '') => ({ k, l, min, max, def, step, unit });
const SEL = (k, l, opts, def = 0) => ({ k, l, type: 'sel', opts, def });
const OO = ['Mati', 'Hidup'];
Object.assign(ML.FXDEF, {
  tiles2: { name: 'Ubin V2 (Keramik)', icon: 'grid',
    params: [NUM('count', 'Jumlah ubin', 1, 12, 3, 0.01), NUM('cl', 'Potong kiri', 0, 45, 0, 0.1, '%'), NUM('cr', 'Potong kanan', 0, 45, 0, 0.1, '%'), NUM('ct', 'Potong atas', 0, 45, 0, 0.1, '%'), NUM('cb', 'Potong bawah', 0, 45, 0, 0.1, '%'), NUM('ox', 'Offset X', -100, 100, 0, 0.1, '%'), NUM('oy', 'Offset Y', -100, 100, 0, 0.1, '%'), NUM('brick', 'Geser baris', 0, 100, 0, 0.1, '%'), NUM('gap', 'Celah nat', 0, 20, 0, 0.1, '%'), SEL('mirror', 'Miror', OO)],
    frag: `void main(){
      vec2 c0=vec2(u_cl,u_ct)*.01, c1=1.-vec2(u_cr,u_cb)*.01;
      vec2 p=(vUV-.5)*u_count+.5+vec2(u_ox,u_oy)*.01*u_count;
      p.x+=u_brick*.01*mod(floor(p.y),2.);
      vec2 id=floor(p), f=fract(p);
      if(u_mirror>.5){ if(mod(id.x,2.)>.5) f.x=1.-f.x; if(mod(id.y,2.)>.5) f.y=1.-f.y; }
      vec2 g=vec2(u_gap*.01);
      if(f.x<g.x||f.x>1.-g.x||f.y<g.y||f.y>1.-g.y){ gl_FragColor=vec4(0.); return; }
      f=(f-g)/(1.-2.*g);
      gl_FragColor=texture2D(u_tex,mix(c0,c1,f));}` },
  mirror2: { name: 'Cermin V2 (Mirror)', icon: 'layers',
    params: [SEL('h', 'Horizontal', OO, 1), SEL('v', 'Vertikal', OO), SEL('blend', 'Mode blending', ['Normal', 'Tambah', 'Kali', 'Layar']), NUM('alpha', 'Alpha cermin', 0, 100, 100, 1, '%'), NUM('ox', 'Offset X', -100, 100, 0, 0.1, '%'), NUM('oy', 'Offset Y', -100, 100, 0, 0.1, '%')],
    frag: `void main(){
      vec4 a=texture2D(u_tex,vUV); vec2 m=vUV;
      if(u_h>.5) m.x=1.-m.x; if(u_v>.5) m.y=1.-m.y;
      m-=vec2(u_ox,u_oy)*.01;
      vec4 b=S(m)*(u_alpha*.01);
      vec4 r;
      if(u_blend<.5) r=b+a*(1.-b.a);
      else if(u_blend<1.5) r=min(a+b,1.);
      else if(u_blend<2.5) r=a*(1.-b.a)+a*b+b*(1.-a.a)*.0;
      else r=a+b-a*b;
      gl_FragColor=r;}` },
  expgamma: { name: 'Paparan/Gamma (Exposure)', icon: 'adjust',
    params: [NUM('exp', 'Exposure (EV)', -5, 5, 0, 0.01), NUM('gamma', 'Gamma', 0.2, 3, 1, 0.01), NUM('off', 'Offset', -50, 50, 0, 0.1, '%')],
    frag: `void main(){
      vec4 c=texture2D(u_tex,vUV); vec3 r=c.a>0.?c.rgb/c.a:vec3(0.);
      r=max(r*pow(2.,u_exp)+u_off*.01,0.); r=pow(r,vec3(1./max(u_gamma,.01)));
      gl_FragColor=vec4(min(r,1.)*c.a,c.a);}` },
  squeeze: { name: 'Remas (Squeeze)', icon: 'fx',
    params: [NUM('amt', 'Kekuatan', -100, 100, 50, 1, '%'), NUM('rad', 'Radius', 5, 100, 40, 0.1, '%'), NUM('cx', 'Titik X', 0, 100, 50, 0.1, '%'), NUM('cy', 'Titik Y', 0, 100, 50, 0.1, '%')],
    frag: `void main(){
      vec2 c=vec2(u_cx,u_cy)*.01, asp=vec2(u_res.x/u_res.y,1.);
      vec2 d=(vUV-c)*asp; float R=max(u_rad*.01,.001), r=length(d)/R;
      if(r>0.&&r<1.){ d=normalize(d)*R*pow(r,1.-u_amt*.009); }
      gl_FragColor=S(c+d/asp);}` },
  chroma: { name: 'Chroma Key', icon: 'adjust',
    params: [NUM('hue', 'Warna kunci (hue)', 0, 360, 120, 1, '°'), NUM('tol', 'Toleransi', 0, 100, 30, 0.1, '%'), NUM('soft', 'Kehalusan tepi', 0, 50, 10, 0.1, '%'), NUM('spill', 'Hapus tumpahan', 0, 100, 60, 1, '%'), NUM('choke', 'Rapatkan tepi', 0, 50, 0, 0.1, '%')],
    frag: `vec2 cc(vec3 c){ return vec2(dot(c,vec3(-.169,-.331,.5)),dot(c,vec3(.5,-.419,-.081))); }
    void main(){
      vec4 c=texture2D(u_tex,vUV); vec3 rgb=c.a>0.?c.rgb/c.a:vec3(0.);
      vec3 kc=clamp(abs(mod(u_hue/60.+vec3(0.,4.,2.),6.)-3.)-1.,0.,1.);
      float d=distance(cc(rgb),cc(kc)); float t=u_tol*.005, so=max(u_soft*.005,.0005);
      float a=smoothstep(t,t+so,d); a=smoothstep(u_choke*.01,1.,a);
      float l=dot(rgb,vec3(.299,.587,.114));
      rgb=mix(rgb,vec3(l),u_spill*.01*(1.-smoothstep(t+so,t+so*4.+.05,d)));
      gl_FragColor=vec4(rgb*a*c.a,a*c.a);}` },
  randdisp: { name: 'Pemindahan Acak (Random Displace)', icon: 'curve',
    params: [NUM('amt', 'Jarak', 0, 30, 3, 0.1, '%'), NUM('blocks', 'Jumlah blok', 1, 100, 12, 1), NUM('speed', 'Kecepatan (Hz)', 0, 30, 8, 0.1), NUM('seed', 'Seed', 0, 999, 1, 1)],
    frag: `float hh(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
    void main(){
      vec2 g=floor(vUV*u_blocks); float t=floor(u_time*u_speed);
      vec2 r=vec2(hh(g+t*7.1+u_seed),hh(g.yx+t*3.3+u_seed))-.5;
      gl_FragColor=S(vUV+r*u_amt*.02);}` },
  cchd: { name: 'CC HD (Salin Latar + HD)', icon: 'copy', needsBg: true,
    params: [NUM('amt', 'Jumlah', 0, 100, 100, 1, '%'), NUM('sharp', 'Ketajaman', 0, 300, 80, 1, '%'), NUM('contrast', 'Kontras', -50, 100, 10, 1, '%'), NUM('sat', 'Saturasi', -100, 100, 10, 1, '%')],
    frag: `void main(){
      vec2 px=1./u_res; vec4 b=texture2D(u_bg,vUV);
      vec4 bl=(texture2D(u_bg,vUV+vec2(px.x,0.))+texture2D(u_bg,vUV-vec2(px.x,0.))+texture2D(u_bg,vUV+vec2(0.,px.y))+texture2D(u_bg,vUV-vec2(0.,px.y)))*.25;
      vec3 r=b.rgb+(b.rgb-bl.rgb)*u_sharp*.01*2.;
      r=(r-.5)*(1.+u_contrast*.01)+.5;
      float l=dot(r,vec3(.299,.587,.114)); r=mix(vec3(l),r,1.+u_sat*.01);
      vec4 o=vec4(clamp(r,0.,1.),b.a); float s=texture2D(u_tex,vUV).a;
      gl_FragColor=o*(s*u_amt*.01);}` }
});
['tiles2', 'mirror2', 'expgamma', 'squeeze', 'chroma', 'randdisp', 'cchd'].forEach(t => ML.FX_ORDER.push(t));

ML.FXDEF.tiles3 = { name: 'Ubin V3 (Seperti Alight)', icon: 'grid', thumb: { crop: 0.5 },
  params: [NUM('crop', 'Potong', 0.05, 2, 1, 0.001), NUM('off', 'Offset', -1, 1, 0, 0.001), SEL('mirror', 'Mirror', OO), NUM('gx', 'Geser X', -100, 100, 0, 0.1, '%'), NUM('gy', 'Geser Y', -100, 100, 0, 0.1, '%')],
  frag: `void main(){
    vec2 px=vUV*u_res, d=px-u_T;
    float det=u_A.x*u_A.w-u_A.z*u_A.y;
    if(abs(det)<1e-9){ gl_FragColor=vec4(0.); return; }
    vec2 l=vec2(u_A.w*d.x-u_A.z*d.y, -u_A.y*d.x+u_A.x*d.y)/det;
    vec2 sz=max(u_Lz*u_crop,vec2(1.));
    vec2 p=l/sz+.5-vec2(u_gx,u_gy)*.01;
    p.x-=u_off*mod(floor(p.y),2.);
    vec2 id=floor(p), f=fract(p);
    if(u_mirror>.5){ if(mod(id.x,2.)>.5) f.x=1.-f.x; if(mod(id.y,2.)>.5) f.y=1.-f.y; }
    vec2 s=(f-.5)*sz, hz=u_Lz*.5;
    if(abs(s.x)>hz.x||abs(s.y)>hz.y){ gl_FragColor=vec4(0.); return; }
    vec2 kk=min(vec2(1.5/max(length(u_A.xy),1e-6)),hz*.9);
    s=clamp(s,-hz+kk,hz-kk);
    vec2 q=vec2(u_A.x*s.x+u_A.z*s.y, u_A.y*s.x+u_A.w*s.y)+u_T;
    gl_FragColor=texture2D(u_tex,q/u_res);}` };
ML.FX_ORDER.splice(ML.FX_ORDER.indexOf('tiles2') + 1, 0, 'tiles3');

/* ---------- Panduan lengkap ---------- */
/* FPS real-time (on/off) + Test Performa */
ML.fpsMeter = (() => {
  let el = null, raf = 0, on = false, frames = 0, last = 0, worst = 0, lt = 0;
  const loop = t => {
    if (!on) return; raf = requestAnimationFrame(loop);
    if (lt) worst = Math.max(worst, t - lt); lt = t; frames++;
    if (t - last >= 500) {
      const fps = frames * 1000 / (t - last); frames = 0; last = t;
      el.textContent = Math.round(fps) + ' FPS · ' + (1000 / Math.max(fps, 1)).toFixed(1) + ' ms'; el.style.color = fps >= 50 ? '#ff3fb0' : fps >= 30 ? '#ffd24a' : '#ff6b6b'; worst = 0;
    }
  };
  function set(v) {
    on = !!v; ML.lsSet('ml.fpsmeter', on ? '1' : '0');
    if (on && !el) { el = document.createElement('div'); el.style.cssText = 'position:fixed;top:calc(env(safe-area-inset-top,0px) + 6px);right:8px;z-index:99999;padding:4px 9px;border-radius:10px;background:rgba(10,12,24,.78);font:700 12px/1.2 monospace;pointer-events:none;color:#ff3fb0'; document.body.appendChild(el); }
    if (on) { el.hidden = false; frames = 0; last = 0; lt = 0; cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); } else { cancelAnimationFrame(raf); if (el) el.hidden = true; }
  }
  return { set, get: () => on, init: () => { if (ML.lsGet('ml.fpsmeter') === '1') set(true); } };
})();

ML.perfTest = function () {
  const h = ML.h, W = 1280, H = 720, sleep = () => new Promise(r => setTimeout(r, 0));
  async function timed(ms, fn) { const t0 = performance.now(); let n = 0; while (performance.now() - t0 < ms) { for (let i = 0; i < 3; i++) { fn(); n++; } await sleep(); } return n * 1000 / (performance.now() - t0); }
  async function cpu() { return timed(1500, () => { let a = 0; for (let i = 1; i < 120000; i++) a += Math.sqrt(i) * Math.sin(i) / (1 + (i & 7)); return a; }); }
  async function c2d() {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: false });
    const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#f0a'); gr.addColorStop(1, '#0af');
    return timed(2000, () => { g.fillStyle = gr; g.fillRect(0, 0, W, H); g.save(); g.filter = 'blur(6px)'; for (let i = 0; i < 40; i++) { g.save(); g.translate((i * 97) % W, (i * 53) % H); g.rotate(i); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(-60, -40, 120, 80); g.restore(); } g.restore(); g.getImageData(0, 0, 1, 1); });
  }
  let gpuName = '';
  async function gl() {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('webgl'); if (!g) return 0;
    try { const e = g.getExtension('WEBGL_debug_renderer_info'); gpuName = e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER); } catch (x) { /* abaikan */ }
    const mk = (t, s) => { const o = g.createShader(t); g.shaderSource(o, s); g.compileShader(o); return o; };
    const p = g.createProgram(); g.attachShader(p, mk(g.VERTEX_SHADER, 'attribute vec2 a;varying vec2 v;void main(){v=a*.5+.5;gl_Position=vec4(a,0.,1.);}'));
    g.attachShader(p, mk(g.FRAGMENT_SHADER, 'precision mediump float;varying vec2 v;uniform float t;void main(){vec2 p=v*3.;float s=0.;for(int i=0;i<24;i++){p=vec2(sin(p.y*1.7+t)+p.x*.3,cos(p.x*1.3-t)+p.y*.3);s+=length(p)*.04;}gl_FragColor=vec4(vec3(sin(s),cos(s*1.3),s*.5),1.);}'));
    g.linkProgram(p); g.useProgram(p); const b = g.createBuffer(); g.bindBuffer(g.ARRAY_BUFFER, b); g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), g.STATIC_DRAW);
    const a = g.getAttribLocation(p, 'a'); g.enableVertexAttribArray(a); g.vertexAttribPointer(a, 2, g.FLOAT, false, 0, 0); g.viewport(0, 0, W, H);
    const tl = g.getUniformLocation(p, 't'), px = new Uint8Array(4); let k = 0;
    return timed(2500, () => { g.uniform1f(tl, k++ * .05); g.drawArrays(g.TRIANGLE_STRIP, 0, 4); g.readPixels(0, 0, 1, 1, g.RGBA, g.UNSIGNED_BYTE, px); });
  }
  const hz = () => new Promise(res => { const ts = []; const f = t => { ts.push(t); if (ts.length < 30) requestAnimationFrame(f); else { const d = ts.slice(1).map((v, i) => v - ts[i]).sort((a, b) => a - b), m = d[d.length >> 1]; res(m > 0 ? Math.round(1000 / m / 5) * 5 : 0); } }; requestAnimationFrame(f); });
  async function specs() {
    const ua = navigator.userAgent, S = [];
    const am = ua.match(/Android\s([\d.]+);\s*([^;)]+?)(?:\sBuild|[;)])/), cr = ua.match(/(Chrome|Firefox|Edg)\/([\d.]+)/);
    if (am) { S.push(['Perangkat', am[2].trim()]); S.push(['Android', am[1]]); } else { const pl = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '-'; S.push(['Platform', pl]); }
    if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) { try { const v = await navigator.userAgentData.getHighEntropyValues(['model', 'platformVersion']); if (v.model) S[0] = ['Perangkat', v.model]; } catch (e) { /* abaikan */ } }
    S.push(['CPU', (navigator.hardwareConcurrency || '?') + ' core']);
    S.push(['RAM', navigator.deviceMemory ? '≥ ' + navigator.deviceMemory + ' GB (perkiraan, maks. dilaporkan 8)' : 'tidak dilaporkan browser']);
    S.push(['GPU', gpuName || 'tidak diketahui']);
    S.push(['Layar', Math.round(screen.width * devicePixelRatio) + ' × ' + Math.round(screen.height * devicePixelRatio) + ' px (DPR ' + (+devicePixelRatio.toFixed(2)) + ')']);
    const r = await hz(); S.push(['Refresh rate', r ? '≈ ' + r + ' Hz' : '-']);
    if (cr) S.push(['Browser/WebView', cr[1] + ' ' + cr[2].split('.')[0]]);
    S.push(['Ekspor cepat (WebCodecs)', typeof VideoEncoder !== 'undefined' ? 'Didukung' : 'Tidak (pakai mode realtime)']);
    try { if (navigator.getBattery) { const b = await navigator.getBattery(); S.push(['Baterai', Math.round(b.level * 100) + '%' + (b.charging ? ' (mengisi)' : '')]); } } catch (e) { /* abaikan */ }
    try { if (navigator.connection && navigator.connection.effectiveType) S.push(['Jaringan', navigator.connection.effectiveType]); } catch (e) { /* abaikan */ }
    return S;
  }
  ML.sheet('Test Performa', (body, close) => {
    const info = h('div', { class: 'info', text: 'Mengukur CPU, kanvas 2D dan GPU (WebGL). Butuh sekitar 7 detik. Jangan buka aplikasi lain selama tes.' });
    const bar = h('div', { style: 'height:8px;border-radius:6px;background:#2a2e48;overflow:hidden;margin:10px 0' }, h('div', { style: 'height:100%;width:0;background:#ff3fb0;transition:width .3s' }));
    const out = h('div'), go = h('button', { class: 'btn primary wide', text: 'Mulai tes', onclick: run });
    const last = ML.lsGet('ml.perfscore'); if (last) out.append(h('div', { class: 'info', text: 'Skor terakhir: ' + last }));
    body.append(info, bar, out, go);
    const step = n => { bar.firstChild.style.width = n + '%'; };
    async function run() {
      go.disabled = true; out.replaceChildren(); let r = {};
      try {
        info.textContent = '1/3 Tes CPU…'; step(8); r.cpu = await cpu(); step(33);
        info.textContent = '2/3 Tes kanvas 2D…'; r.c2d = await c2d(); step(60);
        info.textContent = '3/3 Tes GPU (efek)…'; r.gl = await gl(); step(100);
      } catch (e) { info.textContent = 'Tes gagal: ' + e.message; go.disabled = false; return; }
      const pc = Math.min(300, r.cpu / 60 * 300), p2 = Math.min(300, r.c2d / 60 * 300), pg = Math.min(400, r.gl / 60 * 400), tot = Math.round(pc + p2 + pg);
      const grade = tot >= 800 ? ['Sangat kuat', 'Lancar edit & ekspor 1080p–4K, 60 fps.'] : tot >= 550 ? ['Kuat', 'Nyaman untuk 1080p 30–60 fps dan efek berat sedang.'] : tot >= 300 ? ['Sedang', 'Cocok 720p, 30 fps. Kurangi efek berat saat edit.'] : ['Ringan', 'Pakai 480–720p, 24–30 fps dan efek seperlunya.'];
      ML.lsSet('ml.perfscore', tot + ' (' + grade[0] + ')'); info.textContent = 'Membaca spesifikasi…'; let sp = []; try { sp = await specs(); } catch (e) { /* abaikan */ } info.textContent = 'Selesai';
      const row = (l, v) => h('div', { style: 'display:flex;justify-content:space-between;gap:14px;text-align:right;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.08)' }, h('span', { text: l }), h('b', { text: v }));
      out.append(h('div', { style: 'text-align:center;margin:8px 0' }, h('div', { style: 'font-size:46px;font-weight:800;color:#ff3fb0;line-height:1', text: tot }), h('div', { style: 'opacity:.7;font-size:12px', text: 'dari 1000' }), h('div', { style: 'font-size:18px;font-weight:700;margin-top:6px', text: grade[0] }), h('div', { style: 'opacity:.8;font-size:13px;margin-top:2px', text: grade[1] })),
        row('CPU', Math.round(pc) + ' / 300'), row('Kanvas 2D (' + r.c2d.toFixed(0) + ' fps)', Math.round(p2) + ' / 300'), row('GPU / efek (' + (r.gl ? r.gl.toFixed(0) + ' fps' : 'WebGL tidak ada') + ')', Math.round(pg) + ' / 400'),
        h('div', { style: 'font-weight:700;margin:14px 0 2px', text: 'Spesifikasi HP' }), ...sp.map(([l, v]) => row(l, v)),
        h('div', { class: 'info', style: 'margin-top:8px', text: 'Spesifikasi dibaca dari browser/WebView. Nama chipset tidak diberikan Android, jadi dilihat dari GPU, jumlah core, dan model. RAM dibulatkan oleh browser.' }),
        h('div', { class: 'info', style: 'margin-top:8px', text: 'Skor perkiraan relatif, dipengaruhi suhu dan baterai HP. Ulangi bila perlu.' }));
      go.disabled = false; go.textContent = 'Tes ulang';
    }
  });
};

/* Rekam audio + pengubah suara: preset (Onee-san, Cewek, Remaja, Loli) atau manual + peredam noise */
ML.voice = (() => {
  const AC = () => window.AudioContext || window.webkitAudioContext;
  const yieldUI = () => new Promise(r => setTimeout(r, 0));
  async function decode(blob) { const c = new (AC())(); try { return await c.decodeAudioData(await blob.arrayBuffer()); } finally { try { c.close(); } catch (e) { /* abaikan */ } } }
  function mono(buf, from, to) {
    const sr = buf.sampleRate, a = Math.max(0, Math.floor(from * sr)), b = Math.min(buf.length, Math.ceil(to * sr)), n = Math.max(0, b - a), out = new Float32Array(n);
    for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) out[i] += d[a + i] / buf.numberOfChannels; }
    return out;
  }
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  /* ---------- FFT radix-2 ---------- */
  function makeFFT(N) {
    const lg = Math.round(Math.log2(N)), rev = new Uint32Array(N), cs = new Float64Array(N / 2), sn = new Float64Array(N / 2);
    for (let i = 0; i < N; i++) { let r = 0; for (let b = 0; b < lg; b++) if ((i >> b) & 1) r |= 1 << (lg - 1 - b); rev[i] = r; }
    for (let i = 0; i < N / 2; i++) { cs[i] = Math.cos(2 * Math.PI * i / N); sn[i] = -Math.sin(2 * Math.PI * i / N); }
    return (re, im, inv) => {
      for (let i = 0; i < N; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
      for (let len = 2; len <= N; len <<= 1) {
        const half = len >> 1, step = N / len;
        for (let i = 0; i < N; i += len) for (let k = 0; k < half; k++) {
          const wr = cs[k * step], wi = inv ? -sn[k * step] : sn[k * step], a = i + k, b = a + half;
          const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        }
      }
      if (inv) for (let i = 0; i < N; i++) { re[i] /= N; im[i] /= N; }
    };
  }

  /* ---------- Peredam noise: profil noise adaptif (persentil per bin) + Wiener decision-directed ---------- */
  async function denoise(x, sr, onProg) {
    const n = x.length, N = 1 << clamp(Math.round(Math.log2(sr * 0.023)), 8, 11), H = N >> 2, K = (N >> 1) + 1;
    if (n < N * 3) return Float32Array.from(x);
    const fft = makeFFT(N), win = new Float64Array(N), re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) win[i] = Math.sqrt(0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
    const xp = new Float32Array(n + 2 * N); xp.set(x, N);
    const F = Math.floor((n + N) / H) + 1;
    const frame = f => { const o = f * H; for (let i = 0; i < N; i++) { re[i] = xp[o + i] * win[i]; im[i] = 0; } fft(re, im, false); };
    // pass 1: spektrum daya (dihaluskan 3 bin) pada sebagian frame
    const stride = Math.max(1, Math.ceil(F * K / 5e6)), idxs = [];
    for (let f = 0; f < F; f += stride) idxs.push(f);
    const S = new Float32Array(idxs.length * K), pw = new Float64Array(K);
    for (let m = 0; m < idxs.length; m++) {
      frame(idxs[m]); for (let k = 0; k < K; k++) pw[k] = re[k] * re[k] + im[k] * im[k];
      for (let k = 0; k < K; k++) S[m * K + k] = (pw[Math.max(0, k - 1)] + pw[k] + pw[Math.min(K - 1, k + 1)]) / 3;
      if ((m & 127) === 127) { if (onProg) onProg(0.25 * m / idxs.length); await yieldUI(); }
    }
    const Bf = Math.max(24, Math.round(2.5 * sr / H)), Bh = Math.max(12, Bf >> 1), nb = Math.max(2, Math.ceil(F / Bh) + 1), noise = [];
    const tmp = new Float32Array(idxs.length);
    for (let b = 0; b < nb; b++) {
      const c = b * Bh, ms = []; for (let m = 0; m < idxs.length; m++) if (Math.abs(idxs[m] - c) <= Bf / 2) ms.push(m);
      if (ms.length < 12) { ms.length = 0; for (let m = 0; m < idxs.length; m++) ms.push(m); }
      const nz = new Float64Array(K), q = Math.floor(0.25 * (ms.length - 1));
      for (let k = 0; k < K; k++) { for (let j = 0; j < ms.length; j++) tmp[j] = S[ms[j] * K + k]; nz[k] = Math.max(1e-12, 1.9 * tmp.subarray(0, ms.length).sort()[q]); }
      noise.push(nz); if (onProg) onProg(0.25 + 0.1 * b / nb); await yieldUI();
    }
    // pass 2: filter semua frame
    const out = new Float32Array(n + 2 * N), wsum = new Float32Array(n + 2 * N), Gp = new Float64Array(K).fill(1), Pp = new Float64Array(K), G = new Float64Array(K), Gmin = 0.07, aDD = 0.96;
    for (let f = 0; f < F; f++) {
      frame(f);
      const bp = f / Bh, b0 = Math.min(nb - 2, Math.floor(bp)), t = clamp(bp - b0, 0, 1), n0 = noise[b0], n1 = noise[b0 + 1];
      for (let k = 0; k < K; k++) {
        const P = re[k] * re[k] + im[k] * im[k], lam = n0[k] * (1 - t) + n1[k] * t, xi = aDD * (Gp[k] * Gp[k] * Pp[k] / lam) + (1 - aDD) * Math.max(P / lam - 1, 0);
        G[k] = Math.max(Gmin, xi / (1 + xi)); Pp[k] = P;
      }
      for (let k = 0; k < K; k++) { const g = (G[Math.max(0, k - 1)] + 2 * G[k] + G[Math.min(K - 1, k + 1)]) / 4, gs = g >= Gp[k] ? g : 0.5 * Gp[k] + 0.5 * g; G[k] = gs; }
      for (let k = 0; k < K; k++) { Gp[k] = G[k]; re[k] *= G[k]; im[k] *= G[k]; if (k > 0 && k < K - 1) { re[N - k] = re[k]; im[N - k] = -im[k]; } }
      fft(re, im, true);
      const o = f * H; for (let i = 0; i < N; i++) { out[o + i] += re[i] * win[i]; wsum[o + i] += win[i] * win[i]; }
      if ((f & 63) === 63) { if (onProg) onProg(0.35 + 0.65 * f / F); await yieldUI(); }
    }
    const y = new Float32Array(n); for (let i = 0; i < n; i++) { const w = wsum[N + i]; y[i] = w > 1e-3 ? out[N + i] / w : 0; }
    return y;
  }

  /* ---------- Resample (Catmull-Rom): y(i) = x(i*f); nada dan formant naik f kali, durasi / f ---------- */
  function resampleBy(x, f) {
    const n = x.length, m = Math.floor((n - 1) / f), y = new Float32Array(m), g = k => x[k < 0 ? 0 : k >= n ? n - 1 : k];
    for (let i = 0; i < m; i++) {
      const p = i * f, j = p | 0, t = p - j, a = g(j - 1), b = x[j], c = g(j + 1), d = g(j + 2);
      y[i] = b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));
    }
    return y;
  }

  /* ---------- Pelacak nada (YIN pada sinyal yang diturunkan sample rate-nya) ---------- */
  function trackPitch(x, sr) {
    const dec = Math.max(1, Math.round(sr / 8800)), r = sr / dec, n = Math.floor(x.length / dec), d = new Float32Array(n);
    for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < dec; j++) s += x[i * dec + j]; d[i] = s / dec; }
    const hop = Math.max(1, Math.round(r * 0.01)), tmin = Math.max(2, Math.floor(r / 500)), tmax = Math.ceil(r / 65), W = Math.ceil(tmax * 1.5), Fr = Math.floor(n / hop) + 1;
    const f0 = new Float32Array(Fr), rms = new Float32Array(Fr), dn = new Float64Array(tmax + 2);
    for (let f = 0; f < Fr; f++) {
      const s = f * hop - (W >> 1); if (s < 0 || s + W + tmax + 1 >= n) continue;
      let e = 0; for (let j = 0; j < W; j++) e += d[s + j] * d[s + j]; rms[f] = Math.sqrt(e / W);
      let run = 0; dn[0] = 1;
      for (let t = 1; t <= tmax + 1; t++) { let sum = 0; for (let j = 0; j < W; j++) { const df = d[s + j] - d[s + j + t]; sum += df * df; } run += sum; dn[t] = run > 0 ? sum * t / run : 1; }
      let best = -1; for (let t = tmin; t <= tmax; t++) { if (dn[t] < 0.15) { while (t + 1 <= tmax && dn[t + 1] < dn[t]) t++; best = t; break; } }
      if (best < 0) { let mv = 1e9; for (let t = tmin; t <= tmax; t++) if (dn[t] < mv) { mv = dn[t]; best = t; } if (mv > 0.3) continue; }
      let tt = best; if (best > 1 && best < tmax) { const a = dn[best - 1], b = dn[best], c = dn[best + 1], den = a - 2 * b + c; if (den > 1e-9) tt = best + 0.5 * (a - c) / den; }
      f0[f] = r / tt;
    }
    const sorted = Array.from(rms).filter(v => v > 0).sort((a, b) => a - b), thr = sorted.length ? 0.04 * sorted[Math.floor(sorted.length * 0.9)] : 0;
    for (let f = 0; f < Fr; f++) if (rms[f] < thr) f0[f] = 0;
    // buang lonjakan oktaf: bandingkan dengan median tetangga bersuara
    const sm = new Float32Array(f0);
    for (let f = 0; f < Fr; f++) {
      if (!f0[f]) continue; const nb = []; for (let k = Math.max(0, f - 4); k <= Math.min(Fr - 1, f + 4); k++) if (f0[k]) nb.push(f0[k]);
      if (nb.length < 3) { sm[f] = 0; continue; } nb.sort((a, b) => a - b); const md = nb[nb.length >> 1];
      if (Math.abs(Math.log2(f0[f] / md)) > 0.3) sm[f] = md;
    }
    f0.set(sm);
    // hapus bersuara terlalu pendek (<3 frame), tutup celah (<=2 frame)
    for (let f = 0; f < Fr;) { if (!f0[f]) { f++; continue; } let e = f; while (e < Fr && f0[e]) e++; if (e - f < 3) for (let k = f; k < e; k++) f0[k] = 0; f = e; }
    for (let f = 1; f < Fr;) { if (f0[f] || !f0[f - 1]) { f++; continue; } let e = f; while (e < Fr && !f0[e]) e++; if (e < Fr && e - f <= 2) { for (let k = f; k < e; k++) f0[k] = f0[f - 1] + (f0[e] - f0[f - 1]) * (k - f + 1) / (e - f + 1); } f = e; }
    return { f0, hop: hop * dec, n: Fr };
  }

  /* ---------- Penanda periode nada (pitch marks) ---------- */
  function pitchMarks(x, sr, tr) {
    const n = x.length, { f0, hop, n: Fr } = tr, pos = [], per = [], vc = [], U = Math.round(sr * 0.01);
    const Tat = p => { const fp = clamp(p / hop, 0, Fr - 1), a = Math.floor(fp), b = Math.min(Fr - 1, a + 1); let fa = f0[a], fb = f0[b]; if (!fa) fa = fb; if (!fb) fb = fa; if (!fa) return 0; return sr / (fa + (fb - fa) * (fp - a)); };
    const ncc = (m, T, cand, L, step) => { let c = 0, e = 1e-9; for (let i = -L; i <= L; i += step) { const a = m + i, b = cand + i; if (a < 0 || b < 0 || a >= n || b >= n) continue; c += x[a] * x[b]; e += x[b] * x[b]; } return c / Math.sqrt(e); };
    const refine = (m, cand, T) => {
      const L = Math.max(2, Math.round(T / 2)), R = Math.max(1, Math.round(T / 4)), st = T > 160 ? 2 : 1; let bd = 0, bv = -1e30;
      for (let dlt = -R; dlt <= R; dlt += st) { const v = ncc(m, T, cand + dlt, L, st); if (v > bv) { bv = v; bd = dlt; } }
      if (st > 1) { const b0 = bd; for (let dlt = b0 - 1; dlt <= b0 + 1; dlt++) { const v = ncc(m, T, cand + dlt, L, 1); if (v > bv) { bv = v; bd = dlt; } } }
      return cand + bd;
    };
    const runs = []; for (let f = 0; f < Fr;) { if (!f0[f]) { f++; continue; } let e = f; while (e < Fr && f0[e]) e++; runs.push([f, e - 1]); f = e; }
    let cursor = 0; const unv = (a, b) => { for (let p = a; p < b; p += U) { pos.push(p); per.push(U); vc.push(0); } };
    for (const [fa, fb] of runs) {
      const s0 = Math.max(0, fa * hop - (hop >> 1)), s1 = Math.min(n - 1, fb * hop + (hop >> 1));
      let mx = 0, mn = 0; for (let i = s0; i <= s1; i++) { if (x[i] > mx) mx = x[i]; if (x[i] < mn) mn = x[i]; }
      const sg = mx >= -mn ? 1 : -1, q0 = s1 - s0 > 8 * sr / 200 ? s0 + ((s1 - s0) >> 2) : s0, q1 = s1 - s0 > 8 * sr / 200 ? s1 - ((s1 - s0) >> 2) : s1;
      let an = q0, bv = -1e30; for (let i = q0; i <= q1; i++) if (sg * x[i] > bv) { bv = sg * x[i]; an = i; }
      const fw = [an], bw = [];
      for (let m = an; ;) { const T = Tat(m); if (T < 4) break; const cand = m + Math.round(T); if (cand > s1) break; const nx = refine(m, cand, T); if (nx <= m) break; fw.push(nx); m = nx; }
      for (let m = an; ;) { const T = Tat(m); if (T < 4) break; const cand = m - Math.round(T); if (cand < s0) break; const nx = refine(m, cand, T); if (nx >= m) break; bw.push(nx); m = nx; }
      const mk = bw.reverse().concat(fw);
      if (mk[0] - cursor > U) unv(cursor + (pos.length ? U : 0), mk[0] - (U >> 1));
      for (let i = 0; i < mk.length; i++) {
        const l = i > 0 ? mk[i] - mk[i - 1] : 0, r = i < mk.length - 1 ? mk[i + 1] - mk[i] : 0; let T = l && r ? (l + r) / 2 : (l || r || Tat(mk[i]));
        pos.push(mk[i]); per.push(Math.max(4, T)); vc.push(1);
      }
      cursor = mk[mk.length - 1];
    }
    if (n - cursor > U) unv(cursor + (pos.length ? U : 0), n);
    return { pos, per, vc, n: pos.length };
  }

  /* ---------- Pengubah nada & formant: resample (formant) lalu TD-PSOLA (nada, tempo) ---------- */
  async function voiceShift(x, sr, p, onProg) {
    const n = x.length, semi = +p.semi || 0, fm = +p.formant || 0, speed = clamp(+p.speed || 1, 0.5, 2), range = clamp(+p.range || 1, 0.3, 2);
    const phi = Math.pow(2, fm / 12), x1 = Math.abs(fm) > 0.01 ? resampleBy(x, phi) : x;
    if (onProg) onProg(0.1); await yieldUI();
    const tr = trackPitch(x1, sr); if (onProg) onProg(0.4); await yieldUI();
    const vf = []; for (let f = 0; f < tr.n; f++) if (tr.f0[f]) vf.push(tr.f0[f]);
    const outLen = Math.floor(n / speed), n1 = x1.length;
    const alpha = n1 / outLen;
    let m1 = 0, Tg = 0;
    if (vf.length >= 15) {
      vf.sort((a, b) => a - b); m1 = vf[vf.length >> 1]; const med0 = m1 / phi;
      Tg = +p.f0 > 0 ? Math.max(+p.f0, med0) : med0 * Math.pow(2, semi / 12); Tg = clamp(Tg, med0 * 0.6, med0 * 2.6);
    }
    const M = pitchMarks(x1, sr, tr); if (onProg) onProg(0.7); await yieldUI();
    const pos = M.pos, per = M.per, vc = M.vc, cnt = M.n, out = new Float32Array(outLen + 16), nrm = new Float32Array(outLen + 16);
    const fixed = m1 ? 0 : Math.pow(2, (semi - fm) / 12);
    let ts = 0, idx = 0, it = 0;
    while (ts < outLen && cnt) {
      const ta = ts * alpha; while (idx + 1 < cnt && Math.abs(pos[idx + 1] - ta) <= Math.abs(pos[idx] - ta)) idx++;
      const c = pos[idx], T = per[idx], L = Math.max(2, Math.round(T)), cs = Math.round(ts);
      for (let i = -L; i <= L; i++) { const a = c + i, o = cs + i; if (a < 0 || a >= n1 || o < 0 || o >= outLen) continue; const w = 0.5 + 0.5 * Math.cos(Math.PI * i / L); out[o] += x1[a] * w; nrm[o] += w; }
      let step = T;
      if (vc[idx]) { const fi = sr / T, rho = m1 ? clamp((Tg / m1) * Math.pow(fi / m1, range - 1), 0.5, 2.5) : fixed; step = T / (rho || 1); }
      ts += Math.max(2, step);
      if ((++it & 4095) === 0) { if (onProg) onProg(0.7 + 0.3 * ts / outLen); await yieldUI(); }
    }
    const y = new Float32Array(outLen); for (let i = 0; i < outLen; i++) y[i] = nrm[i] > 1e-3 ? out[i] / nrm[i] : 0;
    return y;
  }

  /** biquad RBJ: 'hp' (highpass) atau 'hs' (high-shelf) */
  function biquad(x, type, fs, f0, db) {
    const w = 2 * Math.PI * f0 / fs, cw = Math.cos(w), sw = Math.sin(w); let b0, b1, b2, a0, a1, a2;
    if (type === 'hp') { const al = sw / (2 * 0.707); b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
    else { const A = Math.pow(10, db / 40), al = sw / 2 * Math.sqrt(2), s = 2 * Math.sqrt(A) * al; b0 = A * ((A + 1) + (A - 1) * cw + s); b1 = -2 * A * ((A - 1) + (A + 1) * cw); b2 = A * ((A + 1) + (A - 1) * cw - s); a0 = (A + 1) - (A - 1) * cw + s; a1 = 2 * ((A - 1) - (A + 1) * cw); a2 = (A + 1) - (A - 1) * cw - s; }
    b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0; let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) { const v = x[i], y = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = v; y2 = y1; y1 = y; x[i] = y; }
  }
  /** p = { nr, f0(Hz), semi, formant, range, speed, bright(dB), lowcut(Hz), breath(%) } */
  async function process(x, sr, p, onProg) {
    const nr = +p.nr > 0, vo = (+p.f0 > 0) || (+p.semi || 0) !== 0 || (+p.formant || 0) !== 0 || (+p.speed || 1) !== 1;
    const sub = (a, b) => q => { if (onProg) onProg(a + (b - a) * q); };
    let y = x;
    if (nr) y = await denoise(y, sr, sub(0, vo ? 0.35 : 0.95));
    if (vo) y = await voiceShift(y, sr, p, sub(nr ? 0.35 : 0, 0.95));
    if (y === x) y = Float32Array.from(x);
    if (p.lowcut > 0) biquad(y, 'hp', sr, p.lowcut);
    if (p.bright) biquad(y, 'hs', sr, 3500, +p.bright);
    if (p.breath > 0) {
      const nz = new Float32Array(y.length); for (let i = 0; i < nz.length; i++) nz[i] = Math.random() * 2 - 1; biquad(nz, 'hp', sr, 4500);
      const a = 1 - Math.exp(-1 / (sr * 0.02)), g = p.breath / 100 * 1.2; let e = 0;
      for (let i = 0; i < y.length; i++) { e += a * (Math.abs(y[i]) - e); y[i] += nz[i] * e * g; }
    }
    let pk = 0; for (let i = 0; i < y.length; i++) { const a = Math.abs(y[i]); if (a > pk) pk = a; }
    if (pk > 0.98 || (pk > 0 && pk < 0.3)) { const f = 0.9 / pk; for (let i = 0; i < y.length; i++) y[i] *= f; }
    if (onProg) onProg(1);
    return y;
  }
  function wav(x, sr) {
    const n = x.length, b = new ArrayBuffer(44 + n * 2), v = new DataView(b), w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x[i])) * 32767, true);
    return new Blob([b], { type: 'audio/wav' });
  }
  const Z = { f0: 0, semi: 0, formant: 0, range: 1, speed: 1, bright: 0, lowcut: 0, breath: 0 };
  const PRESETS = [
    { k: 'asli', l: 'Suara asli', d: 'Tanpa ubah suara (peredam noise tetap bisa dipakai).', p: Z },
    { k: 'oneesan', l: 'Onee-san', d: 'Kakak dewasa: nada sekitar 200 Hz, lembut, tempo santai.', p: Object.assign({}, Z, { f0: 200, formant: 2.5, range: 1.1, speed: 0.98, bright: 1.5, lowcut: 90, breath: 3 }) },
    { k: 'cewek', l: 'Cewek', d: 'Suara cewek natural, nada sekitar 225 Hz.', p: Object.assign({}, Z, { f0: 225, formant: 3, range: 1.1, bright: 2, lowcut: 100, breath: 2 }) },
    { k: 'remaja', l: 'Remaja cewek', d: 'Ceria dan segar, nada sekitar 250 Hz, agak cepat.', p: Object.assign({}, Z, { f0: 250, formant: 3.5, range: 1.2, speed: 1.03, bright: 2.5, lowcut: 120, breath: 2 }) },
    { k: 'loli', l: 'Loli cewek', d: 'Tinggi dan imut ala anak kecil, ekspresif dan cerah.', p: Object.assign({}, Z, { f0: 290, formant: 5, range: 1.25, speed: 1.05, bright: 3.5, lowcut: 150, breath: 3 }) }
  ];
  const DEFS = [['f0', 'Nada target (Hz, 0 = pakai semiton; hanya menaikkan)', 0, 420, 5], ['semi', 'Nada (semiton)', -12, 14, 1], ['formant', 'Karakter suara / formant (semiton)', -4, 8, 0.5], ['range', 'Ekspresi nada', 0.6, 1.6, 0.05], ['speed', 'Tempo (nada tetap)', 0.7, 1.4, 0.01], ['bright', 'Kecerahan (dB)', -6, 12, 0.5], ['lowcut', 'Potong bass (Hz)', 0, 300, 10], ['breath', 'Napas / lembut (%)', 0, 20, 1]];
  /** panel pilihan: preset atau manual + saklar peredam noise. onApply dipanggil saat preset dipilih / tombol Terapkan manual / saklar noise ditekan */
  function picker(onApply, startKey) {
    const h = ML.h; let key = startKey || 'oneesan', p = Object.assign({}, Z, PRESETS.find(q => q.k === key).p), nr = 1;
    const chips = h('div', { class: 'chips sm' }), desc = h('div', { class: 'info', style: 'margin:6px 0' }), man = h('div', { style: 'margin-top:6px' }), ins = {};
    const nb = h('button', { class: 'btn soft', style: 'width:auto;min-width:64px;margin:0;padding:0 14px', onclick: () => { nr = nr ? 0 : 1; nb.textContent = nr ? 'ON' : 'OFF'; onApply(); } }); nb.textContent = 'ON';
    const nrRow = h('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin:2px 0 10px;padding:10px 12px;background:#1b1e30;border-radius:12px' }, h('div', { html: '<b>Peredam noise</b><br><span style="opacity:.7;font-size:12px">Kurangi bising latar (kipas, desis, dengung)</span>' }), nb);
    DEFS.forEach(([f, lab, mn, mx, st]) => {
      const val = h('b', { text: '' }), inp = h('input', { type: 'range', min: mn, max: mx, step: st, style: 'width:100%' });
      const sh = () => { val.textContent = p[f]; }; inp.oninput = () => { p[f] = +inp.value; sh(); }; ins[f] = () => { inp.value = p[f]; sh(); };
      man.append(h('div', { style: 'display:flex;justify-content:space-between;font-size:13px;margin-top:8px;gap:8px' }, h('span', { text: lab }), val), inp);
    });
    man.append(h('button', { class: 'btn soft wide', style: 'margin-top:10px', text: 'Terapkan & dengarkan', onclick: () => onApply() }));
    function draw() {
      chips.replaceChildren(...PRESETS.map(q => h('button', { class: 'chip' + (key === q.k ? ' on' : ''), text: q.l, onclick: () => { key = q.k; p = Object.assign({}, Z, q.p); Object.values(ins).forEach(f => f()); draw(); onApply(); } })),
        h('button', { class: 'chip' + (key === 'manual' ? ' on' : ''), text: 'Manual', onclick: () => { key = 'manual'; draw(); } }));
      man.hidden = key !== 'manual'; const q = PRESETS.find(z => z.k === key); desc.textContent = q ? q.d : 'Atur sendiri lalu ketuk "Terapkan & dengarkan". Preset yang dipilih sebelumnya jadi titik awal.';
    }
    Object.values(ins).forEach(f => f()); draw();
    return { el: h('div', {}, nrRow, chips, desc, man), get: () => Object.assign({}, p, { nr }), key: () => key, label: () => { const q = PRESETS.find(z => z.k === key); return q ? q.l : 'Manual'; } };
  }
  return { decode, mono, denoise, process, wav, PRESETS, picker };
})();

ML.recorder = function (onDone) {
  const h = ML.h, V = ML.voice;
  let stream = null, mr = null, chunks = [], raf = 0, tmr = 0, t0 = 0, buf = null, cache = {}, urls = [], gen = 0, closed = false;
  const stopAll = () => { cancelAnimationFrame(raf); clearInterval(tmr); try { if (mr && mr.state !== 'inactive') mr.stop(); } catch (e) { /* abaikan */ } if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; };
  ML.sheet('Rekam Audio', (body, close) => {
    const info = h('div', { class: 'info', text: 'Ketuk tombol rekam lalu bicara. Rekaman ditaruh di timeline di posisi playhead.' });
    const meter = h('div', { style: 'height:10px;border-radius:6px;background:#2a2e48;overflow:hidden;margin:10px 0' }, h('div', { style: 'height:100%;width:0;background:#ff3fb0' }));
    const time = h('div', { style: 'text-align:center;font:700 22px monospace;margin:4px 0', text: '00:00' });
    const rec = h('button', { class: 'btn primary wide', text: '● Mulai rekam', onclick: toggle });
    const review = h('div');
    body.append(info, time, meter, rec, review);
    const fmt = s => ML.pad(Math.floor(s / 60)) + ':' + ML.pad(Math.floor(s % 60));
    async function toggle() {
      if (mr && mr.state === 'recording') { mr.stop(); return; }
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false } }); }
      catch (e) { info.textContent = 'Mikrofon tidak bisa dipakai. Izinkan akses mikrofon untuk aplikasi/browser ini lalu coba lagi.'; return; }
      review.replaceChildren(); cache = {}; buf = null; chunks = [];
      const mt = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find(m => window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m));
      try { mr = mt ? new MediaRecorder(stream, { mimeType: mt }) : new MediaRecorder(stream); } catch (e) { info.textContent = 'Perangkat tidak mendukung perekaman.'; stopAll(); return; }
      mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      mr.onstop = async () => {
        const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' }); stopAll(); rec.textContent = '● Rekam ulang'; meter.firstChild.style.width = '0';
        if (closed) return; info.textContent = 'Memproses rekaman…';
        try { buf = await V.decode(blob); } catch (e) { info.textContent = 'Rekaman tidak bisa dibaca. Coba lagi.'; return; }
        if (buf.duration < 0.2) { info.textContent = 'Rekaman terlalu pendek.'; return; }
        info.textContent = 'Pilih suara (preset atau manual) lalu tambahkan ke timeline.'; showReview();
      };
      const AC = window.AudioContext || window.webkitAudioContext, ac = new AC(), an = ac.createAnalyser(); an.fftSize = 512; ac.createMediaStreamSource(stream).connect(an);
      const d = new Uint8Array(an.fftSize), lv = () => { an.getByteTimeDomainData(d); let m = 0; for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i] - 128)); meter.firstChild.style.width = Math.min(100, m / 90 * 100) + '%'; raf = requestAnimationFrame(lv); };
      mr.addEventListener('stop', () => { try { ac.close(); } catch (e) { /* abaikan */ } });
      mr.start(250); t0 = Date.now(); rec.textContent = '■ Berhenti'; info.textContent = 'Merekam…'; lv();
      tmr = setInterval(() => { time.textContent = fmt((Date.now() - t0) / 1000); }, 250);
    }
    function showReview() {
      const audio = h('audio', { controls: true, style: 'width:100%;margin:10px 0' }), st = h('div', { class: 'info', text: '' });
      const add = h('button', { class: 'btn primary wide', text: 'Tambahkan ke timeline' }); let curBlob = null, curName = 'Rekaman';
      const pk = V.picker(apply, 'oneesan');
      async function apply() {
        const my = ++gen, p = pk.get(), ck = JSON.stringify(p); curName = pk.key() === 'asli' ? 'Rekaman' : 'Rekaman (' + pk.label() + ')';
        if (!cache[ck]) {
          st.textContent = 'Mengubah suara… 0%'; add.disabled = true;
          try { cache[ck] = V.wav(await V.process(V.mono(buf, 0, buf.duration), buf.sampleRate, p, q => { if (my === gen) st.textContent = 'Mengubah suara… ' + Math.round(q * 100) + '%'; }), buf.sampleRate); }
          catch (e) { st.textContent = 'Gagal mengubah suara: ' + e.message; return; }
        }
        if (my !== gen || closed) return; curBlob = cache[ck]; const u = URL.createObjectURL(curBlob); urls.push(u); audio.src = u; st.textContent = ''; add.disabled = false;
      }
      add.onclick = () => { if (!curBlob) return; const f = new File([curBlob], curName + '.wav', { type: 'audio/wav' }); close(); onDone(f); };
      review.replaceChildren(h('div', { class: 'lbl', style: 'margin:12px 0 0', text: 'Suara' }), pk.el, audio, st, add, h('div', { class: 'info', style: 'margin-top:8px', text: 'Pengubah suara menaikkan nada dan karakter suara tanpa mengubah durasi. Hasil terbaik untuk suara jelas tanpa musik. Dengarkan dulu sebelum menambahkan.' }));
      apply();
    }
  }, { onClose: () => { closed = true; stopAll(); urls.forEach(u => URL.revokeObjectURL(u)); } });
};

ML.guide = function () {
  const h = ML.h, L = (...a) => h('ul', {}, a.map(x => h('li', { html: x })));
  const ov = h('div', { class: 'ml-guide' },
    h('button', { class: 'gx', text: 'Tutup', onclick: () => ov.remove() }),
    h('h2', { text: 'Panduan MotionLyn' }), h('div', { text: 'Versi ' + ML.LABEL + ' · by MochiLyn' }),
    h('a', { href: 'https://whatsapp.com/channel/0029Vb962bxBadmU9RSkup1R', target: '_blank', rel: 'noopener', style: 'display:flex;align-items:center;gap:12px;margin:14px 0 4px;padding:12px 14px;background:#12351f;border:1.5px solid #25d366;border-radius:12px;color:#e6e8f6;text-decoration:none' },
      h('span', { style: 'width:34px;height:34px;border-radius:50%;background:#25d366;display:grid;place-items:center;flex:none', html: '<svg viewBox="0 0 24 24" width="20" height="20" fill="#fff"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.2 14.1c-.2.6-1.300 1.200-1.800 1.200-.5.100-1.100.100-1.800-.1-.4-.1-1-.3-1.700-.6-3-1.300-4.900-4.300-5-4.500-.2-.2-1.200-1.600-1.200-3s.8-2.100 1-2.400c.3-.3.600-.3.800-.3h.6c.2 0 .4 0 .6.500.2.600.8 2 .9 2.100.1.100.1.300 0 .5-.1.200-.1.300-.3.500l-.4.500c-.1.100-.3.300-.1.600.2.300.7 1.100 1.500 1.800 1 .9 1.900 1.200 2.200 1.300.3.100.4.100.6-.1.200-.2.700-.8.900-1.100.2-.3.400-.2.600-.1l2 1c.3.100.5.200.5.300.100.100.100.700-.1 1.300z"/></svg>' }),
      h('div', { html: '<b>Saluran MotionLyn</b><br><span style="opacity:.75;font-size:12px">Gabung saluran WhatsApp untuk info &amp; update</span>' })),
    h('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin:14px 0 4px;padding:10px 12px;background:#1b1e30;border-radius:12px' }, h('div', { html: '<b>Tampilan</b><br><span style="opacity:.7;font-size:12px">Mobile (default) atau Desktop</span>' }), ML.uiSwitch()),
    h('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin:6px 0 4px;padding:10px 12px;background:#1b1e30;border-radius:12px' }, h('div', { html: '<b>Tema</b><br><span style="opacity:.7;font-size:12px">Cerah atau Gelap (beta)</span>' }),
      h('div', { class: 'ed-mode ed-theme' }, ...[['light', 'Cerah'], ['dark', 'Gelap β']].map(([t, l]) => { const b = h('button', { text: l, style: 'width:auto;padding:0 12px;font-size:13px;font-weight:600', onclick: () => ML.setTheme(t) }); b.dataset.t = t; if (ML.themeNow() === t) b.className = 'on'; return b; }))),
    h('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin:6px 0 4px;padding:10px 12px;background:#1b1e30;border-radius:12px' }, h('div', { html: '<b>Tampilkan FPS</b><br><span style="opacity:.7;font-size:12px">Real time di pojok layar (untuk cek performa)</span>' }),
      (() => { const b = h('button', { class: 'btn soft', style: 'width:auto;min-width:64px;margin:0;padding:0 14px', onclick: () => { ML.fpsMeter.set(!ML.fpsMeter.get()); b.textContent = ML.fpsMeter.get() ? 'ON' : 'OFF'; } }); b.textContent = ML.fpsMeter.get() ? 'ON' : 'OFF'; return b; })()),
    h('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin:6px 0 4px;padding:10px 12px;background:#1b1e30;border-radius:12px' }, h('div', { html: '<b>Test Performa</b><br><span style="opacity:.7;font-size:12px">Ukur kekuatan HP + skor</span>' }),
      h('button', { class: 'btn primary', style: 'width:auto;margin:0;padding:0 14px', text: 'Mulai', onclick: () => { ov.remove(); ML.perfTest(); } })),
    h('h3', { text: 'Dasar' }), L('<b>+</b> menambah video, foto, audio, <b>rekam audio</b> (bisa diubah jadi suara cewek), teks, bentuk. Layer audio punya tombol <b>Ubah Suara</b>: preset Onee-san, Cewek, Remaja, Loli, atau manual, plus saklar <b>Peredam noise</b> ON/OFF.', 'Ketuk layer → <b>Move & Transform</b> untuk posisi, skala, rotasi.', '<b>◆</b> di tiap parameter = keyframe; ikon kurva = easing animasi.', 'Tombol <b>◀◆ ◆▶</b> = loncat presisi ke keyframe layer terpilih.', 'Penanda (bendera) = titik bantu; tombol panah di sebelahnya loncat antar penanda.'),
    h('h3', { text: 'Efek (Browser Efek: tombol + di panel Efek)' }), L('<b>Salin efek</b>: buka satu efek di panel Efek lalu ketuk “Salin efek ini”. <b>Salin semua efek</b>: tombol di panel Efek (atau ikon di bar atas). Lalu pilih layer lain → <b>Tempel efek</b>. Keyframe efek otomatis diskalakan mengikuti panjang layer tujuan.', '<b>Ubin V3</b> (kategori Ulangi): mengulang isi layer jadi petak-petak ke seluruh layar, seperti Ubin di Alight Motion. <b>Potong</b> = ukuran petak (1 = seluruh layer), <b>Offset</b> = geser baris selang-seling, <b>Mirror</b> = petak dicerminkan bergantian, <b>Geser X/Y</b> = menggulung pola (bisa keyframe).', '<b>Ubin V2 (Keramik)</b>: potong 4 sisi, offset, geser baris (susunan bata), celah nat, miror.', '<b>Cermin V2</b>: horizontal, vertikal, mode blending (Normal/Tambah/Kali/Layar), alpha, offset.', '<b>Paparan/Gamma</b>: exposure (EV), gamma, offset.', '<b>Remas</b>: pinch/bulge dengan titik dan radius.', '<b>Chroma Key</b>: pilih hue kunci, toleransi, kehalusan, hapus tumpahan, rapatkan tepi.', '<b>Pemindahan Acak</b>: geser blok acak, atur jumlah blok, kecepatan, seed.', '<b>CC HD</b>: salin latar belakang lalu pertajam/HD. Taruh pada layer (bentuk/solid) dari awal sampai akhir proyek, di atas layer lain.', '<b>Efek dari Alight (v3.19)</b>: Balik 3D, Transform, Warna Solid, Overlay Gradien, Lipatan Halaman, Garis Cahaya, Putar Terus, Offset, Chroma Key Lanjutan, Sapuan, Blur Lensa, Kedip. Warna diatur lewat 3 slider R/G/B. Efek yang namanya sama dengan efek lama (Ayun, Pemindahan Acak, Paparan, Chroma Key, Luma Key, Gelombang) ditambahkan sebagai <b>V2</b>, efek lama tidak diganti. Sebagian adalah pendekatan, hasilnya mirip tapi tidak persis Alight.', 'Efek lama: Ubin, Ombang-ambing, Ayun, Buram Gerak, Cermin, Luma Key, Salin Latar, Gelombang.'),
    h('h3', { text: '3D ringan (Move & Transform → tombol 3D / Z)' }), L('<b>Mode 3D</b>: aktifkan per layer, lalu atur <b>Posisi Z</b> (bisa keyframe). Makin besar Z = makin jauh.', '<b>Kamera</b> (+ → Kamera): geser X/Y/Z, putar, dan Zoom kamera (keyframe). Hanya layer dengan mode 3D hidup yang ikut kamera.', '<b>Null object</b> (+ → Null object): layer tak terlihat. Pada layer lain pilih Sambung ke Null supaya ikut geser, putar, skala, dan Z milik Null.', '<b>Model 3D (beta)</b> (+ → Model 3D): impor .glb. Atur Rotasi X/Y/Z, Skala model, Auto-putar, Sudut cahaya, Cahaya sekitar (semua keyframe + kurva). Layer model juga bisa digeser, diberi efek, disambung ke Null, dan ikut kamera. Mendukung material, tekstur warna, warna vertex, animasi bawaan (tulang/skinning, morph target/gerak mulut, sparse accessor, beberapa klip digabung otomatis), varian material, scene, dan tampil/sembunyi bagian. Belum: normal map, kompresi Draco/Meshopt.', '<b>Map 3D (beta)</b> (+ → Map 3D): impor .glb sebagai lingkungan/level layar penuh, otomatis diletakkan paling bawah. Atur Kamera X/Y/Z, Yaw, Pitch, FOV (keyframe + kurva) untuk berkeliling di dalam map. Layer lain bisa ditumpuk di atasnya.', '<b>Model + Map 3D (experimental)</b> (+ → Model + Map 3D): dua mode impor. <b>Set map + model (test)</b> = 1 file yang sudah berisi map dan model, jadi satu adegan. <b>Map & model pisah (beta)</b> = 2 file (map + model), model bisa digeser/diputar/diskala sendiri di dalam map.', '<b>Refleksi RL HD</b> (khusus Model/Map 3D, panel 3D / Z): pantulan langit di permukaan mengkilap (pilih Siang/Senja/Malam/Studio) + pantulan lantai yang memudar, render HD 2x. Kekuatan, tinggi lantai, dan pudar bisa keyframe.', '<b>Pencahayaan realistis</b> (khusus Model/Map 3D, panel 3D / Z): cahaya utama dengan arah + ketinggian, suhu warna, cahaya tepi (rim), spekular berbasis kekasaran material, ambient langit/tanah, eksposur, dan tone mapping filmik. Semua parameter bisa keyframe + kurva. Bisa dipadukan dengan Refleksi RL HD.', '<b>Preset pose</b> (Model 3D → Mode pose): Pose preset 1 (tangan membentuk hati, kepala miring) dan Pose preset 2 (badan menoleh, satu tangan terentang, kepala menengadah) — tahap uji coba, otomatis menyesuaikan ke rig humanoid.', '<b>Model + Map 3D (experimental)</b> (+ → Model + Map 3D): satu layer berisi map dan model dalam satu adegan — satu kamera, kedalaman benar, cahaya/refleksi ikut. Pilih map lalu model. Atur posisi/rotasi/skala model, animasi, dan pose di Move & Transform → 3D / Z (bagian Model di dalam map). Map biasa juga bisa diberi model lewat tombol Tambah model ke map ini.', 'Belum ada: 3D tracking.'),
    h('h3', { text: 'Tampilan Mobile / Desktop' }), L('Ikon <b>ponsel / monitor</b> di menu atas (beranda dan editor) mengganti tampilan. Mobile = default. Desktop = preview + timeline di kiri, panel properti di kanan, Browser Efek sebagai panel samping.', 'Pintasan keyboard di mode Desktop: <b>Spasi</b> play/pause, <b>Ctrl+Z</b> undo, <b>Ctrl+Y</b> atau <b>Ctrl+Shift+Z</b> redo, <b>Delete</b> hapus layer.'),
    h('h3', { text: 'Berbagi proyek via link (butuh online)' }), L('Menu proyek (⋮) atau Ekspor di editor → <b>Bagikan via link</b>: proyek .ml (maks 6 MB) diunggah, kamu dapat kode 8 karakter + link.', 'Penerima: buka halaman MotionLyn, login, lalu <b>Impor → Dari link</b>, tempel kode atau link.', 'Hanya jalan di versi online (claude.ai). Di APK/Blogger fitur ini memberi pesan butuh online.'),
    h('h3', { text: 'Proyek' }), L('<b>Ganti rasio, resolusi, fps kapan saja</b>: ikon gerigi di editor → Terapkan format (layer ikut menyesuaikan, bisa Undo). Saat Ekspor, resolusi dan fps juga bisa dipilih sendiri tanpa mengubah proyek.', 'Lama mengedit tampil di bilah transport editor (jam:menit:detik), tersimpan di proyek.', 'Ekspor/impor proyek .ml dan ekspor video dari menu proyek.'));
  document.body.append(ov);
};
})();
