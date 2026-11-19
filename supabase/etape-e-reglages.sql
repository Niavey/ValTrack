-- ValTrack — agents et maps ajoutés depuis l'appli
-- ------------------------------------------------------------------
-- À exécuter une fois dans Supabase → SQL Editor. Ce script AJOUTE une petite table ; il ne
-- touche à aucune donnée existante et peut être relancé sans risque.
-- Sans lui, l'appli fonctionne avec les listes d'agents et de maps intégrées, mais les boutons
-- « Ajouter un agent » / « Ajouter une map » ne peuvent rien enregistrer.
-- Après l'avoir exécuté : recharge la page de l'appli.

create table if not exists public.game_settings (
  key text primary key,          -- "agents" ou "maps"
  value jsonb not null,          -- agents : [{ "name": "Nova", "role": "initiator" }] ; maps : ["Drift"]
  updated_at timestamptz not null default now()
);

-- Règles d'accès : lecture pour tous ; écriture alignée sur la table "players"
-- (comptes connectés si securite-rls.sql a été exécuté, sinon ouverte comme le reste).
alter table public.game_settings enable row level security;

do $$
declare
  writers text;
  pol record;
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'players' and policyname = 'valtrack_modif'
  ) then
    writers := 'authenticated';
  else
    writers := 'anon, authenticated';
  end if;

  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'game_settings' loop
    execute format('drop policy %I on public.game_settings', pol.policyname);
  end loop;

  create policy valtrack_lecture on public.game_settings for select to anon, authenticated using (true);
  execute format('create policy valtrack_ajout on public.game_settings for insert to %s with check (true)', writers);
  execute format('create policy valtrack_modif on public.game_settings for update to %s using (true) with check (true)', writers);
  execute format('create policy valtrack_suppr on public.game_settings for delete to %s using (true)', writers);

  raise notice 'Réglages de jeu : écriture autorisée pour %', writers;
end $$;
