'use strict';
/* Mode Simple: kelompokkan tulang otomatis dari nama (Mixamo, VRM, Blender, dll.) */
ML.boneGroups = list => {
  const g = { ra: [], la: [], rl: [], ll: [], bd: [], hr: [] }, T = { ra: '🤚 Tangan kanan', la: '✋ Tangan kiri', rl: '🦵 Kaki kanan', ll: '🦶 Kaki kiri', bd: '🧍 Badan · leher · kepala', hr: '💇 Rambut' };
  for (const b of list) {
    const n = b.name.toLowerCase().replace(/^mixamorig\d*[:_]?/, '');
    if (/(^|[^a-z])(end|top|nub|ik|pole|target|twist|roll|helper|ctrl|ctl)([^a-z]|$)|finger|thumb|index|middle|ring|pinky|little|toe|eye|jaw|tongue/.test(n)) continue;
    const R = /right|(^|[^a-z])r([^a-z]|$)/.test(n), Lf = /left|(^|[^a-z])l([^a-z]|$)/.test(n); let k, r;
    if (/hair|bang|ponytail|pigtail|braid|fringe|twintail/.test(n)) { k = 'hr'; r = 'Rambut'; }
    else if ((R || Lf) && /arm|shoulder|clavicle|elbow|wrist|hand|palm/.test(n)) { k = R ? 'ra' : 'la'; r = /shoulder|clavicle/.test(n) ? 'Bahu' : /fore|lower|elbow/.test(n) ? 'Lengan bawah' : /hand|wrist|palm/.test(n) ? 'Telapak tangan' : 'Lengan atas'; }
    else if ((R || Lf) && /leg|thigh|knee|calf|shin|ankle|foot/.test(n)) { k = R ? 'rl' : 'll'; r = /upleg|thigh|upper/.test(n) ? 'Paha' : /foot|ankle/.test(n) ? 'Telapak kaki' : 'Betis'; }
    else if (/neck/.test(n)) { k = 'bd'; r = 'Leher'; }
    else if (/head|skull/.test(n)) { k = 'bd'; r = 'Kepala'; }
    else if (/hips|pelvis|spine|chest|torso|waist|abdomen|body/.test(n)) { k = 'bd'; r = /hips|pelvis/.test(n) ? 'Pinggul' : 'Badan'; }
    else continue;
    const a = g[k]; if (r !== 'Badan' && r !== 'Rambut' && a.some(x => x.label === r)) continue; if (k === 'hr' && a.length >= 10) continue; a.push({ i: b.i, label: r, d: b.d });
  }
  return Object.keys(T).map(k => { const a = g[k].sort((p, q) => p.d - q.d || p.i - q.i); for (const nm of ['Badan', 'Rambut']) { const c = a.filter(x => x.label === nm); if (c.length > 1) c.forEach((x, i) => { x.label = nm + ' ' + (i + 1); }); } return { k, label: T[k], segs: a }; }).filter(x => x.segs.length);
};
