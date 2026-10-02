/* Carnet d'entraînement — stockage du site.

   L'application (app.js) a été écrite pour la base de données fournie par Claude (window.claude.use('db')).
   Ce fichier fournit la même interface à partir du serveur du site (/api/...) : connexion par mot de passe,
   copie locale des documents, et synchronisation régulière pour que tous les appareils voient les mêmes données.
*/
(() => {
'use strict';
window.CARNET_SITE = true;

const UTILISATEUR = 'moi';            // un seul carnet par site : data/users/moi/...
const RYTHME = 30000;                 // on redemande les changements toutes les 30 secondes quand la page est visible
const cache = new Map();              // chemin -> corps du document
const abonnes = new Set();
let rev = 0;                          // dernière révision connue du serveur
let session = null, premiereSynchro = null, synchroEnCours = null;

class ErreurStockage extends Error {
  constructor(code, message){ super(message || code); this.code = code; }
}
const attendre = ms => new Promise(ok => setTimeout(ok, ms));
const figer = v => { if(v && typeof v === 'object'){ Object.values(v).forEach(figer); Object.freeze(v); } return v; };

/* ------------------------------------------------------------ appels au serveur */
async function appel(methode, url, corps){
  let r;
  try{
    r = await fetch(url, {
      method: methode, credentials: 'same-origin', cache: 'no-store',
      headers: corps === undefined ? {'X-Carnet': '1'} : {'X-Carnet': '1', 'Content-Type': 'application/json'},
      body: corps === undefined ? undefined : JSON.stringify(corps),
    });
  }catch(e){ throw new ErreurStockage('unavailable', 'Réseau indisponible'); }
  if(r.status === 401){ reconnecter(); throw new ErreurStockage('not_granted', 'Connexion requise'); }
  if(r.status === 507) throw new ErreurStockage('quota_exceeded');
  if(r.status === 400 || r.status === 413) throw new ErreurStockage('invalid_argument');
  if(!r.ok) throw new ErreurStockage('unavailable');
  return r.json();
}

/* ------------------------------------------------------------ connexion */
function el(tag, attrs, ...enfants){
  const e = document.createElement(tag);
  for(const k in attrs || {}) if(attrs[k] != null && attrs[k] !== false) e.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
  e.append(...enfants);
  return e;
}
let formulaireOuvert = null;
function formulaire(){
  if(formulaireOuvert) return formulaireOuvert;
  formulaireOuvert = new Promise(ok => {
    const champ = el('input', {type: 'password', autocomplete: 'current-password', required: true, 'aria-describedby': 'connexion-erreur'});
    const erreur = el('p', {class: 'connexion-erreur', id: 'connexion-erreur', role: 'alert', hidden: true});
    const bouton = el('button', {type: 'submit', class: 'btn principal large'}, 'Se connecter');
    const boite = el('form', {class: 'connexion-boite'},
      el('h1', {class: 'titre', id: 'connexion-titre'}, 'Carnet d\u2019entraînement'),
      el('p', {class: 'sous-titre'}, 'Entre le mot de passe du site pour retrouver tes séances.'),
      el('label', null, el('span', {class: 'champ-nom'}, 'Mot de passe'), champ),
      erreur, bouton);
    const voile = el('div', {class: 'connexion', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'connexion-titre'}, boite);
    const dire = t => { erreur.textContent = t; erreur.hidden = false; };
    boite.addEventListener('submit', async ev => {
      ev.preventDefault();
      bouton.disabled = true; bouton.textContent = 'Connexion…'; erreur.hidden = true;
      try{
        const r = await fetch('/api/connexion', {method: 'POST', credentials: 'same-origin', cache: 'no-store',
          headers: {'X-Carnet': '1', 'Content-Type': 'application/json'}, body: JSON.stringify({motDePasse: champ.value})});
        const corps = await r.json().catch(() => ({}));
        if(r.ok){ voile.remove(); formulaireOuvert = null; ok(); return; }
        dire(r.status === 401 ? 'Mot de passe incorrect.' : corps.erreur || 'Connexion impossible pour l\u2019instant. Réessaie dans un moment.');
        if(r.status === 401){ champ.value = ''; champ.focus(); }
      }catch(e){ dire('Pas de réseau. Vérifie ta connexion et réessaie.'); }
      bouton.disabled = false; bouton.textContent = 'Se connecter';
    });
    const poser = () => { document.body.append(voile); champ.focus(); };
    if(document.body) poser(); else document.addEventListener('DOMContentLoaded', poser);
  });
  return formulaireOuvert;
}
/* Résolu une fois la personne connectée. */
function connecte(){
  if(!session) session = (async () => {
    for(;;){
      try{
        const r = await fetch('/api/session', {credentials: 'same-origin', cache: 'no-store'});
        const etat = await r.json();
        if(r.ok && etat.connecte) return;
        if(r.ok || r.status === 503) break;      // pas connecté, ou site pas encore configuré : le formulaire affichera le message du serveur
      }catch(e){}
      await attendre(3000);                      // pas de réseau : on réessaie
    }
    await formulaire();
  })();
  return session;
}
/* La session a expiré en cours de route : on redemande le mot de passe, puis on resynchronise. */
function reconnecter(){
  if(formulaireOuvert) return;
  formulaire().then(() => synchroniser().catch(() => {}));
}

/* ------------------------------------------------------------ synchronisation */
function synchroniser(){
  if(!synchroEnCours) synchroEnCours = (async () => {
    let change = false, suite = true;
    while(suite){
      const r = await appel('GET', '/api/docs?apres=' + rev);
      for(const d of r.docs){
        if(d.corps == null) change = cache.delete(d.chemin) || change;
        else { cache.set(d.chemin, figer(d.corps)); change = true; }
      }
      rev = r.rev; suite = r.suite;
    }
    if(change) prevenir();
  })().finally(() => { synchroEnCours = null; });
  return synchroEnCours;
}
/* Résolu quand les données sont chargées une première fois. */
function pret(){
  if(!premiereSynchro) premiereSynchro = (async () => {
    await connecte();
    for(;;){
      try{ await synchroniser(); break; }
      catch(e){ if(e.code === 'not_granted') await formulaire(); else await attendre(3000); }
    }
    piedDePage();
    const rafraichir = () => { if(document.visibilityState === 'visible') synchroniser().catch(() => {}); };
    setInterval(rafraichir, RYTHME);
    document.addEventListener('visibilitychange', rafraichir);
    window.addEventListener('focus', rafraichir);
    window.addEventListener('online', rafraichir);
  })();
  return premiereSynchro;
}
function piedDePage(){
  const page = document.querySelector('.page');
  if(!page || page.querySelector('.pied-site')) return;
  const bouton = el('button', {type: 'button'}, 'Se déconnecter');
  bouton.addEventListener('click', async () => {
    try{ const r = await fetch('/api/deconnexion', {method: 'POST', credentials: 'same-origin', headers: {'X-Carnet': '1'}}); await r.text(); }catch(e){}
    location.reload();
  });
  page.append(el('p', {class: 'pied-site'}, bouton));
}

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
  const adresse = '/api/doc?chemin=' + encodeURIComponent(chemin);
  const ref = {
    id: s[s.length - 1], path: chemin,
    async get(){ await pret(); return instantaneDoc(chemin); },
    async set(donnees){
      if(!donnees || typeof donnees !== 'object' || Array.isArray(donnees)) throw new ErreurStockage('invalid_argument');
      const corps = JSON.parse(JSON.stringify(donnees));
      await pret();
      await appel('PUT', adresse, corps);
      cache.set(chemin, figer(corps)); prevenir();
    },
    async update(donnees){
      await pret();
      const actuel = cache.get(chemin);
      if(actuel === undefined) throw new ErreurStockage('invalid_argument');
      return ref.set(Object.assign({}, actuel, donnees));
    },
    async delete(){
      await pret();
      await appel('DELETE', adresse);
      if(cache.delete(chemin)) prevenir();
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
    where(){ throw new ErreurStockage('invalid_argument', 'Les filtres ne sont pas disponibles sur le site.'); },
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
  id: async () => { await connecte(); return UTILISATEUR; },
  isOwner: async () => true, canEdit: async () => true, can: async () => true,
});

window.claude = Object.freeze({
  use: async nom => {
    if(nom === 'db'){ await pret(); return db; }
    if(nom === 'user'){ await connecte(); return user; }
    return null;
  },
});
})();
