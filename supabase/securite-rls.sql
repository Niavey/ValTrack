-- ValTrack — verrouillage des écritures Supabase
-- ------------------------------------------------------------------
-- À exécuter dans Supabase → SQL Editor, APRÈS avoir :
--   1. fait une sauvegarde (Database → Backups, ou export CSV des tables) ;
--   2. créé ton compte : Authentication → Users → "Add user" (email + mot de passe) ;
--   3. désactivé les inscriptions publiques : Authentication → Sign In / Providers →
--      décocher "Allow new users to sign up" (sinon n'importe qui peut se créer un compte) ;
--   4. vérifié que tu arrives à te connecter dans l'appli (bouton "Connexion").
--
-- Effet : tout le monde peut toujours LIRE (le site reste consultable),
-- mais seul un utilisateur connecté peut créer / modifier / supprimer.
-- Ce script ne touche à AUCUNE donnée : il ne modifie que les règles d'accès.
-- Pour revenir en arrière : supprimer les policies "valtrack_*" et remettre les anciennes.

do $$
declare
  t text;
  pol record;
begin
  foreach t in array array[
    'players', 'tournaments', 'tournament_teams', 'matches',
    'match_player_stats', 'team_logos', 'hidden_teams'
  ] || (case when to_regclass('public.organizations') is not null then array['organizations'] else array[]::text[] end)
    || (case when to_regclass('public.game_settings') is not null then array['game_settings'] else array[]::text[] end)
  loop
    execute format('alter table public.%I enable row level security', t);

    -- supprime les anciennes règles (probablement "tout le monde peut tout faire")
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', pol.policyname, t);
    end loop;

    execute format('create policy valtrack_lecture on public.%I for select to anon, authenticated using (true)', t);
    execute format('create policy valtrack_ajout on public.%I for insert to authenticated with check (true)', t);
    execute format('create policy valtrack_modif on public.%I for update to authenticated using (true) with check (true)', t);
    execute format('create policy valtrack_suppr on public.%I for delete to authenticated using (true)', t);
  end loop;
end $$;

-- Logos (Storage, bucket "team-logos") : lecture publique, envoi réservé aux connectés.
-- Pense aussi à supprimer dans Storage → Policies les anciennes règles qui autorisent "anon"
-- à envoyer des fichiers dans ce bucket.
create policy valtrack_logos_lecture on storage.objects
  for select to anon, authenticated using (bucket_id = 'team-logos');
create policy valtrack_logos_ajout on storage.objects
  for insert to authenticated with check (bucket_id = 'team-logos');

-- Optionnel mais conseillé : permet à l'appli d'enregistrer les stats d'un match sans les
-- supprimer d'abord (plus sûr). Échoue s'il existe déjà des doublons (match_id, player_id) ;
-- dans ce cas, l'appli continue de fonctionner avec l'ancienne méthode.
create unique index if not exists match_player_stats_match_player
  on public.match_player_stats (match_id, player_id);
