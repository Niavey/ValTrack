-- ValTrack — étape C : organisations
-- ------------------------------------------------------------------
-- À exécuter une fois dans Supabase → SQL Editor. Ce script AJOUTE une table et une colonne ;
-- il ne supprime ni ne modifie aucune donnée existante (à part remplir la nouvelle colonne).
--
-- Avant : l'appli regroupait les équipes par nom ("DRX" d'un tournoi = "DRX" d'un autre).
-- Après : chaque équipe de tournoi est rattachée à une organisation. Renommer une organisation
-- garde son historique, et deux noms différents peuvent désigner la même organisation.
-- L'appli fonctionne aussi sans ce script (regroupement par nom), mais sans la correction
-- manuelle du roster.

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

-- Mêmes règles d'accès que les autres tables si tu as exécuté securite-rls.sql :
-- lecture pour tous, écriture pour les comptes connectés.
alter table public.organizations enable row level security;
drop policy if exists valtrack_lecture on public.organizations;
drop policy if exists valtrack_ajout on public.organizations;
drop policy if exists valtrack_modif on public.organizations;
drop policy if exists valtrack_suppr on public.organizations;
create policy valtrack_lecture on public.organizations for select to anon, authenticated using (true);
-- Si tu n'as PAS encore verrouillé les autres tables (securite-rls.sql), remplace
-- "to authenticated" par "to anon, authenticated" sur les trois lignes suivantes.
create policy valtrack_ajout on public.organizations for insert to authenticated with check (true);
create policy valtrack_modif on public.organizations for update to authenticated using (true) with check (true);
create policy valtrack_suppr on public.organizations for delete to authenticated using (true);
