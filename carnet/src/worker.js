/* Carnet d'entraînement — serveur du site (Cloudflare Worker).

   Rôle : protéger le carnet par un mot de passe et ranger ses données dans la base D1.
   Les fichiers de l'interface (dossier public/) sont servis directement par Cloudflare ;
   seules les adresses /api/... arrivent ici.

   Liaisons attendues (voir wrangler.jsonc) :
     env.DB            base D1
     env.ASSETS        fichiers statiques
     env.MOT_DE_PASSE  secret, au moins 8 caractères (npx wrangler secret put MOT_DE_PASSE)
*/
import INITIALES from './donnees-initiales.js';

const COOKIE = 'carnet_session';
const DUREE_SESSION = 180 * 24 * 3600;        // 180 jours, en secondes
const TAILLE_MAX = 256 * 1024;                // taille maximale d'un document, en octets
const DOCS_MAX = 20000;                       // nombre maximal de documents
const PAGE = 2000;                            // documents renvoyés par appel
const ESSAIS_MAX = 8, FENETRE = 15 * 60 * 1000;   // 8 mots de passe faux en 15 minutes, puis blocage
const CHEMIN = /^[A-Za-z0-9_.~:@+-]{1,200}(\/[A-Za-z0-9_.~:@+-]{1,200}){1,15}$/;
const enc = new TextEncoder();

const json = (corps, status = 200, entetes = {}) => new Response(JSON.stringify(corps), {
  status, headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...entetes},
});

/* ---------------------------------------------------------------- base */
let installation = null;
function installer(env){
  if(!installation) installation = (async () => {
    await env.DB.batch([
      env.DB.prepare('CREATE TABLE IF NOT EXISTS docs (chemin TEXT PRIMARY KEY, corps TEXT, rev INTEGER NOT NULL)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS docs_rev ON docs (rev)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS essais (ip TEXT PRIMARY KEY, n INTEGER NOT NULL, debut INTEGER NOT NULL)'),
    ]);
    /* Base vide : on y copie les données de départ, une seule fois. */
    const {n} = await env.DB.prepare('SELECT COUNT(*) AS n FROM docs').first();
    if(n === 0){
      const entrees = Object.entries(INITIALES);
      if(entrees.length) await env.DB.batch(entrees.map(([chemin, corps], i) =>
        env.DB.prepare('INSERT OR IGNORE INTO docs (chemin, corps, rev) VALUES (?1, ?2, ?3)').bind(chemin, JSON.stringify(corps), i + 1)));
    }
  })().catch(e => { installation = null; throw e; });
  return installation;
}

/* ---------------------------------------------------------------- mot de passe et session */
const hex = tampon => [...new Uint8Array(tampon)].map(o => o.toString(16).padStart(2, '0')).join('');
async function signature(env, texte){
  const graine = await crypto.subtle.digest('SHA-256', enc.encode('carnet-entrainement|' + env.MOT_DE_PASSE));
  const cle = await crypto.subtle.importKey('raw', graine, {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', cle, enc.encode(texte)));
}
/* Comparaison à durée constante */
function egal(a, b){
  if(a.length !== b.length) return false;
  let d = 0;
  for(let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function lireCookie(request){
  for(const morceau of (request.headers.get('Cookie') || '').split(';')){
    const i = morceau.indexOf('=');
    if(i > 0 && morceau.slice(0, i).trim() === COOKIE) return morceau.slice(i + 1).trim();
  }
  return '';
}
/* Le jeton de session vaut « échéance.signature » : changer le mot de passe déconnecte tous les appareils. */
async function sessionValide(request, env){
  const [echeance, sig] = lireCookie(request).split('.');
  if(!echeance || !sig || !/^\d+$/.test(echeance) || Number(echeance) < Date.now() / 1000) return false;
  return egal(sig, await signature(env, 'session|' + echeance));
}
function cookie(valeur, duree, url){
  return COOKIE + '=' + valeur + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + duree + (url.protocol === 'https:' ? '; Secure' : '');
}

async function connexion(request, env, url){
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const maintenant = Date.now();
  const essai = await env.DB.prepare('SELECT n, debut FROM essais WHERE ip = ?1').bind(ip).first();
  if(essai && maintenant - essai.debut < FENETRE && essai.n >= ESSAIS_MAX)
    return json({erreur: 'Trop d\u2019essais. Réessaie dans un quart d\u2019heure.'}, 429);

  let fourni = '';
  try{ const corps = await request.json(); if(corps && typeof corps.motDePasse === 'string') fourni = corps.motDePasse.slice(0, 500); }catch(e){}
  const juste = egal(await signature(env, 'mdp|' + fourni), await signature(env, 'mdp|' + env.MOT_DE_PASSE));
  if(!juste){
    await env.DB.prepare(`INSERT INTO essais (ip, n, debut) VALUES (?1, 1, ?2)
      ON CONFLICT(ip) DO UPDATE SET n = CASE WHEN ?2 - debut >= ?3 THEN 1 ELSE n + 1 END, debut = CASE WHEN ?2 - debut >= ?3 THEN ?2 ELSE debut END`)
      .bind(ip, maintenant, FENETRE).run();
    return json({erreur: 'Mot de passe incorrect.'}, 401);
  }
  if(essai) await env.DB.prepare('DELETE FROM essais WHERE ip = ?1').bind(ip).run();
  const echeance = Math.floor(maintenant / 1000) + DUREE_SESSION;
  return json({connecte: true}, 200, {'Set-Cookie': cookie(echeance + '.' + await signature(env, 'session|' + echeance), DUREE_SESSION, url)});
}

/* ---------------------------------------------------------------- documents */
/* Chaque écriture reçoit un numéro de révision croissant : un appareil ne redemande que ce qui a changé depuis sa dernière visite.
   Un document supprimé garde sa ligne, corps vide, pour que les autres appareils apprennent la suppression. */
async function lireDocs(env, url){
  const apres = Math.max(0, parseInt(url.searchParams.get('apres') || '0', 10) || 0);
  const [liste, sommet] = await env.DB.batch([
    env.DB.prepare('SELECT chemin, corps, rev FROM docs WHERE rev > ?1 AND (corps IS NOT NULL OR ?1 > 0) ORDER BY rev LIMIT ?2').bind(apres, PAGE + 1),
    env.DB.prepare('SELECT COALESCE(MAX(rev), 0) AS rev FROM docs'),
  ]);
  const lignes = liste.results, suite = lignes.length > PAGE;
  if(suite) lignes.pop();
  return json({
    docs: lignes.map(l => ({chemin: l.chemin, corps: l.corps == null ? null : JSON.parse(l.corps), rev: l.rev})),
    rev: suite ? lignes[lignes.length - 1].rev : Math.max(apres, sommet.results[0].rev),
    suite,
  });
}
async function ecrireDoc(request, env, chemin){
  const brut = await request.text();
  if(enc.encode(brut).length > TAILLE_MAX) return json({erreur: 'Document trop volumineux.'}, 413);
  let corps;
  try{ corps = JSON.parse(brut); }catch(e){ return json({erreur: 'Contenu illisible.'}, 400); }
  if(!corps || typeof corps !== 'object' || Array.isArray(corps)) return json({erreur: 'Contenu invalide.'}, 400);
  const existe = await env.DB.prepare('SELECT 1 AS x FROM docs WHERE chemin = ?1').bind(chemin).first();
  if(!existe){
    const {n} = await env.DB.prepare('SELECT COUNT(*) AS n FROM docs').first();
    if(n >= DOCS_MAX) return json({erreur: 'Stockage plein.'}, 507);
  }
  const ligne = await env.DB.prepare(`INSERT INTO docs (chemin, corps, rev) VALUES (?1, ?2, (SELECT COALESCE(MAX(rev), 0) + 1 FROM docs))
    ON CONFLICT(chemin) DO UPDATE SET corps = excluded.corps, rev = (SELECT COALESCE(MAX(rev), 0) + 1 FROM docs) RETURNING rev`)
    .bind(chemin, JSON.stringify(corps)).first();
  return json({rev: ligne.rev});
}
async function supprimerDoc(env, chemin){
  await env.DB.prepare('UPDATE docs SET corps = NULL, rev = (SELECT COALESCE(MAX(rev), 0) + 1 FROM docs) WHERE chemin = ?1 AND corps IS NOT NULL').bind(chemin).run();
  return json({ok: true});
}

/* ---------------------------------------------------------------- routes */
async function api(request, env, url){
  if(typeof env.MOT_DE_PASSE !== 'string' || env.MOT_DE_PASSE.length < 8)
    return json({erreur: 'Le mot de passe du site n\u2019est pas configuré (secret MOT_DE_PASSE, 8 caractères au moins).'}, 503);
  await installer(env);
  const route = request.method + ' ' + url.pathname;

  if(route === 'GET /api/session') return json({connecte: await sessionValide(request, env)});

  /* Toute écriture doit porter cet en-tête : un autre site ne peut pas l'ajouter à une requête envoyée à ta place. */
  if(request.method !== 'GET' && request.headers.get('X-Carnet') !== '1') return json({erreur: 'Requête refusée.'}, 403);

  if(route === 'POST /api/connexion') return connexion(request, env, url);
  if(route === 'POST /api/deconnexion') return json({connecte: false}, 200, {'Set-Cookie': cookie('', 0, url)});

  if(!(await sessionValide(request, env))) return json({erreur: 'Connexion requise.'}, 401);

  if(route === 'GET /api/docs') return lireDocs(env, url);
  if(url.pathname === '/api/doc' && (request.method === 'PUT' || request.method === 'DELETE')){
    const chemin = url.searchParams.get('chemin') || '';
    if(!CHEMIN.test(chemin) || chemin.length > 1000 || chemin.split('/').some(s => s === '.' || s === '..')) return json({erreur: 'Chemin invalide.'}, 400);
    return request.method === 'PUT' ? ecrireDoc(request, env, chemin) : supprimerDoc(env, chemin);
  }
  return json({erreur: 'Adresse inconnue.'}, 404);
}

export default {
  async fetch(request, env){
    const url = new URL(request.url);
    if(!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try{ return await api(request, env, url); }
    catch(e){
      console.error('Erreur du serveur :', e && e.stack || e);
      return json({erreur: 'Erreur du serveur.'}, 500);
    }
  },
};
