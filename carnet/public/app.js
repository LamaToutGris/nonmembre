/* Carnet d'entraînement — l'application (affichage, saisie, calculs). Les données passent par stockage.js. */
(function(){
'use strict';

/* =====================================================================
   Outils
   ===================================================================== */
const $ = (sel, racine) => (racine || document).querySelector(sel);
const SVGNS = 'http://www.w3.org/2000/svg';

function poser(el, attrs, enfants){
  if(attrs) for(const k in attrs){
    const v = attrs[k];
    if(v == null || v === false) continue;
    if(k === 'class') el.setAttribute('class', v);
    else if(k === 'value') el.value = v;
    else if(k.slice(0,2) === 'on') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for(const e of enfants.flat(Infinity)){
    if(e == null || e === false) continue;
    el.append(e.nodeType ? e : document.createTextNode(String(e)));
  }
  return el;
}
const h = (tag, attrs, ...enfants) => poser(document.createElement(tag), attrs, enfants);
const g = (tag, attrs, ...enfants) => poser(document.createElementNS(SVGNS, tag), attrs, enfants);
const copie = v => JSON.parse(JSON.stringify(v));
const nombre = v => typeof v === 'number' && Number.isFinite(v) ? v : null;
const texte = v => typeof v === 'string' ? v : '';
/* La même page sert dans Claude et sur le site autonome (stockage.js y fournit window.claude). */
const SITE = !!window.CARNET_SITE;
const OU_REVENIR = SITE ? 'recharge la page et reconnecte-toi' : 'ouvre l\u2019application depuis ton compte Claude';

/* ---- dates ---- */
const JOURS = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
const MOIS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
const MOIS_COURT = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
const deux = n => String(n).padStart(2,'0');
const isoDe = d => d.getFullYear() + '-' + deux(d.getMonth()+1) + '-' + deux(d.getDate());
const aujourdhui = () => isoDe(new Date());
const estIso = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
function dateDe(iso){ const p = String(iso).split('-').map(Number); return new Date(p[0], (p[1]||1)-1, p[2]||1); }
const maj1 = t => t.charAt(0).toUpperCase() + t.slice(1);
const quantieme = d => d.getDate() === 1 ? '1er' : String(d.getDate());
const annee = d => d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '';
function dateLongue(iso){ const d = dateDe(iso); return maj1(JOURS[d.getDay()]) + ' ' + quantieme(d) + ' ' + MOIS[d.getMonth()] + annee(d); }
function dateCourte(iso){ const d = dateDe(iso); return quantieme(d) + ' ' + MOIS_COURT[d.getMonth()] + annee(d); }
function lundiDe(d){ return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)); }

/* ---- jours du programme et des repas ---- */
const JOURS_PROG = ['LUNDI','MARDI','MERCREDI','JEUDI','VENDREDI','SAMEDI','DIMANCHE'];
const nomJour = j => maj1(String(j).toLowerCase());
const JOURS_REPAS = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
const REPAS = ['Matin','Midi','Goûter','Soir'];

/* ---- nombres ---- */
const nf = new Intl.NumberFormat('fr-FR', {maximumFractionDigits: 2});
const nf1 = new Intl.NumberFormat('fr-FR', {maximumFractionDigits: 1});
const num = v => nf.format(v);
const num1 = v => nf1.format(v);
const arrondi = v => Math.round(v * 100) / 100;
function lire(t){
  const c = String(t).replace(',', '.').replace(/[^0-9.]/g, '');
  if(c === '' || c === '.') return null;
  const n = parseFloat(c);
  return Number.isFinite(n) ? n : null;
}
const signe = v => (v > 0 ? '+' : v < 0 ? '−' : '') + num(Math.abs(arrondi(v)));
const signe1 = v => (v > 0 ? '+' : v < 0 ? '−' : '') + num1(Math.abs(v));
const sansAccent = t => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/* ---- textes d'une performance ---- */
const totalReps = ex => (ex.series || []).reduce((a, s) => a + (s.reps || 0), 0);
function texteReps(ex){
  const reps = (ex.series || []).map(s => s.reps);
  if(!reps.length) return '';
  return reps.every(r => r === reps[0]) ? reps.length + ' × ' + reps[0] : reps.join(', ') + ' reps';
}
function texteSeries(ex){
  const r = texteReps(ex);
  return ex.poids != null ? r + ' à ' + num(ex.poids) + ' kg' : r + ', sans charge';
}
function texteRir(ex){
  const r = (ex.series || []).map(s => s.rir);
  if(!r.length || r.every(x => x == null)) return '';
  if(r.length === 1) return 'RIR ' + r[0];
  if(r.every(x => x === r[0])) return 'RIR ' + r[0] + ' sur chaque série';
  if(r.filter(x => x != null).length === 1 && r[r.length-1] != null) return 'RIR ' + r[r.length-1] + ' sur la dernière série';
  return 'RIR ' + r.map(x => x == null ? '–' : x).join(', ');
}
function allure(minutes, km){
  const t = minutes / km; let m = Math.floor(t), sec = Math.round((t - m) * 60);
  if(sec === 60){ m++; sec = 0; }
  return m + ':' + deux(sec) + ' /km';
}
function texteTemps(ex){
  if(ex.km && ex.minutes) return num(ex.km) + ' km en ' + num(ex.minutes) + ' min';
  if(ex.km) return num(ex.km) + ' km';
  return num(ex.minutes || 0) + ' min';
}
const textePerf = ex => ex.mesure === 'series' ? texteSeries(ex) : texteTemps(ex);

/* =====================================================================
   État
   ===================================================================== */
const CLE_BROUILLON = 'carnet.brouillon.v1';
/* Un exercice du programme est suivi par jour, comme dans le classeur (« LUNDI | Curl barre » ≠ « SAMEDI | Curl barre »). */
const cleDe = (groupe, mesure, jour, nom) => groupe + '|' + mesure + '|' + (mesure === 'series' && jour ? jour : '') + '|' + sansAccent(nom);
const cleEx = e => cleDe(e.groupe, e.mesure, e.jour, e.nom);

const S = {
  onglet: 'seance',
  stockage: 'chargement',     // 'chargement' | 'ok' | 'absent'
  seances: [],                // séances enregistrées, la plus récente d'abord
  reglages: {programme: [], rirMin: 1, cardio: [], kcal: 0, prot: 0},
  aliments: [],
  repas: [],
  index: new Map(),           // exercice -> historique
  brouillon: null,            // séance en cours de saisie
  detail: null,               // exercice ouvert dans Progression
  filtre: 'TOUS',             // jour affiché dans Progression
  ouvertes: new Set(),        // séances dépliées dans le Journal
  nutri: {vue: 'bilan', jour: JOURS_REPAS[(new Date().getDay() + 6) % 7]},
  feuille: null,
  occupe: false,
  aCorriger: -1,
};
let refs = null;

function brouillonVide(){ return {id: null, idNeuf: null, date: aujourdhui(), jour: null, exercices: [], note: ''}; }
function chargerBrouillon(){
  try{
    const b = JSON.parse(localStorage.getItem(CLE_BROUILLON) || 'null');
    if(!b || !Array.isArray(b.exercices) || !estIso(b.date)) return null;
    if(!b.id && !b.exercices.length && !b.note && !b.jour) return null;
    b.exercices = b.exercices.filter(e => e && typeof e.nom === 'string' && (e.mesure === 'series' || e.mesure === 'temps'));
    b.exercices.forEach(e => { if(e.mesure === 'series' && !Array.isArray(e.series)) e.series = [{reps: null, rir: null}]; });
    return {id: b.id || null, idNeuf: b.idNeuf || null, date: b.date, jour: JOURS_PROG.includes(b.jour) ? b.jour : null, exercices: b.exercices, note: texte(b.note)};
  }catch(e){ return null; }
}
let minuteur = 0;
function garderBrouillon(){
  clearTimeout(minuteur);
  minuteur = setTimeout(() => { try{ localStorage.setItem(CLE_BROUILLON, JSON.stringify(S.brouillon)); }catch(e){} }, 250);
}
function oublierBrouillon(){ clearTimeout(minuteur); try{ localStorage.removeItem(CLE_BROUILLON); }catch(e){} }

/* ---- lecture défensive des documents ---- */
function trier(seances){
  return seances.sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : (b.maj || 0) - (a.maj || 0));
}
function exerciceValide(e){
  return e && typeof e.nom === 'string' && e.nom.trim() && (e.groupe === 'muscu' || e.groupe === 'cardio') && (e.mesure === 'series' || e.mesure === 'temps');
}
function seanceLue(id, d){
  if(!d || !estIso(d.date)) return null;
  const exercices = (Array.isArray(d.exercices) ? d.exercices : []).filter(exerciceValide).map(e => {
    if(e.mesure === 'series') return {
      nom: e.nom, groupe: e.groupe, mesure: 'series', jour: JOURS_PROG.includes(e.jour) ? e.jour : null,
      poids: nombre(e.poids),
      series: (Array.isArray(e.series) ? e.series : []).filter(s => s && typeof s.reps === 'number').map(s => ({reps: s.reps, rir: nombre(s.rir)})),
    };
    return {nom: e.nom, groupe: e.groupe, mesure: 'temps', minutes: nombre(e.minutes), km: nombre(e.km)};
  });
  return {id, date: d.date, jour: JOURS_PROG.includes(d.jour) ? d.jour : null, note: texte(d.note), exercices, maj: nombre(d.maj) || 0};
}
function ligneProgLue(p){
  if(!p || typeof p.nom !== 'string' || !p.nom.trim() || !JOURS_PROG.includes(p.jour)) return null;
  if(p.type === 'series') return {jour: p.jour, nom: p.nom, type: 'series', series: nombre(p.series) || 1, repsMin: nombre(p.repsMin) || 1,
    repsMax: nombre(p.repsMax) || nombre(p.repsMin) || 1, rir: texte(p.rir), repos: texte(p.repos), augmentation: texte(p.augmentation), pas: nombre(p.pas) > 0 ? p.pas : 2.5};
  if(p.type === 'temps') return {jour: p.jour, nom: p.nom, type: 'temps', minutes: nombre(p.minutes)};
  if(p.type === 'cardio') return {jour: p.jour, nom: p.nom, type: 'cardio', minMin: nombre(p.minMin), minMax: nombre(p.minMax)};
  return null;
}
function reglagesLus(d){
  d = d || {};
  const rir = nombre(d.rirMin);
  return {
    programme: (Array.isArray(d.programme) ? d.programme : []).map(ligneProgLue).filter(Boolean),
    rirMin: rir == null ? 1 : Math.min(5, Math.max(0, Math.round(rir))),
    cardio: (Array.isArray(d.cardio) ? d.cardio : []).filter(n => typeof n === 'string' && n.trim()),
    kcal: nombre(d.kcal) || 0, prot: nombre(d.prot) || 0,
  };
}
const alimentsLus = d => (d && Array.isArray(d.liste) ? d.liste : []).filter(a => a && typeof a.nom === 'string' && a.nom.trim())
  .map(a => ({nom: a.nom, kcal: nombre(a.kcal) || 0, prot: nombre(a.prot) || 0, note: texte(a.note)}));
const repasLus = d => (d && Array.isArray(d.lignes) ? d.lignes : []).filter(l => l && JOURS_REPAS.includes(l.jour) && REPAS.includes(l.repas) && typeof l.aliment === 'string')
  .map(l => ({jour: l.jour, repas: l.repas, aliment: l.aliment, q: nombre(l.q)}));

/* ---- index : pour chaque exercice, la suite de ses séances ---- */
function construireIndex(){
  const idx = new Map();
  const poser = (k, o) => { if(!idx.has(k)) idx.set(k, Object.assign({cle: k, prog: null, histo: []}, o)); return idx.get(k); };
  for(const p of S.reglages.programme){
    if(p.type === 'series') poser(cleDe('muscu', 'series', p.jour, p.nom), {nom: p.nom, groupe: 'muscu', mesure: 'series', jour: p.jour}).prog = p;
    else if(p.type === 'temps') poser(cleDe('muscu', 'temps', null, p.nom), {nom: p.nom, groupe: 'muscu', mesure: 'temps', jour: null, minutes: p.minutes});
  }
  for(const n of S.reglages.cardio) poser(cleDe('cardio', 'temps', null, n), {nom: n, groupe: 'cardio', mesure: 'temps', jour: null});
  for(const se of [...S.seances].reverse()) se.exercices.forEach((ex, ordre) => {
    const it = poser(cleEx(ex), {nom: ex.nom, groupe: ex.groupe, mesure: ex.mesure, jour: ex.mesure === 'series' ? ex.jour || null : null});
    it.histo.push({date: se.date, seanceId: se.id, ordre, ex});
  });
  S.index = idx;
}

/* =====================================================================
   Calculs repris du classeur
   ===================================================================== */
const joursDuProgramme = () => JOURS_PROG.filter(j => S.reglages.programme.some(p => p.jour === j));
const lignesDuJour = j => S.reglages.programme.filter(p => p.jour === j);
const texteObjectif = P => P.series + ' × ' + P.repsMin + '–' + P.repsMax;
function texteCible(P){
  if(P.type === 'series') return [texteObjectif(P), P.rir && P.rir !== '—' ? 'RIR ' + P.rir : '', P.repos && P.repos !== '—' ? 'repos ' + P.repos : ''].filter(Boolean).join(', ');
  if(P.type === 'temps') return P.minutes ? num(P.minutes) + ' min' : '';
  return P.minMin && P.minMax ? num(P.minMin) + ' à ' + num(P.minMax) + ' min' : P.minMin ? num(P.minMin) + ' min' : '';
}
/* JOURNAL : décision = toutes les séries faites, toutes au maximum de reps, et RIR de la dernière série suffisant. */
function decision(ex, P){
  if(!P || ex.poids == null || !ex.series.length) return '';
  const reps = ex.series.map(s => s.reps), rir = ex.series[ex.series.length - 1].rir || 0;
  return reps.length >= P.series && Math.min(...reps) >= P.repsMax && rir >= S.reglages.rirMin ? 'AUGMENTER' : 'CONSERVER';
}
function chargeSuivante(ex, P){ const d = decision(ex, P); return d === '' ? null : d === 'AUGMENTER' ? arrondi(ex.poids + P.pas) : ex.poids; }
const forceEstimee = ex => ex.poids == null || !ex.series.length ? null : Math.round(ex.poids * (1 + Math.max(...ex.series.map(s => s.reps)) / 30) * 10) / 10;
const volume = ex => ex.mesure !== 'series' || ex.poids == null || !ex.series.length ? null : arrondi(ex.poids * totalReps(ex));
/* PROGRESSION : « objectif prochaine séance » */
function consigne(ex, P){
  if(!ex) return 'Première séance : note ta charge';
  const reps = ex.series.map(s => s.reps);
  if(decision(ex, P) === 'AUGMENTER') return 'Nouvelle charge → repars à ' + P.repsMin + ' reps par série';
  if(reps.length < P.series) return 'Fais toutes tes séries (' + P.series + ') à cette charge';
  if(Math.min(...reps) >= P.repsMax) return 'Reps max atteintes mais RIR trop bas : refais ' + P.repsMax + ' reps avec ' + S.reglages.rirMin + ' RIR';
  return 'Même charge : vise ' + (Math.min(...reps) + 1) + ' reps sur chaque série';
}
const libelleDecision = d => d === 'AUGMENTER' ? 'Augmenter' : d === 'CONSERVER' ? 'Conserver' : '';
const badge = d => d ? h('span', {class: 'ecart' + (d === 'AUGMENTER' ? ' hausse' : '')}, libelleDecision(d)) : null;

/* NUTRITION : kcal et protéines d'une ligne, totaux par repas et par jour */
function nutrition(){
  const al = new Map(S.aliments.map(a => [sansAccent(a.nom), a]));
  const jours = new Map(JOURS_REPAS.map(j => [j, {jour: j, kcal: 0, prot: 0, repas: new Map(REPAS.map(r => [r, {kcal: 0, prot: 0, lignes: []}]))}]));
  S.repas.forEach((l, rang) => {
    const J = jours.get(l.jour), R = J && J.repas.get(l.repas);
    if(!R) return;
    const a = al.get(sansAccent(l.aliment));
    const v = a && l.q != null ? {kcal: Math.round(l.q * a.kcal / 100), prot: Math.round(l.q * a.prot / 10) / 10} : null;
    R.lignes.push({l, rang, v, connu: !!a});
    if(v){ R.kcal += v.kcal; R.prot += v.prot; J.kcal += v.kcal; J.prot += v.prot; }
  });
  for(const J of jours.values()){ J.prot = Math.round(J.prot * 10) / 10; for(const R of J.repas.values()) R.prot = Math.round(R.prot * 10) / 10; }
  return jours;
}
function conseil(total, ecart){
  if(total === 0) return '';
  if(ecart < -100) return 'Ajoute ~' + num(Math.round(-ecart / 10) * 10) + ' kcal (ex : 20 g de noix ≈ 130 kcal)';
  if(ecart > 100) return 'Au-dessus de l\u2019objectif (+' + num(Math.round(ecart / 10) * 10) + ' kcal)';
  return '✔ Dans l\u2019objectif';
}

/* =====================================================================
   Stockage (données privées de la personne connectée)
   ===================================================================== */
async function ecrire(action){
  const limite = () => new Promise((_, non) => setTimeout(() => non({code: 'unavailable'}), 15000));
  try{ return await Promise.race([action(), limite()]); }
  catch(e){
    if(!e || e.code !== 'unavailable') throw e;
    await new Promise(ok => setTimeout(ok, 500 + Math.random() * 700));
    return await Promise.race([action(), limite()]);
  }
}
function messageErreur(e){
  if(e && e.code === 'quota_exceeded') return "Espace de stockage plein : supprime d'anciennes séances pour en enregistrer de nouvelles.";
  if(e && (e.code === 'invalid_argument' || e.code === 'revoked' || e.code === 'not_granted')) return 'Enregistrement refusé : ' + OU_REVENIR + '.';
  return "Enregistrement impossible pour l'instant. Ta séance reste ici : réessaie quand tu as du réseau.";
}

/* Un dépôt = un document de réglages. Une seule écriture à la fois ; tant qu'un changement local attend, il prime sur ce qui arrive du serveur. */
function creerDepot(nomRef, donnees, delai){
  let attenteEcriture = 0, enCours = false, sale = false;
  const d = {
    attente: false,
    demander(){ d.attente = true; clearTimeout(attenteEcriture); attenteEcriture = setTimeout(d.vider, delai); },
    maintenant(){ d.attente = true; clearTimeout(attenteEcriture); return d.vider(); },
    async vider(){
      if(enCours){ sale = true; return true; }
      enCours = true; sale = false;
      let ok = true;
      try{ await pret; if(!refs) throw {code: 'not_granted'}; const corps = donnees(); await ecrire(() => refs[nomRef].set(corps)); }
      catch(e){ ok = false; annoncer(e && e.code === 'unavailable' || !e || !e.code ? 'Modification non enregistrée pour l\u2019instant : elle repartira au prochain changement.' : 'Modification refusée : ' + OU_REVENIR + '.'); }
      enCours = false;
      if(sale) return d.vider();
      d.attente = !ok;
      return ok;
    },
  };
  return d;
}
const depots = {
  reglages: creerDepot('reglages', () => copie(S.reglages), 600),
  aliments: creerDepot('aliments', () => ({liste: copie(S.aliments)}), 300),
  repas: creerDepot('repas', () => ({lignes: copie(S.repas)}), 800),
};

const pret = (async () => {
  try{
    await null;   /* laisse le reste du script s'installer avant le premier rendu */
    const c = window.claude;
    if(!c || typeof c.use !== 'function') throw new Error('absent');
    const [db, user] = await Promise.all([c.use('db'), c.use('user')]);
    if(!db || !user) throw new Error('absent');
    const uid = await user.id();
    if(!uid) throw new Error('absent');
    const base = 'data/users/' + uid;
    refs = {seances: db.doc(base + '/journal').collection('seances'), reglages: db.doc(base + '/reglages'), aliments: db.doc(base + '/aliments'), repas: db.doc(base + '/repas')};
    const perdu = () => { S.stockage = 'absent'; toutRendre(); };
    const corps = snap => snap.exists ? snap.data() : null;
    refs.reglages.onSnapshot(snap => { if(depots.reglages.attente) return; S.reglages = reglagesLus(corps(snap)); donneesChangees(); }, perdu);
    refs.aliments.onSnapshot(snap => { if(depots.aliments.attente) return; S.aliments = alimentsLus(corps(snap)); donneesChangees(); }, perdu);
    refs.repas.onSnapshot(snap => { if(depots.repas.attente) return; S.repas = repasLus(corps(snap)); donneesChangees(); }, perdu);
    refs.seances.orderBy('date', 'desc').limit(1000).onSnapshot(snap => {
      S.seances = trier(snap.docs.map(d => seanceLue(d.id, d.data())).filter(Boolean));
      S.stockage = 'ok';
      donneesChangees();
    }, perdu);
  }catch(e){
    S.stockage = 'absent';
    toutRendre();
  }
})();

/* Les données ont changé : on redessine, sans toucher à un champ en cours de saisie. */
function donneesChangees(){
  construireIndex();
  const actif = document.activeElement;
  const saisie = vue => actif && actif !== document.body && $('#vue-' + vue).contains(actif) && /^(INPUT|TEXTAREA|SELECT)$/.test(actif.tagName);
  if(!saisie('seance')) rendreSeance(); else rendreBarre();
  rendreProgramme(); rendreProgression(); rendreJournal();
  if(!saisie('nutrition')) rendreNutrition();
  if(S.feuille && S.feuille.rafraichir) S.feuille.rafraichir();
}

/* =====================================================================
   Bandeau d'info, boutons en deux temps, champs −/+
   ===================================================================== */
let finToast = 0;
function annoncer(t){
  const el = $('#toast');
  el.textContent = t; el.hidden = false;
  clearTimeout(finToast);
  finToast = setTimeout(() => { el.hidden = true; }, 3800);
}
/* Premier appui : le bouton demande confirmation. Second appui : l'action part. */
function deuxTemps(bouton, texteConfirmation, action){
  const texteInitial = bouton.textContent;
  let retour = 0;
  bouton.addEventListener('click', () => {
    if(bouton.dataset.arme === '1'){ clearTimeout(retour); action(); return; }
    bouton.dataset.arme = '1'; bouton.textContent = texteConfirmation;
    retour = setTimeout(() => { bouton.dataset.arme = '0'; bouton.textContent = texteInitial; }, 3500);
  });
  return bouton;
}
function pasAPas(o){
  const input = h('input', {type: 'text', inputmode: o.entier ? 'numeric' : 'decimal', autocomplete: 'off', enterkeyhint: 'done',
    'aria-label': o.label, placeholder: '–', value: o.valeur == null ? '' : num(o.valeur)});
  const fixer = v => { v = v == null ? null : Math.max(0, arrondi(v)); input.value = v == null ? '' : num(v); o.change(v); };
  input.addEventListener('input', () => o.change(lire(input.value)));
  input.addEventListener('focus', () => { try{ input.select(); }catch(e){} });
  input.addEventListener('blur', () => { const v = lire(input.value); input.value = v == null ? '' : num(v); });
  input.addEventListener('keydown', ev => { if(ev.key === 'Enter') input.blur(); });
  return h('div', {class: 'pas' + (o.petit ? ' petit' : '')},
    h('button', {type: 'button', 'aria-label': 'Diminuer : ' + o.label, onclick: () => { const v = lire(input.value); if(v != null) fixer(v - o.pas); }}, '−'),
    input,
    h('button', {type: 'button', 'aria-label': 'Augmenter : ' + o.label, onclick: () => { const v = lire(input.value); fixer(v == null ? o.pas : v + o.pas); }}, '+'));
}
function puces(options, valeur, action, nom){
  return h('div', {class: 'puces', role: 'group', 'aria-label': nom},
    options.map(([v, t]) => h('button', {type: 'button', 'aria-pressed': String(v === valeur), onclick: () => action(v)}, t)));
}

/* ---- feuilles (panneaux qui montent du bas) ---- */
function ouvrirFeuille(titre, corps, etat){
  fermerFeuille();
  S.feuille = etat || {};
  const voile = $('#voile');
  const feuille = h('div', {class: 'feuille', role: 'dialog', 'aria-modal': 'true', 'aria-label': titre, tabindex: '-1'},
    h('div', {class: 'feuille-tete'}, h('h2', null, titre), h('button', {type: 'button', class: 'btn discret', onclick: fermerFeuille}, 'Fermer')),
    corps);
  voile.replaceChildren(feuille);
  voile.hidden = false;
  document.body.style.overflow = 'hidden';
  calerFeuille();
  feuille.focus({preventScroll: true});
}
function fermerFeuille(){
  S.feuille = null;
  const voile = $('#voile');
  voile.hidden = true; voile.replaceChildren(); calerFeuille();
  document.body.style.overflow = '';
}
$('#voile').addEventListener('click', ev => { if(ev.target === ev.currentTarget) fermerFeuille(); });
document.addEventListener('keydown', ev => { if(ev.key === 'Escape' && S.feuille) fermerFeuille(); });
/* Clavier ouvert : la feuille se cale sur la partie visible de l'écran quand le navigateur la communique. */
function calerFeuille(){
  const v = $('#voile'), vv = window.visualViewport;
  if(!vv || v.hidden){ v.style.height = ''; v.style.top = ''; return; }
  v.style.height = vv.height + 'px'; v.style.top = vv.offsetTop + 'px';
}
if(window.visualViewport){ visualViewport.addEventListener('resize', calerFeuille); visualViewport.addEventListener('scroll', calerFeuille); }
const alerteAbsent = marge => h('p', {class: 'alerte', role: 'alert', style: marge ? 'margin-top:14px' : null},
  SITE ? 'Tes données ne sont pas accessibles pour l\u2019instant. Vérifie ta connexion, puis recharge la page.'
       : 'Tes données ne sont pas accessibles ici. Ouvre l\u2019application depuis ton compte Claude pour les retrouver et les modifier.');

/* =====================================================================
   Vue « Séance » : saisie
   ===================================================================== */
function choixRir(serie, n){
  const boutons = [0, 1, 2, 3].map(() => h('button', {type: 'button'}));
  const peindre = () => boutons.forEach((b, v) => {
    const actif = serie.rir != null && (v === 3 ? serie.rir >= 3 : serie.rir === v);
    b.setAttribute('aria-pressed', String(actif));
    b.textContent = v < 3 ? String(v) : actif ? String(serie.rir) : '3+';
    b.setAttribute('aria-label', 'RIR ' + (v < 3 ? v : actif ? serie.rir : '3 ou plus') + ', série ' + n);
  });
  boutons.forEach((b, v) => b.addEventListener('click', () => {
    /* le dernier bouton monte 3, 4, 5 à chaque appui (le classeur accepte un RIR de 0 à 5) */
    if(v < 3) serie.rir = serie.rir === v ? null : v;
    else serie.rir = serie.rir == null || serie.rir < 3 ? 3 : serie.rir < 5 ? serie.rir + 1 : null;
    peindre(); garderBrouillon();
  }));
  peindre();
  return h('div', {class: 'rir', role: 'group', 'aria-label': 'RIR de la série ' + n}, boutons);
}

function dernierAvant(e){
  const item = S.index.get(cleEx(e));
  if(!item) return null;
  const b = S.brouillon;
  for(let i = item.histo.length - 1; i >= 0; i--){
    const p = item.histo[i];
    if(p.seanceId !== b.id && p.date <= b.date) return p;
  }
  return null;
}

function carteExercice(e, i){
  const item = S.index.get(cleEx(e));
  const P = item && item.prog;
  const avant = dernierAvant(e);
  const lignes = [];
  if(P) lignes.push(h('p', {class: 'rappel'}, 'Objectif ' + texteCible(P) + '.'));
  if(avant){
    const rir = avant.ex.mesure === 'series' ? texteRir(avant.ex) : '';
    lignes.push(h('p', {class: 'rappel'}, 'Dernière fois, le ' + dateCourte(avant.date) + ' : ' + textePerf(avant.ex) + (rir ? ' (' + rir + ')' : '') + '.'));
  } else if(!S.brouillon.id && !(item && item.histo.length) && !P) lignes.push(h('p', {class: 'rappel'}, 'Première fois que tu notes cet exercice.'));
  if(P && !S.brouillon.id) lignes.push(h('p', {class: 'consigne'}, consigne(avant ? avant.ex : null, P)));

  const retirer = deuxTemps(h('button', {type: 'button', class: 'retirer', 'aria-label': 'Retirer ' + e.nom}, '✕'), 'Retirer ?', () => {
    S.brouillon.exercices.splice(i, 1); S.aCorriger = -1; garderBrouillon(); rendreSeance();
  });

  const corps = [];
  if(e.mesure === 'series'){
    corps.push(h('div', {class: 'champ'}, h('span', {class: 'champ-nom'}, 'Poids (kg)'),
      pasAPas({label: 'Poids en kilos, ' + e.nom, valeur: e.poids, pas: (P && P.pas) || 2.5, change: v => { e.poids = v; garderBrouillon(); }})));
    const rangs = e.series.map((s, j) => h('div', {class: 'serie'},
      h('span', {class: 'n', 'aria-hidden': 'true'}, j + 1),
      pasAPas({label: 'Répétitions, série ' + (j + 1), valeur: s.reps, pas: 1, entier: true, petit: true, change: v => { s.reps = v; garderBrouillon(); }}),
      choixRir(s, j + 1)));
    const pied = [h('button', {type: 'button', class: 'btn discret', onclick: () => {
      const d = e.series[e.series.length - 1];
      e.series.push({reps: d ? d.reps : null, rir: null}); garderBrouillon(); rendreSeance();
    }}, '+ Ajouter une série')];
    if(e.series.length > 1) pied.push(h('button', {type: 'button', class: 'btn discret', onclick: () => { e.series.pop(); garderBrouillon(); rendreSeance(); }}, 'Retirer la dernière'));
    corps.push(h('div', {class: 'series'},
      h('div', {class: 'series-tete', 'aria-hidden': 'true'}, h('span'), h('span', null, 'Répétitions'), h('span', null, 'RIR')),
      rangs, h('div', {class: 'series-pied'}, pied)));
  } else {
    const duree = h('div', {class: 'champ'}, h('span', {class: 'champ-nom'}, 'Durée (min)'),
      pasAPas({label: 'Durée en minutes, ' + e.nom, valeur: e.minutes, pas: 5, change: v => { e.minutes = v; garderBrouillon(); majTotalCardio(); }}));
    if(e.groupe === 'cardio') corps.push(h('div', {class: 'duo'}, duree,
      h('div', {class: 'champ'}, h('span', {class: 'champ-nom'}, 'Distance (km), facultatif'),
        pasAPas({label: 'Distance en kilomètres, ' + e.nom, valeur: e.km, pas: 0.5, change: v => { e.km = v; garderBrouillon(); }}))));
    else corps.push(duree);
  }

  const carte = h('article', {class: 'carte' + (S.aCorriger === i ? ' a-corriger' : ''), 'data-rang': i},
    h('div', {class: 'carte-tete'}, h('h2', {class: 'carte-nom'}, e.nom), retirer),
    lignes, corps);
  const corrige = () => { if(S.aCorriger === i){ S.aCorriger = -1; carte.classList.remove('a-corriger'); } };
  carte.addEventListener('input', corrige); carte.addEventListener('click', corrige);
  return carte;
}

/* Jeudi : « Hyrox / Course / Cardio, 45 à 75 min » → le total de la séance se compare à cet objectif */
function texteTotalCardio(exercices, jour){
  const c = exercices.filter(e => e.groupe === 'cardio');
  if(!c.length) return '';
  const total = c.reduce((a, e) => a + (e.minutes || 0), 0);
  const P = jour ? lignesDuJour(jour).find(p => p.type === 'cardio') : null;
  return 'Total cardio : ' + num(total) + ' min' + (P && texteCible(P) ? ' (objectif ' + texteCible(P) + ')' : '') + '.';
}
function majTotalCardio(){ const el = $('#total-cardio'); if(el) el.textContent = texteTotalCardio(S.brouillon.exercices, S.brouillon.jour); }

/* Liste des séances du programme, pour démarrer */
function listeProgrammes(choisir){
  const rangs = joursDuProgramme().map(j => h('button', {type: 'button', class: 'ligne', onclick: () => choisir(j)},
    h('span', {class: 'ligne-rang'}, h('span', {class: 'ligne-nom'}, nomJour(j))),
    h('span', {class: 'ligne-detail'}, lignesDuJour(j).map(p => p.nom).join(', '))));
  rangs.push(h('button', {type: 'button', class: 'ligne', onclick: () => choisir(null)},
    h('span', {class: 'ligne-rang'}, h('span', {class: 'ligne-nom'}, 'Séance libre')),
    h('span', {class: 'ligne-detail'}, 'Choisir les exercices un par un')));
  return h('div', {class: 'liste multi'}, rangs);
}

function resteAuProgramme(b){
  const dans = new Set(b.exercices.map(cleEx));
  const rangs = [];
  for(const P of lignesDuJour(b.jour)){
    if(P.type === 'cardio'){
      rangs.push(h('button', {type: 'button', class: 'ligne', onclick: () => ouvrirAjout('cardio')},
        h('span', {class: 'ligne-rang'}, h('span', {class: 'ligne-nom'}, P.nom), h('span', {class: 'ligne-valeur'}, texteCible(P))),
        h('span', {class: 'ligne-detail'}, 'Touche pour ajouter une activité (course, vélo, rowing…)')));
      continue;
    }
    const k = P.type === 'series' ? cleDe('muscu', 'series', P.jour, P.nom) : cleDe('muscu', 'temps', null, P.nom);
    const it = S.index.get(k);
    if(!it || dans.has(k)) continue;
    const avant = dernierAvant({nom: it.nom, groupe: it.groupe, mesure: it.mesure, jour: it.jour});
    const aPrendre = P.type === 'series' && avant ? chargeSuivante(avant.ex, P) : null;
    rangs.push(h('button', {type: 'button', class: 'ligne', onclick: () => ajouter(it)},
      h('span', {class: 'ligne-rang'}, h('span', {class: 'ligne-nom'}, P.nom), h('span', {class: 'ligne-valeur'}, P.type === 'series' ? (aPrendre != null ? num(aPrendre) + ' kg' : '') : texteCible(P))),
      P.type === 'series' ? h('span', {class: 'ligne-detail'}, texteCible(P)) : null));
  }
  return rangs;
}

function rendreSeance(){
  const b = S.brouillon;
  const blocs = [];
  if(S.stockage === 'absent') blocs.push(alerteAbsent());

  const champDate = h('input', {type: 'date', 'aria-label': 'Date de la séance', value: b.date, max: '2100-12-31'});
  champDate.addEventListener('change', () => { if(estIso(champDate.value)){ b.date = champDate.value; garderBrouillon(); rendreSeance(); } });
  champDate.addEventListener('click', () => { try{ champDate.showPicker(); }catch(e){} });
  blocs.push(h('header', null,
    h('p', {class: 'etat'}, b.id ? 'Modification de la séance' : 'Nouvelle séance'),
    h('div', {class: 'date'},
      h('h1', {class: 'titre'}, dateLongue(b.date)),
      h('span', {class: 'aide', 'aria-hidden': 'true'}, 'Changer la date'),
      champDate)));

  const aUnProgramme = S.reglages.programme.length > 0;
  if(!b.jour && !b.exercices.length){
    if(aUnProgramme){
      blocs.push(h('h2', {class: 'rubrique'}, 'Quelle séance fais-tu ?'), listeProgrammes(j => { if(j){ b.jour = j; garderBrouillon(); rendreSeance(); } else ouvrirAjout(); }));
    } else {
      blocs.push(h('div', {class: 'vide'},
        h('p', null, S.stockage === 'chargement' ? 'Chargement de ton programme…' : 'Rien de noté pour cette séance.'),
        h('button', {type: 'button', class: 'btn principal large', onclick: () => ouvrirAjout()}, 'Ajouter un exercice')));
    }
  } else {
    if(aUnProgramme) blocs.push(h('div', {class: 'programme-choisi'},
      h('span', null, b.jour ? 'Programme du ' + b.jour.toLowerCase() : 'Séance libre'),
      h('button', {type: 'button', class: 'btn discret petit', onclick: () => ouvrirFeuille('Quelle séance fais-tu ?',
        h('div', {class: 'feuille-liste', style: 'padding:8px 16px 16px'}, listeProgrammes(j => { b.jour = j; garderBrouillon(); fermerFeuille(); rendreSeance(); })))}, 'Changer')));
    if(b.exercices.length) blocs.push(h('div', {class: 'grille'}, b.exercices.map(carteExercice)));
    const total = texteTotalCardio(b.exercices, b.jour);
    if(total) blocs.push(h('p', {class: 'consigne', id: 'total-cardio'}, total));
    const reste = b.jour ? resteAuProgramme(b) : [];
    if(reste.length) blocs.push(h('h2', {class: 'rubrique'}, b.exercices.length ? 'Reste au programme' : 'Au programme'),
      h('p', {class: 'explication'}, 'Touche un exercice pour le noter. Ceux que tu ne touches pas ne sont pas enregistrés.'), h('div', {class: 'liste multi'}, reste));
    blocs.push(h('div', {class: 'ajout'}, h('button', {type: 'button', class: 'btn large', onclick: () => ouvrirAjout()}, b.jour ? '+ Ajouter un autre exercice' : '+ Ajouter un exercice')));
    if(b.exercices.length || b.note){
      const note = h('textarea', {rows: 2, placeholder: 'Forme du jour, fatigue, douleur…', maxlength: 600, value: b.note || ''});
      note.addEventListener('input', () => { b.note = note.value; garderBrouillon(); });
      blocs.push(h('label', {class: 'note'}, h('span', {class: 'champ-nom'}, 'Note (facultatif)'), note));
    }
  }
  $('#vue-seance').replaceChildren(...blocs);
  rendreBarre();
}

function rendreBarre(){
  const barre = $('#barre'), b = S.brouillon;
  const visible = S.onglet === 'seance' && (b.exercices.length > 0 || b.id);
  barre.hidden = !visible;
  if(!visible) return;
  const boutons = [];
  if(b.id) boutons.push(h('button', {type: 'button', class: 'btn', onclick: () => { S.brouillon = brouillonVide(); S.aCorriger = -1; oublierBrouillon(); rendreSeance(); aller('journal'); }}, 'Annuler'));
  boutons.push(h('button', {type: 'button', class: 'btn principal', disabled: S.occupe || S.stockage === 'absent' || !b.exercices.length, onclick: enregistrer},
    S.occupe ? 'Enregistrement…' : (b.id ? 'Enregistrer' : 'Enregistrer la séance')));
  $('#barre-in').replaceChildren(...boutons);
}

function signaler(i, t){
  S.aCorriger = i; rendreSeance(); annoncer(t);
  const carte = $('#vue-seance [data-rang="' + i + '"]');
  if(carte) carte.scrollIntoView({block: 'center', behavior: 'smooth'});
}

async function enregistrer(){
  if(S.occupe) return;
  const b = S.brouillon, propres = [];
  for(let i = 0; i < b.exercices.length; i++){
    const e = b.exercices[i];
    if(e.mesure === 'series'){
      const series = e.series.filter(s => s.reps != null && s.reps > 0).map(s => ({reps: Math.round(s.reps), rir: s.rir == null ? null : s.rir}));
      if(!series.length) return signaler(i, 'Indique les répétitions de « ' + e.nom + ' », ou retire l\u2019exercice.');
      propres.push({nom: e.nom, groupe: e.groupe, mesure: 'series', jour: e.jour || null, poids: e.poids != null && e.poids >= 0 ? e.poids : null, series});
    } else {
      const minutes = e.minutes != null && e.minutes > 0 ? e.minutes : null;
      const km = e.groupe === 'cardio' && e.km != null && e.km > 0 ? e.km : null;
      if(minutes == null && km == null) return signaler(i, 'Indique la durée de « ' + e.nom + ' », ou retire l\u2019exercice.');
      propres.push({nom: e.nom, groupe: e.groupe, mesure: 'temps', minutes, km});
    }
  }
  S.aCorriger = -1; S.occupe = true; rendreBarre();
  try{
    await pret;
    if(!refs || S.stockage === 'absent') throw {code: 'not_granted'};
    /* L'identifiant d'une nouvelle séance est choisi une fois : un nouvel essai réécrit la même séance. */
    if(!b.id && !b.idNeuf){ b.idNeuf = refs.seances.doc().id; garderBrouillon(); }
    const id = b.id || b.idNeuf;
    const donnees = {date: b.date, jour: b.jour || null, note: (b.note || '').trim(), exercices: propres, maj: Date.now()};
    await ecrire(() => refs.seances.doc(id).set(donnees));
    const nouvelle = !b.id;
    S.seances = trier(S.seances.filter(x => x.id !== id).concat([seanceLue(id, copie(donnees))]));
    S.brouillon = brouillonVide(); oublierBrouillon();
    S.occupe = false; S.detail = null;
    construireIndex(); rendreSeance(); rendreJournal();
    aller(nouvelle ? 'progression' : 'journal');
    annoncer(nouvelle ? 'Séance enregistrée' : 'Séance modifiée');
  }catch(e){
    S.occupe = false; rendreBarre();
    annoncer(messageErreur(e));
  }
}

/* ---- feuille d'ajout d'un exercice ---- */
const nomPropre = t => maj1(String(t).replace(/\s+/g, ' ').trim()).slice(0, 60);

function ouvrirAjout(groupeVoulu){
  const ex = S.brouillon.exercices;
  const etat = {groupe: groupeVoulu || (ex.length ? ex[ex.length - 1].groupe : 'muscu'), recherche: '', rafraichir: rendreChoix};
  const recherche = h('input', {type: 'search', 'aria-label': 'Rechercher ou créer un exercice', placeholder: 'Rechercher ou créer un exercice', autocomplete: 'off', enterkeyhint: 'search'});
  recherche.addEventListener('input', () => { etat.recherche = recherche.value; rendreChoix(); });
  const bascule = h('div', {class: 'bascule', role: 'group', 'aria-label': "Type d'exercice"},
    [['muscu', 'Musculation'], ['cardio', 'Cardio']].map(([v, nom]) => h('button', {type: 'button', 'data-groupe': v, 'aria-pressed': String(etat.groupe === v), onclick: () => {
      etat.groupe = v;
      bascule.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.groupe === v)));
      rendreChoix();
    }}, nom)));
  ouvrirFeuille('Ajouter un exercice', [bascule, h('div', {class: 'recherche'}, recherche), h('div', {class: 'feuille-liste', id: 'choix'})], etat);
  rendreChoix();
}

function rendreChoix(){
  const boite = $('#choix'); if(!boite || !S.feuille) return;
  const {groupe, recherche} = S.feuille;
  const q = sansAccent(recherche), b = S.brouillon;
  const dans = new Set(b.exercices.map(cleEx));
  const dernier = it => it.histo.length ? it.histo[it.histo.length - 1] : null;
  let items = [...S.index.values()].filter(it => it.groupe === groupe).map((it, rang) => ({it, rang})).sort((x, y) => {
    const jx = b.jour && x.it.jour === b.jour ? 0 : 1, jy = b.jour && y.it.jour === b.jour ? 0 : 1;   /* le programme du jour d'abord */
    if(jx !== jy) return jx - jy;
    const dx = dernier(x.it), dy = dernier(y.it);
    if(dx && dy && dx.date !== dy.date) return dx.date < dy.date ? 1 : -1;
    if(!!dx !== !!dy) return dx ? -1 : 1;
    return x.rang - y.rang;
  }).map(x => x.it);
  if(q) items = items.filter(it => sansAccent(it.nom).includes(q));

  const lignes = items.map(it => {
    const d = dernier(it), pris = dans.has(it.cle);
    const sous = it.prog ? nomJour(it.jour) + ', ' + texteObjectif(it.prog) : it.mesure === 'series' && it.jour ? nomJour(it.jour) : '';
    return h('button', {type: 'button', class: 'choix', disabled: pris, onclick: () => ajouter(it)},
      h('span', {class: 'choix-nom'}, it.nom),
      h('span', {class: 'choix-info'}, pris ? 'Déjà dans la séance' : d ? (it.mesure === 'series' ? (d.ex.poids != null ? num(d.ex.poids) + ' kg' : texteReps(d.ex)) : texteTemps(d.ex)) : ''),
      sous ? h('span', {class: 'choix-sous'}, sous) : null);
  });

  const propre = nomPropre(recherche);
  const existe = propre && [...S.index.values()].some(it => it.groupe === groupe && sansAccent(it.nom) === sansAccent(propre));
  if(propre && !existe){
    const creer = (mesure, sous) => h('button', {type: 'button', class: 'choix creer', onclick: () => ajouter({cle: cleDe(groupe, mesure, null, propre), nom: propre, groupe, mesure, jour: null, prog: null, histo: []})},
      h('span', {class: 'choix-nom'}, 'Créer « ' + propre + ' »'), h('span'), h('span', {class: 'choix-sous'}, sous));
    if(groupe === 'muscu') lignes.push(creer('series', 'avec un poids et des séries'), creer('temps', 'au temps, en minutes'));
    else lignes.push(creer('temps', 'durée et distance'));
  }
  if(!lignes.length) lignes.push(h('p', {class: 'feuille-vide'}, S.stockage === 'chargement' ? 'Chargement de tes exercices…' : 'Écris le nom de ton exercice dans le champ ci-dessus pour le créer.'));
  boite.replaceChildren(...lignes);
}

function ajouter(it){
  const b = S.brouillon, P = it.prog;
  const e = {nom: it.nom, groupe: it.groupe, mesure: it.mesure};
  if(it.mesure === 'series'){
    e.jour = it.jour || null;
    if(!S.index.has(it.cle)) S.index.set(it.cle, it);   /* exercice tout juste créé : reste connu pendant la saisie */
    const avant = dernierAvant(e);
    if(P && avant && decision(avant.ex, P) === 'AUGMENTER'){
      /* « Nouvelle charge → repars à N reps par série » */
      e.poids = chargeSuivante(avant.ex, P);
      e.series = Array.from({length: P.series}, () => ({reps: P.repsMin, rir: null}));
    } else if(avant){
      e.poids = avant.ex.poids;
      e.series = avant.ex.series.map(s => ({reps: s.reps, rir: null}));
      while(P && e.series.length < P.series) e.series.push({reps: null, rir: null});
    } else {
      e.poids = null;
      e.series = Array.from({length: P ? P.series : 1}, () => ({reps: null, rir: null}));
    }
  } else {
    if(!S.index.has(it.cle)) S.index.set(it.cle, it);
    const avant = dernierAvant(e);
    e.minutes = avant && avant.ex.minutes != null ? avant.ex.minutes : it.minutes || null;
    e.km = null;
  }
  b.exercices.push(e); garderBrouillon();
  fermerFeuille(); rendreSeance();
  const carte = $('#vue-seance [data-rang="' + (b.exercices.length - 1) + '"]');
  if(carte) carte.scrollIntoView({block: 'center', behavior: 'smooth'});
}

/* =====================================================================
   Vue « Programme »
   ===================================================================== */
function commencer(jour){
  S.brouillon = brouillonVide(); S.brouillon.jour = jour; S.aCorriger = -1;
  garderBrouillon(); rendreSeance(); aller('seance');
}
const brouillonEnCours = () => S.brouillon.exercices.length > 0 || !!S.brouillon.note || !!S.brouillon.id;

function rendreProgramme(){
  const blocs = [h('h1', {class: 'titre'}, 'Programme')];
  if(S.stockage === 'chargement') blocs.push(h('p', {class: 'sous-titre'}, 'Chargement de ton programme…'));
  else if(S.stockage === 'absent') blocs.push(alerteAbsent(true));
  else {
    blocs.push(h('p', {class: 'sous-titre'}, 'Ton plan d\u2019entraînement. L\u2019incrément est le nombre de kilos que tu ajoutes quand tu réussis. Objectifs, charges à prendre et décisions se basent sur ce tableau. Touche un exercice pour le modifier.'));
    blocs.push(h('div', {class: 'colonnes'}, joursDuProgramme().map(j => {
      const btn = h('button', {type: 'button', class: 'btn discret petit'}, 'Commencer');
      if(brouillonEnCours()) deuxTemps(btn, 'Remplacer la séance en cours ?', () => commencer(j)); else btn.addEventListener('click', () => commencer(j));
      return h('section', null, h('div', {class: 'rubrique-rang'}, h('h2', {class: 'rubrique'}, nomJour(j)), btn),
        h('div', {class: 'liste'}, lignesDuJour(j).map(P => h('button', {type: 'button', class: 'ligne', onclick: () => ouvrirLigneProgramme(P)},
        h('span', {class: 'ligne-rang'}, h('span', {class: 'ligne-nom'}, P.nom), h('span', {class: 'ligne-valeur'}, P.type === 'series' ? texteObjectif(P) : texteCible(P))),
        P.type === 'series' ? h('span', {class: 'ligne-detail'}, [P.rir && P.rir !== '—' ? 'RIR ' + P.rir : '', P.repos && P.repos !== '—' ? 'repos ' + P.repos : ''].filter(Boolean).join(', ')) : null,
        P.type === 'series' ? h('span', {class: 'ligne-detail'}, 'Augmentation indicative ' + (P.augmentation || '–') + ', incrément ' + num(P.pas) + ' kg') : null))));
    })));
    blocs.push(h('div', {class: 'ajout'}, h('button', {type: 'button', class: 'btn large', onclick: () => ouvrirLigneProgramme(null)}, '+ Ajouter un exercice au programme')));
  }
  $('#vue-programme').replaceChildren(...blocs);
}

function ouvrirLigneProgramme(P){
  const neuf = !P;
  const f = P ? copie(P) : {jour: joursDuProgramme()[0] || 'LUNDI', nom: '', type: 'series', series: 3, repsMin: 8, repsMax: 12, rir: '1-2', repos: '', augmentation: '', pas: 2.5};
  const corps = h('div', {class: 'formulaire'});
  const champ = (nomChamp, cle, opts) => {
    const input = h('input', Object.assign({type: 'text', autocomplete: 'off', value: f[cle] == null ? '' : (opts && opts.nombre ? num(f[cle]) : f[cle])}, opts && opts.nombre ? {inputmode: 'decimal'} : {}));
    input.addEventListener('input', () => { f[cle] = opts && opts.nombre ? lire(input.value) : input.value; });
    return h('label', null, h('span', {class: 'champ-nom'}, nomChamp), input);
  };
  const liste = (nomChamp, cle, options, apres) => {
    const sel = h('select', null, options.map(([v, t]) => h('option', {value: v}, t)));
    sel.value = f[cle];
    sel.addEventListener('change', () => { f[cle] = sel.value; if(apres) apres(); });
    return h('label', null, h('span', {class: 'champ-nom'}, nomChamp), sel);
  };
  function dessiner(){
    const champs = [
      liste('Jour', 'jour', JOURS_PROG.map(j => [j, nomJour(j)])),
      champ('Exercice', 'nom'),
      liste('Type', 'type', [['series', 'Poids et séries'], ['temps', 'Au temps (minutes)'], ['cardio', 'Cardio (durée libre)']], dessiner),
    ];
    if(f.type === 'series') champs.push(
      champ('Séries', 'series', {nombre: true}),
      h('div', {class: 'duo'}, champ('Reps min', 'repsMin', {nombre: true}), champ('Reps max', 'repsMax', {nombre: true})),
      h('div', {class: 'duo'}, champ('RIR visé', 'rir'), champ('Repos', 'repos')),
      h('div', {class: 'duo'}, champ('Augmentation (indicatif)', 'augmentation'), champ('Incrément (kg)', 'pas', {nombre: true})));
    else if(f.type === 'temps') champs.push(champ('Durée (min)', 'minutes', {nombre: true}));
    else champs.push(h('div', {class: 'duo'}, champ('Durée mini (min)', 'minMin', {nombre: true}), champ('Durée maxi (min)', 'minMax', {nombre: true})));
    if(!neuf && P.type === 'series') champs.push(h('p', {class: 'formulaire-aide'}, 'Changer le nom ou le jour sépare l\u2019exercice de ses séances déjà notées.'));
    const actions = [h('button', {type: 'button', class: 'btn principal', onclick: valider}, 'Enregistrer')];
    if(!neuf) actions.push(deuxTemps(h('button', {type: 'button', class: 'btn danger'}, 'Supprimer'), 'Confirmer la suppression', () => {
      S.reglages.programme = S.reglages.programme.filter(x => x !== P);
      finir('Exercice retiré du programme');
    }));
    champs.push(h('div', {class: 'formulaire-actions'}, actions));
    corps.replaceChildren(...champs);
  }
  function finir(message){ depots.reglages.maintenant(); fermerFeuille(); donneesChangees(); annoncer(message); }
  function valider(){
    const ligne = ligneProgLue(Object.assign({}, f, {nom: nomPropre(f.nom || '')}));
    if(!ligne) return annoncer('Indique le nom de l\u2019exercice.');
    if(ligne.type === 'series'){
      ligne.series = Math.max(1, Math.round(ligne.series)); ligne.repsMin = Math.max(1, Math.round(ligne.repsMin)); ligne.repsMax = Math.max(1, Math.round(ligne.repsMax));
      if(ligne.repsMax < ligne.repsMin) return annoncer('Le nombre de reps maxi doit être au moins égal au mini.');
    }
    const prog = S.reglages.programme;
    const doublon = prog.some(x => x !== P && x.jour === ligne.jour && sansAccent(x.nom) === sansAccent(ligne.nom));
    if(doublon) return annoncer('« ' + ligne.nom + ' » est déjà au programme du ' + ligne.jour.toLowerCase() + '.');
    if(neuf || P.jour !== ligne.jour){
      if(!neuf) prog.splice(prog.indexOf(P), 1);
      let pos = -1; prog.forEach((x, i) => { if(x.jour === ligne.jour) pos = i; });
      if(pos < 0){ pos = -1; prog.forEach((x, i) => { if(JOURS_PROG.indexOf(x.jour) < JOURS_PROG.indexOf(ligne.jour)) pos = i; }); }
      prog.splice(pos + 1, 0, ligne);
    } else prog[prog.indexOf(P)] = ligne;
    finir('Programme enregistré');
  }
  dessiner();
  ouvrirFeuille(neuf ? 'Nouvel exercice' : 'Modifier l\u2019exercice', corps);
}

/* =====================================================================
   Vue « Progression » (feuilles PROGRESSION et GRAPHIQUES du classeur)
   ===================================================================== */
function ecart(item){
  const n = item.histo.length;
  if(n < 2) return null;
  const a = item.histo[n - 2].ex, b = item.histo[n - 1].ex;
  if(item.mesure === 'series'){
    const dp = arrondi((b.poids || 0) - (a.poids || 0));
    if(dp) return {texte: signe(dp) + ' kg', sens: Math.sign(dp)};
    const dr = totalReps(b) - totalReps(a);
    if(dr) return {texte: signe(dr) + (Math.abs(dr) > 1 ? ' reps' : ' rep'), sens: Math.sign(dr)};
    return {texte: 'Identique', sens: 0};
  }
  if(a.km && b.km){ const dk = arrondi(b.km - a.km); if(dk) return {texte: signe(dk) + ' km', sens: Math.sign(dk)}; }
  const dm = arrondi((b.minutes || 0) - (a.minutes || 0));
  if(dm) return {texte: signe(dm) + ' min', sens: Math.sign(dm)};
  return {texte: 'Identique', sens: 0};
}
const pastille = e => e ? h('span', {class: 'ecart' + (e.sens > 0 ? ' hausse' : e.sens < 0 ? ' baisse' : '')}, e.texte) : null;
function rangee(nom, valeur, date, second, e, action){
  return h('button', {type: 'button', class: 'ligne', onclick: action},
    h('span', {class: 'ligne-rang'}, h('span', {class: 'ligne-nom'}, nom), h('span', {class: 'ligne-valeur'}, valeur)),
    h('span', {class: 'ligne-rang'}, h('span', {class: 'ligne-date'}, 'le ' + dateCourte(date)), h('span', {class: 'ligne-bas'}, second, pastille(e))));
}
/* Une ligne de la feuille PROGRESSION : charge à prendre, décision, objectif de la prochaine séance */
function rangeeProgramme(it){
  const P = it.prog, d = it.histo.length ? it.histo[it.histo.length - 1] : null;
  const aPrendre = d ? chargeSuivante(d.ex, P) : null;
  return h('button', {type: 'button', class: 'ligne', onclick: () => ouvrirDetail(it.cle)},
    h('span', {class: 'ligne-rang'}, h('span', {class: 'ligne-nom'}, it.nom), h('span', {class: 'ligne-valeur'}, aPrendre != null ? num(aPrendre) + ' kg' : '–')),
    h('span', {class: 'ligne-rang'}, h('span', {class: 'ligne-date'}, 'Objectif ' + texteObjectif(P)), h('span', {class: 'ligne-bas'}, d ? badge(decision(d.ex, P)) : null)),
    h('span', {class: 'ligne-texte'}, consigne(d ? d.ex : null, P)),
    d ? h('span', {class: 'ligne-detail'}, 'Dernière séance le ' + dateCourte(d.date) + ' : ' + texteSeries(d.ex) + (texteRir(d.ex) ? ', ' + texteRir(d.ex) : '')) : null);
}

/* Tout le cardio d'une séance, additionné */
function cardioParSeance(){
  return [...S.seances].reverse().map(se => {
    const c = se.exercices.filter(e => e.groupe === 'cardio');
    if(!c.length) return null;
    return {date: se.date, minutes: c.reduce((a, e) => a + (e.minutes || 0), 0), detail: c.map(e => e.nom + ' ' + texteTemps(e)).join(', ')};
  }).filter(Boolean);
}
/* GRAPHIQUES ② : volume par semaine, à partir du lundi de la première séance */
function volumeParSemaine(){
  const lignes = [];
  for(const se of S.seances) for(const e of se.exercices){ const v = volume(e); if(v != null) lignes.push({date: se.date, v}); }
  if(!lignes.length) return [];
  const debut = lundiDe(dateDe(lignes.reduce((m, l) => l.date < m ? l.date : m, lignes[0].date)));
  const fin = lundiDe(new Date());
  const semaines = [];
  for(let d = new Date(debut), n = 1; d <= fin && n <= 200; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7), n++){
    const a = isoDe(d), z = isoDe(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7));
    semaines.push({nom: 'S' + n, date: a, v: arrondi(lignes.filter(l => l.date >= a && l.date < z).reduce((s, l) => s + l.v, 0))});
  }
  return semaines.slice(-20);
}

function rendreProgression(){
  const vue = $('#vue-progression');
  if(S.detail){ const d = rendreDetail(); if(d){ vue.replaceChildren(...d); return; } S.detail = null; }
  const blocs = [h('h1', {class: 'titre'}, 'Progression')];
  if(S.stockage === 'chargement') blocs.push(h('p', {class: 'sous-titre'}, 'Chargement de tes séances…'));
  else if(S.stockage === 'absent') blocs.push(alerteAbsent(true));
  else {
    const items = [...S.index.values()];
    const suivis = items.filter(it => it.prog);
    const aAugmenter = suivis.filter(it => it.histo.length && decision(it.histo[it.histo.length - 1].ex, it.prog) === 'AUGMENTER').length;
    let volumeTotal = 0; for(const se of S.seances) for(const e of se.exercices) volumeTotal += volume(e) || 0;
    blocs.push(h('dl', {class: 'faits par-deux'},
      [['Séances enregistrées', S.seances.length], ['Exercices suivis', suivis.filter(it => it.histo.length).length + ' / ' + suivis.length],
       ['À augmenter', aAugmenter], ['Volume total', num(Math.round(volumeTotal)) + ' kg']].map(([n, v]) => h('div', null, h('dt', null, n), h('dd', null, v)))));

    if(suivis.length){
      blocs.push(h('h2', {class: 'rubrique'}, 'Ce que je prends à la prochaine séance'),
        h('p', {class: 'explication'}, 'Si toutes les séries atteignent le maximum de reps avec au moins le RIR ci-dessous : augmenter (charge + incrément). Sinon : conserver la charge et viser plus de reps.'));
      const rir = S.reglages.rirMin;
      const regler = v => { S.reglages.rirMin = Math.min(5, Math.max(0, v)); depots.reglages.demander(); rendreProgression(); };
      blocs.push(h('div', {class: 'reglage'}, h('span', null, 'RIR minimum pour augmenter'),
        h('div', {class: 'pas petit'},
          h('button', {type: 'button', 'aria-label': 'Diminuer le RIR minimum', disabled: rir <= 0, onclick: () => regler(rir - 1)}, '−'),
          h('output', {'aria-label': 'RIR minimum'}, rir),
          h('button', {type: 'button', 'aria-label': 'Augmenter le RIR minimum', disabled: rir >= 5, onclick: () => regler(rir + 1)}, '+'))));
      const jours = JOURS_PROG.filter(j => suivis.some(it => it.jour === j));
      if(S.filtre !== 'TOUS' && !jours.includes(S.filtre)) S.filtre = 'TOUS';
      blocs.push(puces([['TOUS', 'Tous']].concat(jours.map(j => [j, nomJour(j)])), S.filtre, v => { S.filtre = v; rendreProgression(); }, 'Jour du programme'));
      blocs.push(h('div', {class: 'colonnes'}, jours.filter(j => S.filtre === 'TOUS' || S.filtre === j).map(j => h('section', null,
        h('h3', {class: 'rubrique', style: 'font-size:19px;margin-top:16px'}, nomJour(j)), h('div', {class: 'liste'}, suivis.filter(it => it.jour === j).map(rangeeProgramme))))));
    }

    const recents = (a, b) => { const x = a.histo[a.histo.length - 1], y = b.histo[b.histo.length - 1]; return x.date < y.date ? 1 : x.date > y.date ? -1 : x.ordre - y.ordre; };
    const ligne = it => {
      const d = it.histo[it.histo.length - 1];
      const valeur = it.mesure === 'series' ? (d.ex.poids != null ? num(d.ex.poids) + ' kg' : texteReps(d.ex)) : (d.ex.km ? num(d.ex.km) + ' km' : num(d.ex.minutes || 0) + ' min');
      const second = it.mesure === 'series' ? (d.ex.poids != null ? texteReps(d.ex) : '') : (d.ex.km && d.ex.minutes ? 'en ' + num(d.ex.minutes) + ' min' : '');
      return rangee(it.nom, valeur, d.date, second, ecart(it), () => ouvrirDetail(it.cle));
    };
    const autres = items.filter(it => !it.prog && it.histo.length);
    const cardio = autres.filter(it => it.groupe === 'cardio').sort(recents), libres = autres.filter(it => it.groupe === 'muscu').sort(recents);
    const paires = [];
    if(cardio.length){
      const tout = cardioParSeance(), d = tout[tout.length - 1], p = tout.length > 1 ? tout[tout.length - 2] : null;
      const dm = p ? arrondi(d.minutes - p.minutes) : 0;
      const e = !p ? null : dm ? {texte: signe(dm) + ' min', sens: Math.sign(dm)} : {texte: 'Identique', sens: 0};
      paires.push(h('section', null, h('h2', {class: 'rubrique'}, 'Cardio'), h('div', {class: 'liste'},
        rangee('Total de la séance', num(d.minutes) + ' min', d.date, '', e, () => ouvrirDetail('*cardio')), cardio.map(ligne))));
    }
    if(libres.length) paires.push(h('section', null, h('h2', {class: 'rubrique'}, 'Abdos et exercices hors programme'), h('div', {class: 'liste'}, libres.map(ligne))));
    if(paires.length) blocs.push(h('div', {class: 'colonnes'}, paires));
    const bilans = [];

    const semaines = volumeParSemaine();
    if(semaines.length) bilans.push(h('section', null, h('h2', {class: 'rubrique'}, 'Volume soulevé par semaine'),
      h('p', {class: 'explication'}, 'Volume = charge × reps totales. Des barres qui montent sur plusieurs semaines : tu travailles de plus en plus.'),
      barres('Volume par semaine (kg)', semaines.map(s => ({nom: semaines.length <= 6 ? s.nom.replace('S', 'Sem ') : s.nom, v: s.v})), {unite: 'kg'})));

    const gains = suivis.filter(it => it.histo.length).map(it => {
      const a = it.histo[0].ex.poids, z = it.histo[it.histo.length - 1].ex.poids;
      return {nom: nomJour(it.jour).slice(0, 3) + ' · ' + it.nom, pct: a && z != null ? (z - a) / a : 0};
    });
    if(gains.length){
      const maxi = Math.max(0.05, ...gains.map(x => Math.abs(x.pct)));
      bilans.push(h('section', null, h('h2', {class: 'rubrique'}, 'Gain de charge par exercice'),
        h('p', {class: 'explication'}, 'De combien tu as augmenté ta charge, en %, depuis ta première séance sur chaque exercice.'),
        h('div', {class: 'gains'}, gains.map(x => h('div', {class: 'gain'},
          h('span', null, x.nom),
          h('span', {class: 'gain-barre', 'aria-hidden': 'true'}, h('i', {class: x.pct < 0 ? 'moins' : null, style: 'width:' + Math.round(Math.abs(x.pct) / maxi * 100) + '%'})),
          h('span', {class: 'gain-val'}, (x.pct > 0 ? '+' : x.pct < 0 ? '−' : '') + num1(Math.abs(x.pct) * 100) + ' %'))))));
    }
    if(bilans.length) blocs.push(h('div', {class: 'colonnes'}, bilans));
    if(!S.seances.length && !suivis.length) blocs.push(h('div', {class: 'vide'},
      h('p', null, 'Ta progression s\u2019affichera ici dès ta première séance enregistrée.'),
      h('button', {type: 'button', class: 'btn principal large', onclick: () => aller('seance')}, 'Noter une séance')));
  }
  vue.replaceChildren(...blocs);
}
function ouvrirDetail(k){ S.detail = k; rendreProgression(); window.scrollTo(0, 0); }

/* ---- graphiques ---- */
function graphe(titre, points, unite){
  const pts = points.slice(-20);
  const boite = h('div', {class: 'graphe'}, h('h3', null, titre));
  if(pts.length === 1) boite.append(h('p', {class: 'seul'}, 'La courbe se tracera à partir de la deuxième séance.'));
  else if(points.length > 20) boite.append(h('p', {class: 'seul'}, 'Les 20 dernières séances.'));
  const L = 320, H = pts.length === 1 ? 96 : 148, gauche = 16, droite = 16, haut = 28, bas = 26;
  let min = Math.min(...pts.map(p => p.v)), max = Math.max(...pts.map(p => p.v));
  if(min === max){ min -= 1; max += 1; }
  const x = i => pts.length === 1 ? L / 2 : gauche + i * (L - gauche - droite) / (pts.length - 1);
  const y = v => haut + (1 - (v - min) / (max - min)) * (H - haut - bas);
  const iMax = pts.reduce((m, p, i) => p.v > pts[m].v ? i : m, 0);
  const ancre = i => pts.length === 1 ? 'middle' : i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle';
  const decale = i => pts.length === 1 ? 0 : i === 0 ? -6 : i === pts.length - 1 ? 6 : 0;
  const resume = pts.map(p => num(p.v) + ' ' + unite + ' le ' + dateCourte(p.date)).join(' ; ');
  boite.append(g('svg', {viewBox: '0 0 ' + L + ' ' + H, role: 'img', 'aria-label': titre + ' : ' + resume},
    g('line', {class: 'g-sol', x1: 0, x2: L, y1: H - bas + 8, y2: H - bas + 8}),
    pts.length > 1 ? g('polyline', {class: 'g-ligne', points: pts.map((p, i) => x(i).toFixed(1) + ',' + y(p.v).toFixed(1)).join(' ')}) : null,
    pts.map((p, i) => g('circle', {class: 'g-point', cx: x(i).toFixed(1), cy: y(p.v).toFixed(1), r: 5})),
    pts.map((p, i) => (pts.length <= 8 || i === 0 || i === pts.length - 1 || i === iMax)
      ? g('text', {class: 'g-valeur', x: (x(i) + decale(i)).toFixed(1), y: (y(p.v) - 11).toFixed(1), 'text-anchor': ancre(i)}, num(p.v)) : null),
    pts.map((p, i) => (i === 0 || i === pts.length - 1)
      ? g('text', {class: 'g-date', x: (x(i) + decale(i)).toFixed(1), y: H - 4, 'text-anchor': ancre(i)}, dateCourte(p.date)) : null)));
  return boite;
}
/* Barres partant de zéro, avec une ligne d'objectif facultative */
function barres(titre, pts, o){
  const boite = h('div', {class: 'graphe'}, h('h3', null, titre));
  const L = 320, H = 168, haut = 22, bas = 22, bord = 4;
  const maxi = Math.max(1, o.cible || 0, ...pts.map(p => p.v)) * 1.06;
  const pasX = (L - 2 * bord) / pts.length, larg = Math.min(34, pasX * 0.66);
  const y = v => haut + (1 - v / maxi) * (H - haut - bas);
  const etiquettes = pts.length <= 8;
  const iMax = pts.reduce((m, p, i) => p.v > pts[m].v ? i : m, 0);
  const resume = pts.map(p => p.nom + ' ' + num(p.v) + ' ' + o.unite).join(' ; ') + (o.cible ? ' ; objectif ' + num(o.cible) + ' ' + o.unite : '');
  boite.append(g('svg', {viewBox: '0 0 ' + L + ' ' + H, role: 'img', 'aria-label': titre + ' : ' + resume},
    g('line', {class: 'g-sol', x1: 0, x2: L, y1: H - bas, y2: H - bas}),
    pts.map((p, i) => { const cx = bord + pasX * (i + 0.5), yy = y(p.v);
      return g('rect', {class: 'g-barre', x: (cx - larg / 2).toFixed(1), y: yy.toFixed(1), width: larg.toFixed(1), height: Math.max(0, H - bas - yy).toFixed(1), rx: 3}); }),
    o.cible ? g('line', {class: 'g-cible', x1: 0, x2: L, y1: y(o.cible).toFixed(1), y2: y(o.cible).toFixed(1)}) : null,
    pts.map((p, i) => (etiquettes || i === iMax || i === pts.length - 1) && p.v > 0
      ? g('text', {class: 'g-petit', x: (bord + pasX * (i + 0.5)).toFixed(1), y: (Math.min(y(p.v), o.cible ? y(o.cible) : H) - 6).toFixed(1), 'text-anchor': 'middle'}, num(Math.round(p.v))) : null),
    pts.map((p, i) => (etiquettes || i % Math.ceil(pts.length / 8) === 0)
      ? g('text', {class: 'g-date', x: (bord + pasX * (i + 0.5)).toFixed(1), y: H - 6, 'text-anchor': 'middle'}, p.nom) : null)));
  return boite;
}
function faits(liste, parDeux){ return h('dl', {class: 'faits' + (parDeux ? ' par-deux' : '')}, liste.map(([nom, valeur]) => h('div', null, h('dt', null, nom), h('dd', null, valeur)))); }
function tableau(entetes, lignes, large){
  return h('div', {class: 'table-defile'}, h('table', {class: large ? 'large' : null},
    h('thead', null, h('tr', null, entetes.map(t => h('th', {scope: 'col'}, t)))),
    h('tbody', null, lignes.map(l => h('tr', null, l.map(c => h('td', {class: String(c).length <= 16 ? 'court' : null}, c)))))));
}

function rendreDetail(){
  const retour = h('button', {type: 'button', class: 'retour', onclick: () => { S.detail = null; rendreProgression(); window.scrollTo(0, 0); }}, '‹ Progression');
  if(S.detail === '*cardio'){
    const tout = cardioParSeance(); if(!tout.length) return null;
    const d = tout[tout.length - 1];
    const P = S.reglages.programme.find(p => p.type === 'cardio');
    return [retour, h('h1', {class: 'titre'}, 'Cardio, total par séance'),
      P && texteCible(P) ? h('p', {class: 'sous-titre'}, 'Objectif du programme (' + nomJour(P.jour).toLowerCase() + ') : ' + texteCible(P) + '.') : null,
      faits([['Dernière séance', num(d.minutes) + ' min'], ['Plus longue', num(Math.max(...tout.map(t => t.minutes))) + ' min'], ['Séances', tout.length]]),
      graphe('Durée totale (min)', tout.map(t => ({date: t.date, v: t.minutes})), 'min'),
      tableau(['Date', 'Durée', 'Détail'], [...tout].reverse().map(t => [dateCourte(t.date), num(t.minutes) + ' min', t.detail]))];
  }
  const it = S.index.get(S.detail);
  if(!it || (!it.histo.length && !it.prog)) return null;
  const H = it.histo, P = it.prog, d = H.length ? H[H.length - 1].ex : null;
  const blocs = [retour, h('h1', {class: 'titre'}, it.nom)];
  if(P){
    blocs.push(h('p', {class: 'sous-titre'}, nomJour(P.jour) + ', objectif ' + texteCible(P) + ', incrément ' + num(P.pas) + ' kg.'));
    const aPrendre = d ? chargeSuivante(d, P) : null;
    blocs.push(h('div', {class: 'prochaine'},
      h('p', {class: 'etat'}, 'Charge à prendre à la prochaine séance'),
      h('div', {class: 'prochaine-rang'}, h('span', {class: 'prochaine-valeur'}, aPrendre != null ? num(aPrendre) + ' kg' : '–'), d ? badge(decision(d, P)) : null),
      h('p', {class: 'consigne'}, consigne(d, P))));
  }
  if(!d) return blocs;
  if(it.mesure === 'series'){
    const poids = H.filter(p => p.ex.poids != null);
    const depart = H[0].ex.poids, evo = depart != null && d.poids != null ? arrondi(d.poids - depart) : null;
    blocs.push(faits([
      ['Dernière charge', d.poids != null ? num(d.poids) + ' kg' : 'Sans charge'],
      ['Charge de départ', depart != null ? num(depart) + ' kg' : '–'],
      ['Évolution', evo == null ? '–' : (evo === 0 ? '0' : signe(evo)) + ' kg' + (depart ? ' (' + (evo === 0 ? '0' : signe1(evo / depart * 100)) + ' %)' : '')],
      ['Séances', H.length]], true));
    blocs.push(h('div', {class: 'colonnes'},
      poids.length ? graphe('Charge utilisée (kg), séance après séance', poids.map(p => ({date: p.date, v: p.ex.poids})), 'kg') : null,
      poids.length ? graphe('Force estimée (kg), séance après séance', poids.map(p => ({date: p.date, v: forceEstimee(p.ex)})), 'kg') : null,
      graphe('Répétitions (total de la séance)', H.map(p => ({date: p.date, v: totalReps(p.ex)})), 'reps')));
    if(poids.length) blocs.push(h('p', {class: 'explication', style: 'margin-top:8px'}, 'Charge = le poids que tu soulèves. Force estimée = charge et reps combinées : elle monte aussi quand tu fais plus de reps à la même charge.'));
    const tiret = v => v == null ? '–' : v;
    if(P) blocs.push(tableau(['Date', 'Séries', 'RIR', 'Reps', 'Volume', 'Force estimée', 'Décision', 'Charge suivante'], [...H].reverse().map(p => {
      const v = volume(p.ex), f = forceEstimee(p.ex), s = chargeSuivante(p.ex, P);
      return [dateCourte(p.date), texteSeries(p.ex), texteRir(p.ex).replace(/^RIR /, '') || '–', totalReps(p.ex), v == null ? '–' : num(v) + ' kg', f == null ? '–' : num(f) + ' kg', libelleDecision(decision(p.ex, P)) || '–', s == null ? '–' : num(s) + ' kg'];
    }), true));
    else blocs.push(tableau(['Date', 'Séries', 'RIR', 'Volume', 'Force estimée'], [...H].reverse().map(p => [dateCourte(p.date), texteSeries(p.ex), texteRir(p.ex).replace(/^RIR /, '') || '–',
      tiret(volume(p.ex) == null ? null : num(volume(p.ex)) + ' kg'), tiret(forceEstimee(p.ex) == null ? null : num(forceEstimee(p.ex)) + ' kg')]), true));
  } else {
    const km = H.filter(p => p.ex.km), mn = H.filter(p => p.ex.minutes);
    const liste = [['Dernière fois', texteTemps(d)]];
    if(mn.length) liste.push(['Plus longue', num(Math.max(...mn.map(p => p.ex.minutes))) + ' min']);
    liste.push(['Séances', H.length]);
    blocs.push(faits(liste));
    blocs.push(h('div', {class: 'colonnes'},
      mn.length ? graphe('Durée (min)', mn.map(p => ({date: p.date, v: p.ex.minutes})), 'min') : null,
      km.length ? graphe('Distance (km)', km.map(p => ({date: p.date, v: p.ex.km})), 'km') : null));
    if(it.groupe === 'cardio') blocs.push(tableau(['Date', 'Durée', 'Distance', 'Allure'], [...H].reverse().map(p => [dateCourte(p.date),
      p.ex.minutes ? num(p.ex.minutes) + ' min' : '–', p.ex.km ? num(p.ex.km) + ' km' : '–', p.ex.km && p.ex.minutes ? allure(p.ex.minutes, p.ex.km) : '–'])));
    else blocs.push(tableau(['Date', 'Durée'], [...H].reverse().map(p => [dateCourte(p.date), num(p.ex.minutes || 0) + ' min'])));
  }
  return blocs;
}

/* =====================================================================
   Vue « Journal » (feuille JOURNAL du classeur)
   ===================================================================== */
function typeSeance(se){
  if(se.jour) return 'Programme du ' + se.jour.toLowerCase();
  const types = new Set(se.exercices.map(e => e.groupe));
  return types.has('muscu') && types.has('cardio') ? 'Musculation et cardio' : types.has('cardio') ? 'Cardio' : 'Séance libre';
}
function carteSeance(se){
  const modifier = () => {
    S.brouillon = {id: se.id, idNeuf: null, date: se.date, jour: se.jour || null, note: se.note || '', exercices: copie(se.exercices)};
    S.aCorriger = -1; garderBrouillon(); rendreSeance(); aller('seance');
  };
  const btnModifier = h('button', {type: 'button', class: 'btn discret'}, 'Modifier');
  if(brouillonEnCours() && S.brouillon.id !== se.id) deuxTemps(btnModifier, 'Remplacer la séance en cours ?', modifier);
  else btnModifier.addEventListener('click', modifier);
  const btnSupprimer = deuxTemps(h('button', {type: 'button', class: 'btn discret danger'}, 'Supprimer'), 'Confirmer la suppression', async () => {
    btnSupprimer.disabled = true;
    try{
      await pret;
      if(!refs) throw {code: 'not_granted'};
      await ecrire(() => refs.seances.doc(se.id).delete());
      S.seances = S.seances.filter(x => x.id !== se.id);
      if(S.brouillon.id === se.id){ S.brouillon = brouillonVide(); oublierBrouillon(); }
      donneesChangees(); annoncer('Séance supprimée');
    }catch(e){ btnSupprimer.disabled = false; annoncer('Suppression impossible pour l\u2019instant. Réessaie quand tu as du réseau.'); }
  });
  const total = texteTotalCardio(se.exercices, se.jour);
  const details = h('details', {class: 'seance', open: S.ouvertes.has(se.id)},
    h('summary', null,
      h('span', {class: 'seance-date'}, dateLongue(se.date)),
      h('span', {class: 'seance-type'}, typeSeance(se)),
      h('span', {class: 'seance-noms'}, se.exercices.map(e => e.nom).join(', '))),
    h('div', {class: 'seance-corps'},
      h('ul', null, se.exercices.map(e => {
        const morceaux = [h('span', {class: 'ex-nom'}, e.nom), h('span', {class: 'ex-perf'}, textePerf(e))];
        if(e.mesure === 'series'){
          const rir = texteRir(e); if(rir) morceaux.push(h('span', {class: 'ex-plus droite'}, rir));
          const it = S.index.get(cleEx(e)), P = it && it.prog, v = volume(e), f = forceEstimee(e);
          const calculs = [P ? 'Objectif ' + texteObjectif(P) : '', totalReps(e) + ' reps', v != null ? 'volume ' + num(v) + ' kg' : '', f != null ? 'force estimée ' + num(f) + ' kg' : ''].filter(Boolean).join(', ');
          morceaux.push(h('span', {class: 'ex-plus'}, calculs + '.'));
          const dec = decision(e, P);
          if(dec) morceaux.push(h('span', {class: 'ex-plus'}, libelleDecision(dec) + ' : charge suivante ' + num(chargeSuivante(e, P)) + ' kg.'));
        }
        return h('li', null, morceaux);
      })),
      total ? h('p', {class: 'seance-note'}, total) : null,
      se.note ? h('p', {class: 'seance-note'}, se.note) : null,
      h('div', {class: 'seance-actions'}, btnModifier, btnSupprimer)));
  details.addEventListener('toggle', () => { if(details.open) S.ouvertes.add(se.id); else S.ouvertes.delete(se.id); });
  return details;
}
function rendreJournal(){
  const blocs = [h('h1', {class: 'titre'}, 'Journal')];
  if(S.stockage === 'chargement') blocs.push(h('p', {class: 'sous-titre'}, 'Chargement de tes séances…'));
  else if(S.stockage === 'absent') blocs.push(alerteAbsent(true));
  else if(!S.seances.length){
    blocs.push(h('div', {class: 'vide'},
      h('p', null, 'Aucune séance enregistrée pour l\u2019instant.'),
      h('button', {type: 'button', class: 'btn principal large', onclick: () => aller('seance')}, 'Noter une séance')));
  } else {
    blocs.push(h('p', {class: 'sous-titre'}, S.seances.length === 1 ? '1 séance enregistrée. Touche-la pour voir le détail.' : S.seances.length + ' séances enregistrées. Touche une séance pour voir le détail.'));
    let mois = '', liste = null;
    for(const se of S.seances){
      const d = dateDe(se.date), m = maj1(MOIS[d.getMonth()]) + ' ' + d.getFullYear();
      if(m !== mois){ mois = m; liste = h('div', {class: 'liste'}); blocs.push(h('h2', {class: 'rubrique'}, m), liste); }
      liste.append(carteSeance(se));
    }
  }
  $('#vue-journal').replaceChildren(...blocs);
}

/* =====================================================================
   Vue « Nutrition » (feuilles NUTRITION, REPAS et ALIMENTS du classeur)
   ===================================================================== */
const kcalProt = v => num(v.kcal) + ' kcal, ' + num1(v.prot) + ' g de protéines';

function rendreNutrition(){
  const blocs = [h('h1', {class: 'titre'}, 'Nutrition')];
  if(S.stockage === 'chargement') blocs.push(h('p', {class: 'sous-titre'}, 'Chargement de tes repas…'));
  else if(S.stockage === 'absent') blocs.push(alerteAbsent(true));
  else {
    const sous = h('div', {class: 'bascule', role: 'group', 'aria-label': 'Partie de la nutrition', style: 'margin-top:12px'},
      [['bilan', 'Bilan'], ['repas', 'Repas'], ['aliments', 'Aliments']].map(([v, t]) =>
        h('button', {type: 'button', 'aria-pressed': String(S.nutri.vue === v), onclick: () => { S.nutri.vue = v; rendreNutrition(); }}, t)));
    blocs.push(sous, ...(S.nutri.vue === 'bilan' ? vueBilan() : S.nutri.vue === 'repas' ? vueRepas() : vueAliments()));
  }
  $('#vue-nutrition').replaceChildren(...blocs);
}

function vueBilan(){
  const calculs = h('div');
  const dessiner = () => {
    const jours = [...nutrition().values()], kcal = S.reglages.kcal, prot = S.reglages.prot;
    const moy = c => jours.reduce((a, j) => a + c(j), 0) / jours.length;
    const cartes = [];
    const blocs = [h('div', {class: 'colonnes'},
      barres('Calories par jour et objectif (' + num(kcal) + ' kcal)', jours.map(j => ({nom: j.jour.slice(0, 3), v: j.kcal})), {cible: kcal, unite: 'kcal'}),
      barres('Protéines par jour et objectif (' + num(prot) + ' g)', jours.map(j => ({nom: j.jour.slice(0, 3), v: j.prot})), {cible: prot, unite: 'g'})),
      h('div', {class: 'grille'}, cartes)];
    for(const j of jours){
      const ek = j.kcal - kcal, ep = Math.round((j.prot - prot) * 10) / 10, c = conseil(j.kcal, ek);
      cartes.push(h('button', {type: 'button', class: 'jour-bilan ligne', onclick: () => { S.nutri = {vue: 'repas', jour: j.jour}; rendreNutrition(); window.scrollTo(0, 0); }},
        h('span', {class: 'ligne-rang'}, h('span', {class: 'ligne-nom'}, j.jour), h('span', {class: 'ligne-valeur'}, num(j.kcal) + ' kcal')),
        h('span', {class: 'ligne-rang'}, h('span', {class: 'ligne-date'}, num1(j.prot) + ' g de protéines (' + (ep === 0 ? '0' : signe1(ep)) + ' g)'),
          h('span', {class: 'ligne-bas'}, h('span', {class: 'ecart' + (Math.abs(ek) > 100 ? ' baisse' : ' hausse')}, (ek === 0 ? '0' : signe(ek)) + ' kcal'))),
        h('span', {class: 'ligne-detail'}, REPAS.map(r => r + ' ' + num(j.repas.get(r).kcal)).join(', ')),
        c ? h('span', {class: 'ligne-texte'}, c) : null));
    }
    const mk = moy(j => j.kcal), mp = moy(j => j.prot);
    cartes.push(h('div', {class: 'jour-bilan'},
      h('span', {class: 'ligne-rang'}, h('span', {class: 'ligne-nom'}, 'Moyenne'), h('span', {class: 'ligne-valeur'}, num(Math.round(mk)) + ' kcal')),
      h('span', {class: 'ligne-rang'}, h('span', {class: 'ligne-date'}, num1(mp) + ' g de protéines (' + signe1(Math.round((mp - prot) * 10) / 10) + ' g)'),
        h('span', {class: 'ligne-bas'}, h('span', {class: 'ecart'}, signe(Math.round(mk - kcal)) + ' kcal'))),
      h('span', {class: 'ligne-detail'}, REPAS.map(r => r + ' ' + num(Math.round(moy(j => j.repas.get(r).kcal)))).join(', '))));
    blocs[1].replaceChildren(...cartes);
    calculs.replaceChildren(...blocs);
  };
  dessiner();
  return [
    h('p', {class: 'sous-titre', style: 'margin-top:12px'}, 'Bilan de la semaine. Tout se calcule depuis les repas ; seuls tes deux objectifs se règlent ici.'),
    h('div', {class: 'duo objectifs', style: 'margin-top:12px'},
      h('div', {class: 'champ'}, h('span', {class: 'champ-nom'}, 'Objectif kcal / jour'),
        pasAPas({label: 'Objectif de calories par jour', valeur: S.reglages.kcal, pas: 50, petit: true, change: v => { S.reglages.kcal = v || 0; depots.reglages.demander(); dessiner(); }})),
      h('div', {class: 'champ'}, h('span', {class: 'champ-nom'}, 'Objectif protéines / jour (g)'),
        pasAPas({label: 'Objectif de protéines par jour, en grammes', valeur: S.reglages.prot, pas: 5, petit: true, change: v => { S.reglages.prot = v || 0; depots.reglages.demander(); dessiner(); }}))),
    calculs];
}

function vueRepas(){
  const jour = S.nutri.jour;
  const J = nutrition().get(jour);
  const resume = h('div', {class: 'jour-bilan'});
  const majs = [];
  const peindreResume = () => {
    const N = nutrition().get(jour), ek = N.kcal - S.reglages.kcal, ep = Math.round((N.prot - S.reglages.prot) * 10) / 10, c = conseil(N.kcal, ek);
    resume.replaceChildren(
      h('span', {class: 'ligne-rang'}, h('span', {class: 'ligne-nom'}, 'Total du ' + jour.toLowerCase()), h('span', {class: 'ligne-valeur'}, num(N.kcal) + ' kcal')),
      h('span', {class: 'ligne-rang'}, h('span', {class: 'ligne-date'}, num1(N.prot) + ' g de protéines (' + (ep === 0 ? '0' : signe1(ep)) + ' g)'),
        h('span', {class: 'ligne-bas'}, h('span', {class: 'ecart' + (Math.abs(ek) > 100 ? ' baisse' : ' hausse')}, (ek === 0 ? '0' : signe(ek)) + ' kcal'))),
      c ? h('span', {class: 'ligne-texte'}, c) : null);
    majs.forEach(f => f(N));
  };
  const blocs = [
    puces(JOURS_REPAS.map(j => [j, j.slice(0, 3)]), jour, v => { S.nutri.jour = v; rendreNutrition(); }, 'Jour'),
    h('p', {class: 'explication', style: 'margin-top:10px'}, 'Change une quantité (en g ou ml) : calories et protéines se recalculent. Touche le nom d\u2019un aliment pour le remplacer.'),
    resume];
  const colonnes = h('div', {class: 'colonnes'});
  blocs.push(colonnes);
  for(const r of REPAS){
    const R = J.repas.get(r);
    const sousTotal = h('span');
    majs.push(N => { sousTotal.textContent = kcalProt(N.repas.get(r)); });
    const lignes = R.lignes.map(x => {
      const l = x.l, valeurs = h('span', {class: 'aliment-val'});
      majs.push(N => { const y = N.repas.get(r).lignes.find(z => z.l === l); valeurs.textContent = !y || !y.connu ? 'Aliment absent de la liste : ?' : y.v ? kcalProt(y.v) : 'Indique la quantité'; });
      const q = h('input', {type: 'text', inputmode: 'decimal', autocomplete: 'off', enterkeyhint: 'done', 'aria-label': 'Quantité de ' + l.aliment + ' en grammes ou millilitres', value: l.q == null ? '' : num(l.q)});
      q.addEventListener('input', () => { const v = lire(q.value); l.q = v == null ? null : Math.min(3000, v); depots.repas.demander(); peindreResume(); });
      q.addEventListener('focus', () => { try{ q.select(); }catch(e){} });
      q.addEventListener('keydown', ev => { if(ev.key === 'Enter') q.blur(); });
      return h('div', {class: 'aliment'},
        h('button', {type: 'button', class: 'aliment-nom', 'aria-label': 'Remplacer ' + l.aliment, onclick: () => choisirAliment('Remplacer l\u2019aliment', a => { l.aliment = a.nom; depots.repas.demander(); rendreNutrition(); })}, l.aliment),
        valeurs,
        h('span', {class: 'quantite'}, q, 'g'),
        deuxTemps(h('button', {type: 'button', class: 'retirer', 'aria-label': 'Retirer ' + l.aliment}, '✕'), 'Ôter ?', () => { S.repas.splice(S.repas.indexOf(l), 1); depots.repas.demander(); rendreNutrition(); }));
    });
    colonnes.append(h('div', {class: 'liste repas-bloc'},
      h('div', {class: 'repas-tete'}, h('h3', null, r), sousTotal),
      lignes,
      h('div', {class: 'repas-pied'}, h('button', {type: 'button', class: 'btn discret petit', onclick: () => choisirAliment('Ajouter au repas du ' + r.toLowerCase(), a => {
        S.repas.push({jour, repas: r, aliment: a.nom, q: 100}); depots.repas.demander(); rendreNutrition();
      })}, '+ Ajouter un aliment'))));
  }
  peindreResume();
  return blocs;
}

function choisirAliment(titre, action){
  const boite = h('div', {class: 'feuille-liste'});
  const recherche = h('input', {type: 'search', 'aria-label': 'Rechercher un aliment', placeholder: 'Rechercher un aliment', autocomplete: 'off', enterkeyhint: 'search'});
  const dessiner = () => {
    const q = sansAccent(recherche.value);
    const liste = [...S.aliments].sort((a, b) => a.nom.localeCompare(b.nom, 'fr')).filter(a => !q || sansAccent(a.nom).includes(q));
    boite.replaceChildren(...(liste.length ? liste.map(a => h('button', {type: 'button', class: 'choix', onclick: () => { fermerFeuille(); action(a); }},
      h('span', {class: 'choix-nom'}, a.nom), h('span', {class: 'choix-info'}, num(a.kcal) + ' kcal / 100 g')))
      : [h('p', {class: 'feuille-vide'}, 'Aucun aliment à ce nom. Ajoute-le d\u2019abord dans la liste des aliments.')]));
  };
  recherche.addEventListener('input', dessiner);
  dessiner();
  ouvrirFeuille(titre, [h('div', {class: 'recherche'}, recherche), boite], {rafraichir: dessiner});
}

function vueAliments(){
  const liste = [...S.aliments].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  return [
    h('p', {class: 'sous-titre', style: 'margin-top:12px'}, 'Ta base d\u2019aliments : calories et protéines pour 100 g (ou 100 ml). Touche un aliment pour le modifier.'),
    h('div', {class: 'ajout'}, h('button', {type: 'button', class: 'btn large', onclick: () => ouvrirAliment(null)}, '+ Ajouter un aliment')),
    h('div', {class: 'liste multi', style: 'margin-top:12px'}, liste.map(a => h('button', {type: 'button', class: 'ligne', onclick: () => ouvrirAliment(a)},
      h('span', {class: 'ligne-rang'}, h('span', {class: 'ligne-nom'}, a.nom), h('span', {class: 'ligne-valeur'}, num(a.kcal) + ' kcal')),
      h('span', {class: 'ligne-detail'}, num(a.prot) + ' g de protéines pour 100 g' + (a.note ? '. ' + a.note : ''))))),
    liste.length ? null : h('p', {class: 'feuille-vide'}, 'Aucun aliment pour l\u2019instant.')];
}

function ouvrirAliment(A){
  const f = A ? copie(A) : {nom: '', kcal: null, prot: null, note: ''};
  const champ = (nomChamp, cle, nombreVoulu) => {
    const input = h('input', Object.assign({type: 'text', autocomplete: 'off', value: f[cle] == null ? '' : (nombreVoulu ? num(f[cle]) : f[cle])}, nombreVoulu ? {inputmode: 'decimal'} : {}));
    input.addEventListener('input', () => { f[cle] = nombreVoulu ? lire(input.value) : input.value; });
    return h('label', null, h('span', {class: 'champ-nom'}, nomChamp), input);
  };
  const utilise = A ? S.repas.filter(l => sansAccent(l.aliment) === sansAccent(A.nom)).length : 0;
  const finir = message => { depots.aliments.maintenant(); fermerFeuille(); rendreNutrition(); annoncer(message); };
  const actions = [h('button', {type: 'button', class: 'btn principal', onclick: () => {
    const nom = nomPropre(f.nom || '');
    if(!nom) return annoncer('Indique le nom de l\u2019aliment.');
    if(f.kcal == null || f.prot == null) return annoncer('Indique les calories et les protéines pour 100 g.');
    if(S.aliments.some(x => x !== A && sansAccent(x.nom) === sansAccent(nom))) return annoncer('« ' + nom + ' » est déjà dans la liste.');
    const neuf = {nom, kcal: f.kcal, prot: f.prot, note: (f.note || '').trim()};
    if(A){
      /* un aliment renommé reste lié aux repas qui l'utilisent */
      if(sansAccent(A.nom) !== sansAccent(nom)){ let touche = false; S.repas.forEach(l => { if(sansAccent(l.aliment) === sansAccent(A.nom)){ l.aliment = nom; touche = true; } }); if(touche) depots.repas.demander(); }
      S.aliments[S.aliments.indexOf(A)] = neuf;
    } else S.aliments.push(neuf);
    finir('Aliment enregistré');
  }}, 'Enregistrer')];
  if(A) actions.push(deuxTemps(h('button', {type: 'button', class: 'btn danger'}, 'Supprimer'), 'Confirmer la suppression', () => { S.aliments.splice(S.aliments.indexOf(A), 1); finir('Aliment supprimé'); }));
  ouvrirFeuille(A ? 'Modifier l\u2019aliment' : 'Nouvel aliment', h('div', {class: 'formulaire'},
    champ('Aliment', 'nom'),
    h('div', {class: 'duo'}, champ('Kcal / 100 g', 'kcal', true), champ('Protéines / 100 g (g)', 'prot', true)),
    champ('Remarque (facultatif)', 'note'),
    utilise ? h('p', {class: 'formulaire-aide'}, 'Utilisé dans ' + utilise + (utilise > 1 ? ' lignes' : ' ligne') + ' de repas : les calories de ces repas suivront la modification.') : null,
    h('div', {class: 'formulaire-actions'}, actions)));
}

/* =====================================================================
   Navigation
   ===================================================================== */
const VUES = ['seance', 'programme', 'progression', 'journal', 'nutrition'];
function aller(onglet){
  S.onglet = onglet;
  document.querySelectorAll('.onglets button').forEach(b => { if(b.dataset.onglet === onglet) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  VUES.forEach(v => { $('#vue-' + v).hidden = v !== onglet; });
  if(onglet === 'journal') rendreJournal();
  if(onglet === 'progression') rendreProgression();
  if(onglet === 'programme') rendreProgramme();
  if(onglet === 'nutrition') rendreNutrition();
  rendreBarre();
  window.scrollTo(0, 0);
}
document.querySelectorAll('.onglets button').forEach(b => b.addEventListener('click', () => {
  if(b.dataset.onglet === 'progression' && S.onglet === 'progression') S.detail = null;
  aller(b.dataset.onglet);
}));

function toutRendre(){ construireIndex(); rendreSeance(); rendreProgramme(); rendreProgression(); rendreJournal(); rendreNutrition(); }

S.brouillon = chargerBrouillon() || brouillonVide();
toutRendre();
})();
