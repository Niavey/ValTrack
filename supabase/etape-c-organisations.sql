-- ValTrack — étape C : organisations
-- ------------------------------------------------------------------
-- À exécuter une fois dans Supabase → SQL Editor. Ce script AJOUTE une table et une colonne ;
-- il ne supprime ni ne modifie aucune donnée existante (à part remplir la nouvelle colonne).
--
-- Avant : l'appli regroupait les équipes par nom ("DRX" d'un tournoi = "DRX" d'un autre).
-- Après : chaque équipe de tournoi est rattachée à une organisation. Renommer une organisation
-- garde son historique, et deux noms différents peuvent désigner la même organisation.
-- L'appli fonctionne aussi sans ce script (regroupement par nom), mais sans la correction
-- manuelle du roster. Il peut être exécuté plusieurs fois sans risque.
-- Après l'avoir exécuté : recharge la page de l'appli. Le bouton « Modifier le roster »
-- apparaît sur la page d'une équipe, et le champ « Organisation » à la création d'une équipe.

create table if not exists public.organizations (
  id text primary key,
  name text not null default '',
  -- roster actif corrigé à la main (ids des joueurs) ; null = déduit des tournois
  roster_override jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tournament_teams
  add column if not exists organization_id text references public.organizations (id) on delete set null;

-- Une organisation par nom d'équipe existant (même règle qu'avant : casse et espaces ignorés).
-- L'identifiant est stable : 'org_' + empreinte du nom.
insert into public.organizations (id, name)
select distinct on (lower(trim(name)))
  'org_' || substr(md5(lower(trim(name))), 1, 16), trim(name)
from public.tournament_teams
where trim(name) <> ''
order by lower(trim(name))
on conflict (id) do nothing;

update public.tournament_teams
set organization_id = 'org_' || substr(md5(lower(trim(name))), 1, 16)
where organization_id is null and trim(name) <> '';

-- Règles d'accès : lecture pour tous. Pour l'écriture, le script s'aligne automatiquement sur
-- la table "players" :
--   - si tu as déjà exécuté securite-rls.sql → écriture réservée aux comptes connectés ;
--   - sinon → écriture ouverte comme les autres tables. Quand tu exécuteras securite-rls.sql
--     plus tard, il verrouillera aussi la table organizations automatiquement.
alter table public.organizations enable row level security;

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

  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'organizations' loop
    execute format('drop policy %I on public.organizations', pol.policyname);
  end loop;

  create policy valtrack_lecture on public.organizations for select to anon, authenticated using (true);
  execute format('create policy valtrack_ajout on public.organizations for insert to %s with check (true)', writers);
  execute format('create policy valtrack_modif on public.organizations for update to %s using (true) with check (true)', writers);
  execute format('create policy valtrack_suppr on public.organizations for delete to %s using (true)', writers);

  raise notice 'Organisations : écriture autorisée pour %', writers;
end $$;
