# ValTrack

Registre de performances Valorant : classement des joueurs, tournois, records BO3/BO5,
MVP/MJ et classement Elo des équipes. React + Vite, données stockées dans Supabase.

## Démarrer

```bash
npm install
cp .env.example .env   # puis remplis l'URL et la clé publique de ton projet Supabase
npm run dev
```

## Scripts

| Commande | Rôle |
|---|---|
| `npm run dev` | serveur de développement |
| `npm run build` | build de production dans `dist/` |
| `npm run lint` | analyse du code (oxlint) |
| `npm test` | tests des calculs (Vitest) |

## Organisation du code

```
src/
  App.jsx             interface (vues, modales, état de l'appli)
  valtrackDb.js       lecture / écriture Supabase
  supabaseClient.js   connexion Supabase
  domain/             calculs purs, testés
    stats.js          stats joueurs : ajout/retrait d'un match, dérivées (KD, KDA…), tri
    records.js        format BO3/BO5, MVP/MJ, records sur un match
    elo.js            classement Elo des équipes
    filters.js        filtres du classement et des records
supabase/
  securite-rls.sql    règles d'accès : lecture publique, écriture réservée aux connectés
```

## Sécurité

La clé `VITE_SUPABASE_ANON_KEY` est publique par nature (elle finit dans le JavaScript du
site). Ce qui protège les données, ce sont les règles RLS de Supabase : voir
`supabase/securite-rls.sql` et le bouton **Connexion** en haut de l'appli.
