import { supabase, isSupabaseConfigured } from "./supabaseClient";

const PAGE_SIZE = 250;

const TEAM_LOGO_BUCKET = "team-logos";

function safeLogoBaseName(teamKey) {
  const cleaned = String(teamKey || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "team";
}

function extensionFromMime(mime) {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  if (mime === "image/svg+xml") return "svg";
  return "png";
}

function dataUrlToBlob(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) throw new Error("Format Data URL invalide.");

  const mime = match[1] || "image/png";
  const isBase64 = Boolean(match[2]);
  const payload = match[3] || "";

  if (isBase64) {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  return new Blob([decodeURIComponent(payload)], { type: mime });
}

async function uploadLogoToStorage(teamKey, fileOrBlob) {
  ensureConfigured();

  const blob = fileOrBlob instanceof Blob ? fileOrBlob : dataUrlToBlob(fileOrBlob);
  const ext = extensionFromMime(blob.type || "image/png");
  const path = `${safeLogoBaseName(teamKey)}-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(TEAM_LOGO_BUCKET)
    .upload(path, blob, {
      contentType: blob.type || "image/png",
      cacheControl: "31536000",
      upsert: false,
    });

  throwIfError(uploadError);

  const { data } = supabase.storage
    .from(TEAM_LOGO_BUCKET)
    .getPublicUrl(path);

  const publicUrl = data?.publicUrl;
  if (!publicUrl) throw new Error("Impossible de générer l'URL publique du logo.");

  return publicUrl;
}

const ORDER_KEYS = {
  players: ["id"],
  tournaments: ["id"],
  tournament_teams: ["id"],
  matches: ["id"],
  match_player_stats: ["match_id", "player_id"],
  team_logos: ["team_key"],
  hidden_teams: ["team_key"],
};

function ensureConfigured() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error(
      "Supabase n'est pas configuré. Ajoute VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans ton fichier .env."
    );
  }
}

function throwIfError(error) {
  if (error) throw error;
}

async function fetchAll(table, columns = "*") {
  ensureConfigured();
  console.log(`[ValTrack] Chargement de ${table}...`);

  const out = [];
  let from = 0;

  while (true) {
    let query = supabase.from(table).select(columns);
    for (const key of ORDER_KEYS[table] || []) {
      query = query.order(key, { ascending: true });
    }

    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error(`[ValTrack] ERREUR sur ${table}:`, error);
      throw new Error(`Erreur pendant le chargement de "${table}" : ${error.message}`);
    }

    const rows = data || [];
    out.push(...rows);

    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  console.log(`[ValTrack] ${table} terminé : ${out.length} lignes`);
  return out;
}

async function fetchTeamLogosSafely(onLogo) {
  ensureConfigured();
  console.log("[ValTrack] Chargement / migration progressive des logos...");

  // Cette requête ne récupère que les petites clés texte.
  const keys = await fetchAll("team_logos", "team_key");
  let loaded = 0;

  for (const row of keys) {
    try {
      const { data, error } = await supabase
        .from("team_logos")
        .select("team_key,data_url")
        .eq("team_key", row.team_key)
        .maybeSingle();

      throwIfError(error);
      if (!data?.data_url) continue;

      let url = data.data_url;

      // Ancien format : grosse Data URL base64 stockée dans PostgreSQL.
      // On la migre une seule fois vers Supabase Storage.
      if (url.startsWith("data:")) {
        console.log(`[ValTrack] Migration du logo ${row.team_key} vers Storage...`);
        url = await uploadLogoToStorage(row.team_key, url);

        const { error: updateError } = await supabase
          .from("team_logos")
          .update({
            data_url: url,
            updated_at: new Date().toISOString(),
          })
          .eq("team_key", row.team_key);

        throwIfError(updateError);
      }

      loaded += 1;
      if (typeof onLogo === "function") onLogo(row.team_key, url);
    } catch (error) {
      console.warn(`[ValTrack] Logo ignoré (${row.team_key}) :`, error?.message || error);
    }
  }

  console.log(`[ValTrack] Logos terminés : ${loaded}/${keys.length}`);
}


const playerToRow = (p) => ({
  id: p.id,
  name: p.name || "",
  nationality: p.nationality || "",
  team_history: p.teamHistory || [],
  trophies: p.trophies || [],
  stats: p.stats || {},
  prev_stats: p.prevStats || null,
  updated_at: new Date().toISOString(),
});

const tournamentToRow = (t) => ({
  id: t.id,
  name: t.name || "",
  type: t.type || "Split",
  tournament_date: t.date || null,
  format: t.format || { groups: false, doubleElim: false },
  winner_team_id: t.winnerTeamId || null,
  finished: Boolean(t.finished),
  updated_at: new Date().toISOString(),
});

const teamToRow = (tournamentId, team) => ({
  id: team.id,
  tournament_id: tournamentId,
  name: team.name || "",
  player_ids: team.playerIds || [],
  eliminated: Boolean(team.eliminated),
  updated_at: new Date().toISOString(),
});

const matchToRow = (tournamentId, match) => ({
  id: match.id,
  tournament_id: tournamentId,
  label: match.label || "",
  team_a_id: match.teamAId || null,
  team_b_id: match.teamBId || null,
  winner_team_id: match.winnerTeamId || null,
  map_scores: match.mapScores || [],
  applied_to_stats: Boolean(match.appliedToStats),
  updated_at: new Date().toISOString(),
});

const statRowsForMatch = (match) =>
  Object.entries(match.stats || {}).map(([playerId, stats]) => ({
    match_id: match.id,
    player_id: playerId,
    stats: stats || {},
    updated_at: new Date().toISOString(),
  }));

export async function loadValtrackData() {
  ensureConfigured();

  // Chargement séquentiel : évite de lancer plusieurs grosses requêtes
  // Supabase/PostgreSQL en parallèle au démarrage.
  const playerRows = await fetchAll("players");
  const tournamentRows = await fetchAll("tournaments");
  const teamRows = await fetchAll("tournament_teams");
  const matchRows = await fetchAll("matches");
  const statRows = await fetchAll("match_player_stats");
  const hiddenRows = await fetchAll("hidden_teams");

  // Les logos ne sont plus chargés ici : ils sont récupérés en arrière-plan
  // après l'affichage de l'application pour ne pas bloquer le démarrage.
  const players = playerRows.map((r) => ({
    id: r.id,
    name: r.name || "",
    nationality: r.nationality || "",
    teamHistory: r.team_history || [],
    trophies: r.trophies || [],
    stats: r.stats || {},
    prevStats: r.prev_stats || null,
  }));

  const statsByMatch = new Map();
  for (const row of statRows) {
    if (!statsByMatch.has(row.match_id)) statsByMatch.set(row.match_id, {});
    statsByMatch.get(row.match_id)[row.player_id] = row.stats || {};
  }

  const teamsByTournament = new Map();
  for (const row of teamRows) {
    if (!teamsByTournament.has(row.tournament_id)) teamsByTournament.set(row.tournament_id, []);
    teamsByTournament.get(row.tournament_id).push({
      id: row.id,
      name: row.name || "",
      playerIds: row.player_ids || [],
      eliminated: Boolean(row.eliminated),
    });
  }

  const matchesByTournament = new Map();
  const orderedMatchRows = [...matchRows].sort((a, b) =>
    String(a.created_at || "").localeCompare(String(b.created_at || "")) ||
    String(a.id).localeCompare(String(b.id))
  );

  for (const row of orderedMatchRows) {
    if (!matchesByTournament.has(row.tournament_id)) matchesByTournament.set(row.tournament_id, []);
    matchesByTournament.get(row.tournament_id).push({
      id: row.id,
      label: row.label || "",
      teamAId: row.team_a_id || "",
      teamBId: row.team_b_id || "",
      winnerTeamId: row.winner_team_id || null,
      mapScores: row.map_scores || [],
      stats: statsByMatch.get(row.id) || {},
      appliedToStats: Boolean(row.applied_to_stats),
    });
  }

  const tournaments = tournamentRows.map((r) => ({
    id: r.id,
    name: r.name || "",
    type: r.type || "Split",
    date: r.tournament_date || "",
    format: r.format || { groups: false, doubleElim: false },
    teams: teamsByTournament.get(r.id) || [],
    matches: matchesByTournament.get(r.id) || [],
    winnerTeamId: r.winner_team_id || null,
    finished: Boolean(r.finished),
  }));

  const hiddenTeams = hiddenRows.map((r) => r.team_key);

  return { players, tournaments, teamLogos: {}, hiddenTeams };
}

export async function loadTeamLogosDb(onLogo) {
  const logos = {};
  await fetchTeamLogosSafely((teamKey, url) => {
    logos[teamKey] = url;
    if (typeof onLogo === "function") onLogo(teamKey, url);
  });
  return logos;
}


export async function upsertPlayerDb(player) {
  ensureConfigured();
  const { error } = await supabase.from("players").upsert(playerToRow(player), { onConflict: "id" });
  throwIfError(error);
}

export async function upsertPlayersDb(players) {
  ensureConfigured();
  if (!players.length) return;
  const { error } = await supabase
    .from("players")
    .upsert(players.map(playerToRow), { onConflict: "id" });
  throwIfError(error);
}

export async function deletePlayerDb(playerId) {
  ensureConfigured();
  const { error } = await supabase.from("players").delete().eq("id", playerId);
  throwIfError(error);
}

export async function upsertTournamentDb(tournament) {
  ensureConfigured();
  const { error } = await supabase
    .from("tournaments")
    .upsert(tournamentToRow(tournament), { onConflict: "id" });
  throwIfError(error);
}

export async function upsertTeamDb(tournamentId, team) {
  ensureConfigured();
  const { error } = await supabase
    .from("tournament_teams")
    .upsert(teamToRow(tournamentId, team), { onConflict: "id" });
  throwIfError(error);
}

export async function upsertMatchDb(tournamentId, match) {
  ensureConfigured();

  const { error: matchError } = await supabase
    .from("matches")
    .upsert(matchToRow(tournamentId, match), { onConflict: "id" });
  throwIfError(matchError);

  const { error: deleteStatsError } = await supabase
    .from("match_player_stats")
    .delete()
    .eq("match_id", match.id);
  throwIfError(deleteStatsError);

  const rows = statRowsForMatch(match);
  if (rows.length) {
    const { error: statsError } = await supabase
      .from("match_player_stats")
      .insert(rows);
    throwIfError(statsError);
  }
}

export async function setMatchAppliedDb(matchId, applied) {
  ensureConfigured();
  const { error } = await supabase
    .from("matches")
    .update({ applied_to_stats: Boolean(applied), updated_at: new Date().toISOString() })
    .eq("id", matchId);
  throwIfError(error);
}

export async function setTeamLogoDb(teamKey, fileOrDataUrl) {
  ensureConfigured();

  // Les nouveaux logos sont stockés comme de vrais fichiers dans Supabase Storage.
  const publicUrl = await uploadLogoToStorage(teamKey, fileOrDataUrl);

  const { error } = await supabase
    .from("team_logos")
    .upsert(
      {
        team_key: teamKey,
        data_url: publicUrl,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "team_key" }
    );

  throwIfError(error);
  return publicUrl;
}


export async function setHiddenTeamDb(teamKey, hidden) {
  ensureConfigured();
  if (hidden) {
    const { error } = await supabase
      .from("hidden_teams")
      .upsert({ team_key: teamKey }, { onConflict: "team_key" });
    throwIfError(error);
  } else {
    const { error } = await supabase.from("hidden_teams").delete().eq("team_key", teamKey);
    throwIfError(error);
  }
}

export async function migrateLegacySnapshotDb({ players, tournaments, teamLogos, hiddenTeams }) {
  ensureConfigured();

  if (players?.length) await upsertPlayersDb(players);

  for (const tournament of tournaments || []) {
    await upsertTournamentDb(tournament);

    if (tournament.teams?.length) {
      const { error: teamError } = await supabase
        .from("tournament_teams")
        .upsert(
          tournament.teams.map((team) => teamToRow(tournament.id, team)),
          { onConflict: "id" }
        );
      throwIfError(teamError);
    }

    for (const match of tournament.matches || []) {
      await upsertMatchDb(tournament.id, match);
    }
  }

  const logoEntries = Object.entries(teamLogos || {});
  if (logoEntries.length) {
    const { error } = await supabase.from("team_logos").upsert(
      logoEntries.map(([team_key, data_url]) => ({
        team_key,
        data_url,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "team_key" }
    );
    throwIfError(error);
  }

  if (hiddenTeams?.length) {
    const { error } = await supabase
      .from("hidden_teams")
      .upsert(hiddenTeams.map((team_key) => ({ team_key })), { onConflict: "team_key" });
    throwIfError(error);
  }
}

export async function readLegacyWindowStorage(keys) {
  if (typeof window === "undefined" || !window.storage?.get) return null;

  const safeGet = async (key) => {
    try {
      const res = await window.storage.get(key, false);
      return res?.value ? JSON.parse(res.value) : null;
    } catch {
      return null;
    }
  };

  const [players, tournaments, teamLogos, hiddenTeams] = await Promise.all([
    safeGet(keys.players),
    safeGet(keys.tournaments),
    safeGet(keys.teamLogos),
    safeGet(keys.hiddenTeams),
  ]);

  if (!players && !tournaments && !teamLogos && !hiddenTeams) return null;
  return {
    players: players || [],
    tournaments: tournaments || [],
    teamLogos: teamLogos || {},
    hiddenTeams: hiddenTeams || [],
  };
}