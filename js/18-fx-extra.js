'use strict';
/* ---------- Efek tambahan dari proyek Alight Motion (XML): 12 efek baru ----------
   Warna dibuat 3 slider (R/G/B 0-255). Beberapa efek adalah pendekatan, bukan salinan persis Alight. */
(function () {
const NUM = (k, l, min, max, def, step = 1, unit = '') => ({ k, l, min, max, def, step, unit });
const SEL = (k, l, opts, def = 0) => ({ k, l, type: 'sel', opts, def });
const COL = (k, l, r, g, b) => [NUM(k + 'r', l + ' (R)', 0, 255, r, 1), NUM(k + 'g', l + ' (G)', 0, 255, g, 1), NUM(k + 'b', l + ' (B)', 0, 255, b, 1)];
const OO = ['Mati', 'Hidup'];
const BLEND = ['Normal', 'Tambah', 'Kali', 'Layar', 'Overlay'];
const LIB = `
vec3 UP(vec4 c){ return c.a>0.?c.rgb/c.a:vec3(0.); }
float LU(vec3 c){ return dot(c,vec3(.299,.587,.114)); }
vec2 CC(vec3 c){ return vec2(dot(c,vec3(-.169,-.331,.5)),dot(c,vec3(.5,-.419,-.081))); }
vec3 BL(vec3 b, vec3 s, float m){
  if(m<.5) return s;
  if(m<1.5) return min(b+s,1.);
  if(m<2.5) return b*s;
  if(m<3.5) return 1.-(1.-b)*(1.-s);
  return mix(2.*b*s,1.-2.*(1.-b)*(1.-s),step(.5,b));
}
vec2 LZ(){ return (u_Lz.x>1.&&u_Lz.y>1.)?u_Lz:u_res; }
`;
const F = code => LIB + code;

Object.assign(ML.FXDEF, {
  flip3: { name: 'Balik 3D (Flip)', icon: 'layers', thumb: { angle: 50, zdist: 30 },
    params: [NUM('angle', 'Sudut balik', -360, 360, 0, 0.1, '°'), NUM('axis', 'Arah sumbu', -180, 180, 0, 1, '°'), NUM('zdist', 'Perspektif', 0, 100, 0, 0.1, '%'),
      SEL('solid', 'Sisi belakang solid', OO)].concat(COL('s', 'Warna belakang', 221, 68, 85)).concat([
      SEL('light', 'Cahaya', OO), NUM('lint', 'Intensitas cahaya', 0, 300, 100, 1, '%'), NUM('ambient', 'Ambient', 0, 100, 10, 1, '%'), NUM('shine', 'Kilau', 0, 100, 80, 1, '%')]),
    frag: F(`void main(){
      vec2 c=u_T; vec2 p=vUV*u_res-c;
      float ax=radians(u_axis), th=radians(u_angle);
      vec2 n=vec2(cos(ax),sin(ax)); vec2 m=vec2(-n.y,n.x);
      float U=dot(p,n), V=dot(p,m);
      float ct=cos(th), st=sin(th);
      float R=max(max(u_res.x,u_res.y),1.);
      float k=u_zdist*.01;
      float den=ct-V*k*st/R;
      vec4 o=vec4(0.);
      if(abs(den)>.0001){
        float v=V/den;
        float persp=1.+k*v*st/R;
        if(persp>.05){
          float u=U*persp;
          vec4 s=S((c+u*n+v*m)/u_res);
          vec3 rgb=s.rgb;
          if(ct<0.&&u_solid>.5) rgb=vec3(u_sr,u_sg,u_sb)/255.*s.a;
          if(u_light>.5){
            float sh=u_lint*.01*(u_ambient*.01+(1.-u_ambient*.01)*abs(ct));
            rgb=rgb*sh+vec3(u_shine*.01*pow(max(cos(th-.6),0.),30.))*s.a;
            rgb=min(rgb,vec3(s.a));
          }
          o=vec4(rgb,s.a);
        }
      }
      gl_FragColor=o;}`) },

  transform: { name: 'Transform (Skala/Putar)', icon: 'fx', thumb: { scale: 70, angle: 15, fill: 1 },
    params: [NUM('scale', 'Skala', 1, 400, 100, 0.1, '%'), NUM('angle', 'Sudut', -360, 360, 0, 0.1, '°'), NUM('alpha', 'Alpha', 0, 100, 100, 1, '%'), SEL('fill', 'Isi di luar tepi', ['Transparan', 'Ulang tepi', 'Cermin'])],
    frag: F(`void main(){
      vec2 p=vUV*u_res-u_T; float a=radians(u_angle), cs=cos(a), sn=sin(a), sc=max(u_scale*.01,.001);
      p=vec2(cs*p.x+sn*p.y,-sn*p.x+cs*p.y)/sc;
      vec2 q=(p+u_T)/u_res; vec4 s;
      if(u_fill<.5) s=S(q);
      else if(u_fill<1.5) s=texture2D(u_tex,clamp(q,0.,1.));
      else s=texture2D(u_tex,1.-abs(1.-mod(q,2.)));
      gl_FragColor=s*(u_alpha*.01);}`) },

  solidcolor: { name: 'Warna Solid (Solid Color)', icon: 'adjust',
    params: COL('c', 'Warna', 45, 30, 246).concat([NUM('alpha', 'Alpha', 0, 100, 100, 1, '%'), SEL('blend', 'Mode blending', BLEND)]),
    frag: F(`void main(){
      vec4 c=texture2D(u_tex,vUV); vec3 rgb=UP(c); vec3 col=vec3(u_cr,u_cg,u_cb)/255.;
      vec3 b=BL(rgb,col,u_blend); rgb=mix(rgb,b,u_alpha*.01);
      gl_FragColor=vec4(rgb*c.a,c.a);}`) },

  gradoverlay: { name: 'Overlay Gradien (Gradient Overlay)', icon: 'adjust',
    params: COL('p', 'Warna 1', 238, 85, 51).concat(COL('q', 'Warna 2', 255, 238, 136)).concat([NUM('angle', 'Sudut', -360, 360, 0, 1, '°'), NUM('scale', 'Skala', 5, 400, 100, 1, '%'), NUM('alpha', 'Alpha', 0, 100, 75, 1, '%'), SEL('gtype', 'Jenis', ['Linear', 'Radial', 'Sudut']), SEL('blend', 'Mode blending', BLEND)]),
    frag: F(`void main(){
      vec4 c=texture2D(u_tex,vUV); vec3 rgb=UP(c);
      vec2 L=LZ(); vec2 p=vUV*u_res-u_T; float a=radians(u_angle); vec2 d=vec2(cos(a),sin(a));
      float sc=max(u_scale*.01,.001); float t=0.;
      if(u_gtype<.5){ float hh=max(.5*(abs(d.x)*L.x+abs(d.y)*L.y),1.); t=dot(p,d)/(2.*hh*sc)+.5; }
      else if(u_gtype<1.5){ t=length(p)/(max(.5*length(L),1.)*sc); }
      else { t=fract(atan(p.y,p.x)/6.2831853+u_angle/360.); }
      t=clamp(t,0.,1.);
      vec3 g=mix(vec3(u_pr,u_pg,u_pb),vec3(u_qr,u_qg,u_qb),t)/255.;
      vec3 b=BL(rgb,g,u_blend); rgb=mix(rgb,b,u_alpha*.01);
      gl_FragColor=vec4(rgb*c.a,c.a);}`) },

  pagecurl: { name: 'Lipatan Halaman (Page Curl)', icon: 'layers', thumb: { progress: 22 },
    params: [NUM('progress', 'Progres', 0, 100, 40, 0.1, '%'), NUM('radius', 'Radius gulungan', 1, 50, 10, 0.1, '%'), NUM('angle', 'Sudut', -180, 180, 38, 1, '°'), NUM('alpha', 'Alpha efek', 0, 100, 100, 1, '%')]
      .concat(COL('k', 'Warna belakang', 136, 136, 136)).concat([NUM('balpha', 'Alpha belakang', 0, 100, 100, 1, '%'), SEL('bblend', 'Blend belakang', BLEND, 2),
      NUM('shine', 'Kilau', 0, 100, 100, 1, '%'), NUM('spec', 'Ketajaman kilau', 1, 100, 30, 1), NUM('dshadow', 'Bayangan jatuh', 0, 100, 80, 1, '%'), SEL('soft', 'Bayangan lembut', OO, 1), NUM('fshadow', 'Bayangan depan', 0, 100, 50, 1, '%')]),
    frag: F(`void main(){
      float PI=3.14159265; vec2 L=LZ();
      float an=radians(u_angle); vec2 d=vec2(cos(an),sin(an)); vec2 m=vec2(-d.y,d.x);
      vec2 p=vUV*u_res-u_T; float xs=dot(p,d), ys=dot(p,m);
      float h=max(.5*(abs(d.x)*L.x+abs(d.y)*L.y),1.);
      float R=max(u_radius*.01*max(L.x,L.y),1.);
      float f=h-u_progress*.01*(2.*h+PI*R);
      float smax=h-f;
      float kind=0.; float xp=xs; float th=0.;
      if(xs<f){
        float sb=PI*R+(f-xs);
        if(sb<=smax){ kind=2.; xp=f+sb; } else { kind=1.; xp=xs; }
      } else if(xs-f<=R){
        float t1=asin(clamp((xs-f)/R,0.,1.));
        float sB=R*(PI-t1), sF=R*t1;
        if(sB<=smax){ kind=3.; xp=f+sB; th=PI-t1; }
        else if(sF<=smax){ kind=4.; xp=f+sF; th=t1; }
      }
      vec4 s=vec4(0.); vec3 rgb=vec3(0.);
      if(kind>.5){
        s=S((u_T+xp*d+ys*m)/u_res); rgb=UP(s);
        if(kind>1.5&&kind<3.5){
          vec3 bc=vec3(u_kr,u_kg,u_kb)/255.;
          rgb=mix(rgb,BL(rgb,bc,u_bblend),u_balpha*.01);
          if(kind>2.5) rgb+=vec3(u_shine*.01*.6*pow(max(cos(th-1.75),0.),max(u_spec,1.)));
        }
        if(kind>3.5) rgb*=1.-u_fshadow*.01*.5*sin(th);
        if(kind<1.5){
          float e=(smax>PI*R)?f-(smax-PI*R):f;
          float dist=max(e-xs,0.);
          float sh=(u_soft>.5)?exp(-dist/(R*1.6)):((dist<R*.6)?1.:0.);
          sh*=clamp(smax/(R*.5),0.,1.);
          rgb*=1.-u_dshadow*.01*sh*.7;
        }
        rgb=clamp(rgb,0.,1.);
      }
      vec4 o=vec4(rgb*s.a,s.a);
      gl_FragColor=mix(texture2D(u_tex,vUV),o,u_alpha*.01);}`) },

  streaks: { name: 'Garis Cahaya (Streaks)', icon: 'curve',
    params: [NUM('strength', 'Panjang', 0, 100, 15, 0.1, '%'), NUM('angle', 'Sudut', -180, 180, 0, 1, '°'), NUM('alpha', 'Alpha', 0, 100, 100, 1, '%'), NUM('bias', 'Bias ambang', -50, 50, 0, 1, '%'), SEL('mode', 'Mode', ['Blur arah', 'Cahaya (tambah)'], 1)],
    frag: F(`void main(){
      float a=radians(u_angle);
      vec2 dir=vec2(cos(a),sin(a))*(u_strength*.01*u_res.x)/u_res;
      vec4 o=texture2D(u_tex,vUV);
      vec4 acc=vec4(0.); float ws=0.; float th=.35-u_bias*.01;
      for(int i=-16;i<=16;i++){
        float t=float(i)/16.; float w=1.-abs(t); w*=w;
        vec4 s=S(vUV+dir*t);
        float g=1.;
        if(u_mode>.5) g=smoothstep(th,th+.4,LU(UP(s)));
        acc+=s*(w*g); ws+=w;
      }
      vec4 st=acc/max(ws,.0001);
      vec4 r;
      if(u_mode>.5) r=min(o+st*(u_alpha*.01),1.);
      else r=mix(o,st,u_alpha*.01);
      gl_FragColor=r;}`) },

  spin: { name: 'Putar Terus (Spin)', icon: 'fx',
    params: [NUM('rpm', 'Putaran per menit (RPM)', -600, 600, 60, 1)],
    frag: F(`void main(){
      float a=6.2831853*u_rpm/60.*u_time; float cs=cos(a), sn=sin(a);
      vec2 p=vUV*u_res-u_T;
      p=vec2(cs*p.x+sn*p.y,-sn*p.x+cs*p.y);
      gl_FragColor=S((p+u_T)/u_res);}`) },

  offset: { name: 'Offset (Geser Isi)', icon: 'grid', thumb: { ox: 25, oy: 15 },
    params: [NUM('ox', 'Geser X', -100, 100, 0, 0.1, '%'), NUM('oy', 'Geser Y', -100, 100, 0, 0.1, '%'), SEL('edge', 'Tepi', ['Ulang (wrap)', 'Transparan', 'Tarik tepi']), NUM('feather', 'Halus tepi (Transparan)', 0, 50, 0, 0.1, '%'), SEL('mask', 'Batasi ke bentuk asli', OO)],
    frag: F(`void main(){
      vec2 q=vUV-vec2(u_ox,u_oy)*.01; vec4 s;
      if(u_edge<.5) s=texture2D(u_tex,fract(q));
      else if(u_edge<1.5) s=S(q);
      else s=texture2D(u_tex,clamp(q,0.,1.));
      float fe=u_feather*.01;
      if(u_edge>.5&&u_edge<1.5&&fe>.0005){ s*=smoothstep(0.,fe,min(min(q.x,1.-q.x),min(q.y,1.-q.y))); }
      if(u_mask>.5) s*=texture2D(u_tex,vUV).a;
      gl_FragColor=s;}`) },

  chromakeyadv: { name: 'Chroma Key Lanjutan (4 warna)', icon: 'adjust', thumb: { c1t: 35, c2t: 35 },
    params: [SEL('mode', 'Metode', ['Chroma (warna)', 'RGB']), SEL('show', 'Tampilkan matte', OO)]
      .concat([1, 2, 3, 4].reduce((a, i) => a.concat([SEL('c' + i + 'on', 'Kunci ' + i + ' aktif', OO, i < 3 ? 1 : 0)], COL('c' + i, 'Warna ' + i, 0, 255, 0), [NUM('c' + i + 't', 'Ambang ' + i, 0, 100, 10, 0.1, '%'), NUM('c' + i + 'f', 'Halus ' + i, 0, 50, 5, 0.1, '%'), NUM('c' + i + 'l', 'Luma ' + i, 0, 100, 25, 1, '%')]), [])),
    frag: F(`float KY(vec3 rgb, vec3 k, float th, float fe, float lu, float mode){
      float dc=(mode<.5)?distance(CC(rgb),CC(k)):distance(rgb,k)*.6;
      float dl=abs(LU(rgb)-LU(k))*lu;
      float d=length(vec2(dc,dl));
      return smoothstep(th*.01,th*.01+max(fe*.01,.0005),d);
    }
    void main(){
      vec4 c=texture2D(u_tex,vUV); vec3 rgb=UP(c); float a=1.;
      if(u_c1on>.5) a=min(a,KY(rgb,vec3(u_c1r,u_c1g,u_c1b)/255.,u_c1t,u_c1f,u_c1l*.01,u_mode));
      if(u_c2on>.5) a=min(a,KY(rgb,vec3(u_c2r,u_c2g,u_c2b)/255.,u_c2t,u_c2f,u_c2l*.01,u_mode));
      if(u_c3on>.5) a=min(a,KY(rgb,vec3(u_c3r,u_c3g,u_c3b)/255.,u_c3t,u_c3f,u_c3l*.01,u_mode));
      if(u_c4on>.5) a=min(a,KY(rgb,vec3(u_c4r,u_c4g,u_c4b)/255.,u_c4t,u_c4f,u_c4l*.01,u_mode));
      if(u_show>.5) gl_FragColor=vec4(vec3(a)*c.a,c.a);
      else gl_FragColor=c*a;}`) },

  wipe2: { name: 'Sapuan (Wipe)', icon: 'layers', thumb: { start: 30, end: 80, feather: 8 },
    params: [NUM('start', 'Mulai', 0, 100, 0, 0.1, '%'), NUM('end', 'Selesai', 0, 100, 100, 0.1, '%'), NUM('angle', 'Sudut', -180, 180, 0, 1, '°'), NUM('feather', 'Halus tepi', 0, 50, 0, 0.1, '%')],
    frag: F(`void main(){
      vec4 c=texture2D(u_tex,vUV);
      vec2 L=LZ(); vec2 p=vUV*u_res-u_T; float an=radians(u_angle); vec2 d=vec2(cos(an),sin(an));
      float hh=max(.5*(abs(d.x)*L.x+abs(d.y)*L.y),1.);
      float t=dot(p,d)/(2.*hh)+.5;
      float fe=max(u_feather*.01,.0004);
      float a1=clamp((t-u_start*.01)/fe+.5,0.,1.);
      float a2=clamp((u_end*.01-t)/fe+.5,0.,1.);
      gl_FragColor=c*(a1*a2);}`) },

  lensblur: { name: 'Blur Lensa (Lens Blur)', icon: 'fx',
    params: [NUM('radius', 'Radius', 0, 100, 15, 0.1), NUM('strength', 'Kilau bokeh', 0, 100, 15, 0.1, '%')],
    frag: F(`void main(){
      float R=u_radius*.001*u_res.x;
      vec4 acc=vec4(0.); float ws=0.;
      for(int i=0;i<32;i++){
        float fi=float(i)+.5; float r=sqrt(fi/32.); float an=fi*2.39996323;
        vec2 o=vec2(cos(an),sin(an))*r*R/u_res;
        vec4 s=S(vUV+o);
        float w=1.+u_strength*.2*pow(LU(UP(s)),3.);
        acc+=s*w; ws+=w;
      }
      gl_FragColor=min(acc/max(ws,.0001),1.);}`) },

  blink: { name: 'Kedip (Blink)', icon: 'adjust', thumb: { freq: 1 },
    params: [NUM('freq', 'Frekuensi (Hz)', 0, 30, 2, 0.01), NUM('duty', 'Lama tampil', 5, 95, 50, 1, '%')],
    frag: F(`void main(){
      vec4 c=texture2D(u_tex,vUV);
      float on=step(fract(u_time*u_freq),u_duty*.01);
      gl_FragColor=c*on;}`) }
});
/* ---------- Versi V2 dari efek Alight yang namanya sama dengan efek lama (efek lama TIDAK diganti) ---------- */
const NZ = `
float H(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float NV(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(H(i),H(i+vec2(1.,0.)),f.x),mix(H(i+vec2(0.,1.)),H(i+vec2(1.,1.)),f.x),f.y); }
float NE(vec2 p,float e){ float i=floor(e); float f=fract(e); f=f*f*(3.-2.*f); return mix(NV(p+i*13.7),NV(p+(i+1.)*13.7),f); }
`;
Object.assign(ML.FXDEF, {
  swingv2: { name: 'Ayun V2 (Swing Alight)', icon: 'adjust',
    params: [NUM('freq', 'Frekuensi (Hz)', 0, 10, 2, 0.01), NUM('a1', 'Sudut 1', -180, 180, -30, 0.1, '°'), NUM('a2', 'Sudut 2', -180, 180, 30, 0.1, '°'), NUM('phase', 'Fase', -360, 360, 0, 1, '°'), SEL('type', 'Gelombang', ['Sinus', 'Segitiga', 'Gigi gergaji'])],
    frag: F(`void main(){
      float x=u_freq*u_time+u_phase/360.; float f=fract(x); float w;
      if(u_type<.5) w=.5+.5*sin(6.2831853*x);
      else if(u_type<1.5) w=abs(f*2.-1.);
      else w=f;
      float a=radians(mix(u_a1,u_a2,w)); float cs=cos(a), sn=sin(a);
      vec2 p=vUV*u_res-u_T;
      p=vec2(cs*p.x+sn*p.y,-sn*p.x+cs*p.y);
      gl_FragColor=S((p+u_T)/u_res);}`) },

  randdispv2: { name: 'Pemindahan Acak V2 (Noise halus)', icon: 'curve',
    params: [NUM('mag', 'Besar pemindahan', 0, 300, 50, 0.1, 'px'), NUM('evolution', 'Evolusi', 0, 100, 0, 0.01), NUM('seed', 'Seed', 0, 1000, 0, 1), NUM('scatter', 'Sebaran', 0, 100, 50, 0.1, '%')],
    frag: F(NZ + `void main(){
      float sc=mix(2.,60.,u_scatter*.01);
      vec2 p=vUV*sc*vec2(u_res.x/u_res.y,1.);
      vec2 o=vec2(NE(p+u_seed*17.,u_evolution),NE(p+u_seed*31.+57.3,u_evolution))-.5;
      gl_FragColor=S(vUV+o*2.*u_mag/u_res);}`) },

  exposurev2: { name: 'Paparan V2 (Exposure Alight)', icon: 'adjust',
    params: [NUM('exposure', 'Exposure (EV)', -10, 10, 0, 0.01), NUM('gamma', 'Gamma', 0.1, 5, 1, 0.01), NUM('offset', 'Offset', -1, 1, 0, 0.001)],
    frag: F(`void main(){
      vec4 c=texture2D(u_tex,vUV); vec3 r=UP(c);
      r=max(r*pow(2.,u_exposure)+u_offset,0.); r=pow(r,vec3(1./max(u_gamma,.01)));
      gl_FragColor=vec4(min(r,1.)*c.a,c.a);}`) },

  chromav2: { name: 'Chroma Key V2 (Alight)', icon: 'adjust',
    params: COL('k', 'Warna kunci', 0, 255, 0).concat([NUM('threshold', 'Ambang', 0, 100, 10, 0.1, '%'), NUM('feather', 'Halus tepi', 0, 50, 5, 0.1, '%'), SEL('defringe', 'Hapus tepi hijau (defringe)', OO), SEL('invert', 'Balik', OO)]),
    frag: F(`void main(){
      vec4 c=texture2D(u_tex,vUV); vec3 rgb=UP(c); vec3 k=vec3(u_kr,u_kg,u_kb)/255.;
      float d=distance(CC(rgb),CC(k)); float t=u_threshold*.01, fe=max(u_feather*.01,.0005);
      float a=smoothstep(t,t+fe,d);
      if(u_defringe>.5){ rgb=mix(rgb,vec3(LU(rgb)),(1.-smoothstep(t+fe,t+fe*4.+.05,d))); }
      if(u_invert>.5) a=1.-a;
      gl_FragColor=vec4(rgb*a*c.a,a*c.a);}`) },

  lumakeyv2: { name: 'Luma Key V2 (Rentang)', icon: 'adjust',
    params: [NUM('low', 'Batas bawah', 0, 100, 0, 0.1, '%'), NUM('high', 'Batas atas', 0, 100, 100, 0.1, '%'), NUM('feather', 'Halus tepi', 0, 50, 5, 0.1, '%'), SEL('invert', 'Balik', OO), SEL('weighted', 'Luma berbobot', OO, 1)],
    frag: F(`void main(){
      vec4 c=texture2D(u_tex,vUV); vec3 rgb=UP(c);
      float l=(u_weighted>.5)?LU(rgb):(rgb.r+rgb.g+rgb.b)/3.;
      float lo=u_low*.01, hi=u_high*.01, fe=max(u_feather*.01,.0005);
      float a=smoothstep(lo-fe,lo,l)*(1.-smoothstep(hi,hi+fe,l));
      if(u_invert>.5) a=1.-a;
      gl_FragColor=c*a;}`) },

  wavev2: { name: 'Gelombang V2 (Wave Warp Alight)', icon: 'curve',
    params: [NUM('phase', 'Fase', -360, 360, 0, 1, '°'), NUM('a1d', 'Arah pemindahan', -180, 180, 0, 1, '°'), NUM('m1', 'Tinggi gelombang', 0, 300, 20, 0.1, 'px'), NUM('m2', 'Jumlah gelombang', 0, 50, 4, 0.01), NUM('a2d', 'Arah rambat', -180, 180, 90, 1, '°'),
      NUM('damping', 'Peredaman', 0, 100, 0, 1, '%'), SEL('dspace', 'Ruang peredaman', ['Linear', 'Radial']), NUM('dorigin', 'Titik asal peredaman', 0, 100, 50, 0.1, '%'), SEL('screen', 'Ruang layar', OO)],
    frag: F(`void main(){
      vec2 L=LZ(); vec2 c=(u_screen>.5)?u_res*.5:u_T; vec2 ext=(u_screen>.5)?u_res:L;
      vec2 d1=vec2(cos(radians(u_a1d)),sin(radians(u_a1d))); vec2 d2=vec2(cos(radians(u_a2d)),sin(radians(u_a2d)));
      vec2 p=vUV*u_res-c;
      float e=max(.5*(abs(d2.x)*ext.x+abs(d2.y)*ext.y),1.)*2.;
      float t=dot(p,d2)/e+.5;
      float w=sin(6.2831853*t*u_m2+radians(u_phase));
      float dist=(u_dspace<.5)?abs(t-u_dorigin*.01):length(p/ext)*2.;
      float amp=u_m1*(1.-clamp(u_damping*.01*dist*2.,0.,1.));
      gl_FragColor=S(vUV+d1*amp*w/u_res);}`) }
});
['swingv2', 'randdispv2', 'exposurev2', 'chromav2', 'lumakeyv2', 'wavev2'].forEach(t => ML.FX_ORDER.push(t));
['flip3', 'transform', 'solidcolor', 'gradoverlay', 'pagecurl', 'streaks', 'spin', 'offset', 'chromakeyadv', 'wipe2', 'lensblur', 'blink'].forEach(t => ML.FX_ORDER.push(t));
})();

/* Chat global (Supabase REST + polling). Hanya memakai publishable key; keamanan diatur lewat RLS di Supabase. */
ML.chat = (() => {
  const h = ML.h, API = 'https://aybkkninkwxrnljnwbdq.supabase.co/rest/v1/global_chat', KEY = 'sb_publishable_c0ZqmgKIc57yVlIf84d_Vg_r7o37hve';
  const HD = { apikey: KEY, 'Content-Type': 'application/json' };
  const hhmm = s => { const d = new Date(s); return ML.pad(d.getHours()) + ':' + ML.pad(d.getMinutes()); };
  async function load() {
    const r = await fetch(API + '?select=id,nick,msg,created_at&order=id.desc&limit=60', { headers: HD });
    if (!r.ok) throw new Error('Gagal memuat chat (' + r.status + ')');
    return (await r.json()).reverse();
  }
  async function send(nick, msg) {
    const r = await fetch(API, { method: 'POST', headers: Object.assign({ Prefer: 'return=minimal' }, HD), body: JSON.stringify({ nick, msg }) });
    if (!r.ok) throw new Error('Gagal mengirim (' + r.status + ')');
  }
  function open() {
    let timer = 0, lastId = -1, busy = false, lastSend = 0, closed = false;
    ML.sheet('Chat Global (beta)', (body, close) => {
      const list = h('div', { style: { height: '46vh', overflowY: 'auto', padding: '4px 2px', display: 'flex', flexDirection: 'column', gap: '8px' } });
      const nick = h('input', { class: 'txt', type: 'text', placeholder: 'Nama kamu', maxlength: 24, value: ML.lsGet('ml.nick') || '' });
      const msg = h('input', { class: 'txt', type: 'text', placeholder: 'Tulis pesan…', maxlength: 300 });
      const status = h('div', { class: 'info', style: { margin: '0 0 6px' }, text: 'Memuat…' });
      const bubble = m => {
        const mine = m.nick === (ML.lsGet('ml.nick') || '');
        return h('div', { style: { alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '82%', background: mine ? '#ff3fb0' : '#fff', color: '#2a1233', borderRadius: '14px', padding: '8px 12px', boxShadow: '0 1px 2px rgba(0,0,0,.12)', wordBreak: 'break-word', fontSize: '14.5px' } },
          h('div', { style: { fontSize: '11.5px', opacity: '.65', fontWeight: '700', marginBottom: '2px' }, text: m.nick + ' · ' + hhmm(m.created_at) }), h('div', { text: m.msg }));
      };
      async function refresh() {
        if (busy || closed || document.hidden) return; busy = true;
        try {
          const rows = await load(), top = rows.length ? rows[rows.length - 1].id : 0;
          if (top !== lastId) {
            const atEnd = lastId < 0 || list.scrollTop + list.clientHeight >= list.scrollHeight - 60; lastId = top;
            list.replaceChildren(...rows.map(bubble)); if (atEnd) list.scrollTop = list.scrollHeight;
          }
          status.textContent = rows.length ? 'Tersambung • memperbarui otomatis' : 'Belum ada pesan. Jadi yang pertama!';
        } catch (e) { status.textContent = e.message + ' — cek internet atau tabel Supabase'; }
        busy = false;
      }
      async function go() {
        const n = nick.value.trim(), t = msg.value.trim(); if (!n) { ML.toast('Isi nama dulu'); nick.focus(); return; } if (!t) return;
        if (Date.now() - lastSend < 1500) { ML.toast('Pelan-pelan, tunggu sebentar'); return; }
        lastSend = Date.now(); ML.lsSet('ml.nick', n); msg.value = '';
        try { await send(n, t); lastId = -1; refresh(); } catch (e) { msg.value = t; ML.toast(e.message, 3500); }
      }
      msg.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
      nick.addEventListener('change', () => { ML.lsSet('ml.nick', nick.value.trim()); lastId = -1; refresh(); });
      body.append(status, list, h('div', { class: 'lbl', style: { margin: '10px 0 0' }, text: 'Nama' }), nick, h('div', { class: 'lbl', style: { margin: '10px 0 0' }, text: 'Pesan' }), msg,
        h('button', { class: 'btn primary wide', text: 'Kirim', onclick: go }));
      refresh(); timer = setInterval(refresh, 3000);
    }, { onClose: () => { closed = true; clearInterval(timer); } });
  }
  return { open };
})();

/* Pintu masuk aplikasi */
(function () {
  ML.homeBack = () => ML.home.back() || ML.confirmTap('Ketuk sekali lagi untuk keluar', () => { if (window.AndroidBridge && AndroidBridge.exitApp) AndroidBridge.exitApp(); else ML.webLeave(); });
  ML.onRootBack = ML.homeBack;
  // Service worker hanya untuk versi web/PWA (di APK aset sudah ada di dalam aplikasi).
  try {
    if ('serviceWorker' in navigator && !window.MotionLynNative && !window.claude && /^https?:$/.test(location.protocol) && location.hostname !== 'appassets.androidplatform.net') {
      navigator.serviceWorker.register('sw.js').catch(() => { });
    }
  } catch (e) { /* sandbox */ }
  // Versi web di-hosting: simpan file lewat kapabilitas "downloads" bila tersedia.
  try { if (window.claude && window.claude.use) window.claude.use('downloads').then(d => { ML.dl = d; }).catch(() => { }); } catch (e) { /* abaikan */ }
  window.addEventListener('error', e => { try { ML.toast('Error: ' + e.message, 3500); } catch (x) { /* abaikan */ } });
  window.addEventListener('unhandledrejection', e => { try { ML.toast('Error: ' + ((e.reason && e.reason.message) || e.reason), 3500); } catch (x) { /* abaikan */ } });
  try { ML.fpsMeter.init(); } catch (e) { /* abaikan */ }
  ML.home.show('home');
})();

