# Carnet d'entraînement — site

Site personnel : saisie des séances de sport, programme, progression, journal, nutrition.
Interface en français, tutoiement. Un seul carnet par site, protégé par un mot de passe.
L'utilisateur n'est pas développeur : explique chaque étape simplement et fais toi-même tout ce qui peut l'être.

## Structure

| Fichier | Rôle |
|---|---|
| `public/index.html` | Page unique : structure et toute la mise en forme (téléphone, tablette, ordinateur, clair/sombre). |
| `public/app.js` | L'application : affichage, saisie, calculs (décisions augmenter/conserver, consignes, nutrition). |
| `public/stockage.js` | Connexion par mot de passe et synchronisation. Fournit `window.claude.use('db' \| 'user')`, l'interface qu'utilise `app.js`. |
| `public/_headers` | En-têtes de sécurité (CSP : scripts du site uniquement). |
| `src/worker.js` | Serveur (Cloudflare Worker) : `/api/session`, `/api/connexion`, `/api/deconnexion`, `/api/docs`, `/api/doc`. |
| `src/donnees-initiales.js` | Données de départ, copiées dans la base une seule fois quand elle est vide. |
| `wrangler.jsonc` | Configuration Cloudflare : fichiers statiques (`public/`), base D1 (`DB`). |

Données : une table `docs (chemin, corps JSON, rev)`. Chemins utilisés par l'application :
`data/users/moi/reglages` (programme, RIR minimum, objectifs nutrition), `data/users/moi/aliments`,
`data/users/moi/repas`, `data/users/moi/journal/seances/<id>` (une séance par document).
Chaque écriture reçoit une révision croissante ; les appareils redemandent toutes les 30 secondes ce qui a changé.

## Commandes

```bash
npm install
cp .dev.vars.exemple .dev.vars   # mot de passe d'essai pour l'ordinateur local
npm run dev                      # http://localhost:8787
npm run deploy                   # mise en ligne
npm run sauvegarde               # copie de la base en ligne dans sauvegarde.sql
```

## Mise en ligne (première fois)

1. **Compte Cloudflare.** L'utilisateur en crée un lui-même sur https://dash.cloudflare.com s'il n'en a pas (l'offre gratuite suffit en principe ; vérifier les limites en vigueur).
2. `npm install`, puis `npx wrangler login` : une page s'ouvre dans le navigateur, l'utilisateur valide.
3. **Base de données** : `npx wrangler d1 create carnet-entrainement`, puis remplacer `database_id` dans `wrangler.jsonc` par l'identifiant renvoyé.
   (Les versions récentes de wrangler savent aussi créer la base au déploiement ; si la commande a changé, suivre https://developers.cloudflare.com/d1/get-started/.)
4. `npm run deploy`. Noter l'adresse affichée (`https://carnet-entrainement.<compte>.workers.dev`).
   À ce stade le site répond « mot de passe non configuré » : il reste fermé tant que l'étape 5 n'est pas faite.
5. **Mot de passe** : `npx wrangler secret put MOT_DE_PASSE`. C'est l'utilisateur qui le choisit et le tape lui-même dans le terminal
   (12 caractères ou plus conseillés, 8 au minimum). Ne jamais l'écrire dans un fichier, ni le demander dans la conversation.
6. **Vérifier** : ouvrir l'adresse, se connecter, contrôler que le programme, les 4 séances de départ et les repas sont là ;
   noter une séance d'essai, la retrouver sur un second appareil, puis la supprimer.
7. Montrer à l'utilisateur comment ajouter le site à l'écran d'accueil de son téléphone (menu du navigateur, « Ajouter à l'écran d'accueil »).

Les tables et les données de départ se créent toutes seules au premier appel : aucune migration à lancer.

## Règles

- Le mot de passe ne vit que dans le secret Cloudflare `MOT_DE_PASSE` (et dans `.dev.vars` pour les essais locaux, fichier ignoré par git).
  Le changer (`npx wrangler secret put MOT_DE_PASSE`) déconnecte tous les appareils.
- `src/donnees-initiales.js` contient des données personnelles : si le projet va sur GitHub, le dépôt doit être **privé**.
- Tout ce qui est dans `public/` est lisible sans mot de passe : n'y mettre aucune donnée personnelle.
- Le site ne doit pas s'ouvrir sans mot de passe : garder le refus (503) quand `MOT_DE_PASSE` manque.
- Garder l'interface `window.claude.use('db')` de `stockage.js` : `app.js` en dépend (doc, collection, onSnapshot, set, delete, orderBy, limit).
- Les calculs reproduisent un classeur Excel d'origine (décision, charge suivante, consigne, force estimée, volume, bilan nutrition) :
  ne pas en changer les règles sans que l'utilisateur le demande.
- Avant toute modification de la base ou du format des documents : `npm run sauvegarde`.

## État des essais

Testé en local avec `wrangler dev` (connexion, refus sans session, blocage après 8 mots de passe faux, données de départ,
saisie d'une séance, synchronisation entre deux navigateurs, suppression, déconnexion, affichage téléphone et ordinateur).
La mise en ligne réelle sur un compte Cloudflare n'a pas été faite : c'est l'objet de la section ci-dessus.
