/* Carnet d'entraînement — version sans compte.

   Les données restent dans le navigateur de l'appareil (localStorage) : rien ne part sur Internet.
   Ce fichier fournit la même interface que stockage.js (window.claude.use('db' | 'user')), dont dépend app.js,
   plus deux boutons en bas de page : « Sauvegarder mes données » (fichier) et « Restaurer une sauvegarde ».
*/
(() => {
'use strict';
window.CARNET_SITE = true;
window.CARNET_LOCAL = true;

const UTILISATEUR = 'moi';
const CLE = 'carnet-entrainement:docs';
const cache = new Map();
const abonnes = new Set();

class ErreurStockage extends Error {
  constructor(code, message){ super(message || code); this.code = code; }
}
const figer = v => { if(v && typeof v === 'object'){ Object.values(v).forEach(figer); Object.freeze(v); } return v; };

/* ------------------------------------------------------------ lecture et écriture dans le navigateur */
function charger(){
  cache.clear();
  try{
    const brut = JSON.parse(localStorage.getItem(CLE) || '{}');
    for(const [chemin, corps] of Object.entries(brut)) if(corps && typeof corps === 'object') cache.set(chemin, figer(corps));
  }catch(e){}
}
function enregistrer(){
  try{ localStorage.setItem(CLE, JSON.stringify(Object.fromEntries(cache))); }
  catch(e){ throw new ErreurStockage('quota_exceeded', 'Stockage du navigateur plein ou bloqué'); }
}
charger();
/* Un autre onglet a modifié le carnet : on relit. */
window.addEventListener('storage', ev => { if(ev.key === CLE){ charger(); prevenir(); } });
const pret = () => Promise.resolve();

function el(tag, attrs, ...enfants){
  const e = document.createElement(tag);
  for(const k in attrs || {}) if(attrs[k] != null && attrs[k] !== false) e.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
  e.append(...enfants);
  return e;
}

/* ------------------------------------------------------------ sauvegarde dans un fichier */
function sauvegarder(){
  const fichier = new Blob([JSON.stringify({carnet: 1, docs: Object.fromEntries(cache)}, null, 1)], {type: 'application/json'});
  const lien = el('a', {href: URL.createObjectURL(fichier), download: 'carnet-' + new Date().toISOString().slice(0, 10) + '.json'});
  document.body.append(lien); lien.click(); lien.remove();
  setTimeout(() => URL.revokeObjectURL(lien.href), 10000);
}
function restaurer(){
  const champ = el('input', {type: 'file', accept: '.json,application/json'});
  champ.addEventListener('change', async () => {
    const f = champ.files && champ.files[0];
    if(!f) return;
    try{
      const lu = JSON.parse(await f.text());
      const docs = lu && lu.docs;
      if(!docs || typeof docs !== 'object') throw new Error('format');
      if(!confirm('Remplacer tout le carnet de cet appareil par cette sauvegarde ?')) return;
      cache.clear();
      for(const [chemin, corps] of Object.entries(docs))
        if(typeof chemin === 'string' && chemin.startsWith('data/users/') && corps && typeof corps === 'object' && !Array.isArray(corps)) cache.set(chemin, figer(corps));
      enregistrer(); prevenir();
      alert('Sauvegarde restaurée.');
    }catch(e){ alert('Ce fichier n\u2019est pas une sauvegarde du carnet.'); }
  });
  champ.click();
}
function piedDePage(){
  const page = document.querySelector('.page');
  if(!page || page.querySelector('.pied-site')) return;
  const b1 = el('button', {type: 'button'}, 'Sauvegarder mes données');
  const b2 = el('button', {type: 'button'}, 'Restaurer une sauvegarde');
  b1.addEventListener('click', sauvegarder);
  b2.addEventListener('click', restaurer);
  page.append(el('p', {class: 'pied-site'}, 'Ton carnet est enregistré sur cet appareil uniquement.', el('br'), b1, el('br'), b2));
}
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', piedDePage); else piedDePage();

/* ------------------------------------------------------------ abonnements */
function prevenir(){ for(const a of abonnes) a(); }
/* `calcul` renvoie {empreinte, instantane} ; l'abonné n'est rappelé que si l'empreinte a changé. */
function abonner(calcul, suivant, erreur){
  let derniere, actif = true;
  const passer = () => {
    if(!actif) return;
    const {empreinte, instantane} = calcul();
    if(empreinte === derniere) return;
    derniere = empreinte;
    try{ suivant(instantane); }catch(e){ setTimeout(() => { throw e; }); }
  };
  pret().then(() => { if(actif){ abonnes.add(passer); passer(); } }, e => { if(erreur) erreur(e); });
  return () => { actif = false; abonnes.delete(passer); };
}

/* ------------------------------------------------------------ documents et collections */
const SEGMENT = /^[A-Za-z0-9_.~:@+-]{1,200}$/;
function segments(chemin, pair){
  const s = String(chemin).split('/');
  if(!s.every(x => SEGMENT.test(x) && x !== '.' && x !== '..') || (s.length % 2 === 0) !== pair) throw new TypeError('Chemin invalide : ' + chemin);
  return s;
}
const instantaneDoc = chemin => {
  const corps = cache.get(chemin);
  return {id: chemin.slice(chemin.lastIndexOf('/') + 1), exists: corps !== undefined, data: () => corps, metadata: {fromCache: false, hasPendingWrites: false}};
};
function idNeuf(){
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789', octets = crypto.getRandomValues(new Uint8Array(20));
  return [...octets].map(o => alphabet[o % alphabet.length]).join('');
}

function docRef(chemin){
  const s = segments(chemin, true);
  const ref = {
    id: s[s.length - 1], path: chemin,
    async get(){ await pret(); return instantaneDoc(chemin); },
    async set(donnees){
      if(!donnees || typeof donnees !== 'object' || Array.isArray(donnees)) throw new ErreurStockage('invalid_argument');
      const corps = JSON.parse(JSON.stringify(donnees));
      await pret();
      const avant = cache.get(chemin);
      cache.set(chemin, figer(corps));
      try{ enregistrer(); }catch(e){ if(avant === undefined) cache.delete(chemin); else cache.set(chemin, avant); throw e; }
      prevenir();
    },
    async update(donnees){
      await pret();
      const actuel = cache.get(chemin);
      if(actuel === undefined) throw new ErreurStockage('invalid_argument');
      return ref.set(Object.assign({}, actuel, donnees));
    },
    async delete(){
      await pret();
      if(cache.delete(chemin)){ enregistrer(); prevenir(); }
    },
    onSnapshot(suivant, erreur){
      return abonner(() => ({empreinte: JSON.stringify(cache.get(chemin) ?? null), instantane: instantaneDoc(chemin)}), suivant, erreur);
    },
    collection(nom){ return colRef(chemin + '/' + nom); },
  };
  return ref;
}

function colRef(chemin, tri, limite){
  segments(chemin, false);
  const prefixe = chemin + '/';
  const lister = () => {
    let docs = [];
    for(const c of cache.keys()) if(c.startsWith(prefixe) && !c.includes('/', prefixe.length)) docs.push(instantaneDoc(c));
    if(tri){
      const [champ, sens] = tri, facteur = sens === 'desc' ? -1 : 1;
      docs.sort((a, b) => {
        const x = a.data()[champ], y = b.data()[champ];
        if(x === undefined || y === undefined) return x === y ? 0 : x === undefined ? 1 : -1;   // champ absent : à la fin
        return (x < y ? -1 : x > y ? 1 : 0) * facteur;
      });
    } else docs.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    return limite ? docs.slice(0, limite) : docs;
  };
  const resultat = docs => ({docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: {fromCache: false, hasPendingWrites: false}});
  const requete = {
    path: chemin,
    orderBy(champ, sens){ return colRef(chemin, [champ, sens || 'asc'], limite); },
    limit(n){ return colRef(chemin, tri, n); },
    where(){ throw new ErreurStockage('invalid_argument', 'Les filtres ne sont pas disponibles.'); },
    doc(id){ return docRef(prefixe + (id || idNeuf())); },
    async add(donnees){ const ref = requete.doc(); await ref.set(donnees); return ref; },
    async get(){ await pret(); return resultat(lister()); },
    onSnapshot(suivant, erreur){
      return abonner(() => { const docs = lister(); return {empreinte: docs.map(d => d.id + JSON.stringify(d.data())).join('\n'), instantane: resultat(docs)}; }, suivant, erreur);
    },
  };
  return requete;
}

const db = Object.freeze({doc: docRef, collection: colRef});
const user = Object.freeze({
  id: async () => UTILISATEUR,
  isOwner: async () => true, canEdit: async () => true, can: async () => true,
});
window.claude = Object.freeze({
  use: async nom => nom === 'db' ? db : nom === 'user' ? user : null,
});
})();
