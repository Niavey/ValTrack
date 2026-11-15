import { computeMvpMjCounts } from "./records.js";
import { num, emptyStats, hasStatValue, applyMatchToStats } from "./stats.js";

// ---------- classement / records filters ----------
export const DEFAULT_DATA_FILTERS = {
  minRounds: "",
  types: { Split: true, Masters: true, Champions: true },
  year: "all",
  tournamentId: "all",
  team: "all",
};

export function tournamentYear(tournament) {
  const raw = String(tournament?.date || "").trim();
  const match = raw.match(/^(\d{4})/);
  return match ? match[1] : "";
}

export function namedTypeFilterIsDefault(filters) {
  return ["Split", "Masters", "Champions"].every((type) => filters.types?.[type] !== false);
}

export function hasScopedDataFilter(filters) {
  return !namedTypeFilterIsDefault(filters)
    || filters.year !== "all"
    || filters.tournamentId !== "all"
    || filters.team !== "all";
}

export function tournamentPassesDataFilters(tournament, filters) {
  if (!namedTypeFilterIsDefault(filters) && !filters.types?.[tournament.type]) return false;
  if (filters.year !== "all" && tournamentYear(tournament) !== filters.year) return false;
  if (filters.tournamentId !== "all" && tournament.id !== filters.tournamentId) return false;
  return true;
}

export function normalizedTeamName(name) {
  return String(name || "").trim().toLowerCase();
}

export function teamIdsMatchingFilter(tournament, filters) {
  if (filters.team === "all") return [];
  const wanted = normalizedTeamName(filters.team);
  return (tournament.teams || [])
    .filter((team) => normalizedTeamName(team.name) === wanted)
    .map((team) => team.id);
}

export function filterTournamentScope(tournaments, filters, appliedOnly = false) {
  return (tournaments || [])
    .filter((t) => tournamentPassesDataFilters(t, filters))
    .map((t) => {
      const selectedTeamIds = teamIdsMatchingFilter(t, filters);
      const matches = (t.matches || []).filter((m) => {
        if (appliedOnly && !m.appliedToStats) return false;
        if (filters.team !== "all" && !selectedTeamIds.includes(m.teamAId) && !selectedTeamIds.includes(m.teamBId)) return false;
        return true;
      });
      return { ...t, matches };
    })
    .filter((t) => t.matches.length > 0);
}

export function playerIdsForSelectedTeam(tournament, filters) {
  if (filters.team === "all") return null;
  const ids = new Set();
  const wanted = normalizedTeamName(filters.team);
  (tournament.teams || []).forEach((team) => {
    if (normalizedTeamName(team.name) === wanted) {
      (team.playerIds || []).forEach((id) => ids.add(id));
    }
  });
  return ids;
}

export function roundsByPlayerInScope(tournaments, filters) {
  const totals = new Map();
  (tournaments || []).forEach((t) => {
    const teamPlayerIds = playerIdsForSelectedTeam(t, filters);
    (t.matches || []).forEach((m) => {
      const fallbackRounds = (m.mapScores || []).reduce((sum, score) => sum + num(score.a) + num(score.b), 0);
      Object.entries(m.stats || {}).forEach(([playerId, vals]) => {
        if (teamPlayerIds && !teamPlayerIds.has(playerId)) return;
        const rounds = hasStatValue(vals?.round) ? num(vals.round) : fallbackRounds;
        totals.set(playerId, (totals.get(playerId) || 0) + rounds);
      });
    });
  });
  return totals;
}

export function eligiblePlayerIdsForFilters(tournaments, filters) {
  const totals = roundsByPlayerInScope(tournaments, filters);
  const minimum = Math.max(0, num(filters.minRounds));
  return new Set([...totals.entries()].filter(([, rounds]) => rounds >= minimum).map(([playerId]) => playerId));
}

export function trimTournamentStatsForFilters(tournaments, filters, eligibleIds = null) {
  return (tournaments || []).map((t) => {
    const teamPlayerIds = playerIdsForSelectedTeam(t, filters);
    return {
      ...t,
      matches: (t.matches || []).map((m) => ({
        ...m,
        stats: Object.fromEntries(
          Object.entries(m.stats || {}).filter(([playerId]) => {
            if (teamPlayerIds && !teamPlayerIds.has(playerId)) return false;
            if (eligibleIds && !eligibleIds.has(playerId)) return false;
            return true;
          })
        ),
      })),
    };
  });
}

export function buildFilteredLeaderboardPlayers(players, tournaments, filters) {
  const minimum = Math.max(0, num(filters.minRounds));

  // With only a rounds threshold active, keep the existing global career totals exactly as stored.
  if (!hasScopedDataFilter(filters)) {
    return players.filter((p) => num(p.stats.round) >= minimum);
  }

  // Once a tournament/year/type/team filter is active, rebuild the ranking from the matching
  // tournament matches so Rating/KAST/KD/etc. truly correspond to that selection.
  const scopedFullMatches = filterTournamentScope(tournaments, filters, true);
  const scopedRows = trimTournamentStatsForFilters(scopedFullMatches, filters);
  const totals = new Map();

  scopedRows.forEach((t) => {
    (t.matches || []).forEach((m) => {
      Object.entries(m.stats || {}).forEach(([playerId, row]) => {
        const hasValue = Object.values(row || {}).some((v) => v !== "" && v !== undefined && v !== null);
        if (!hasValue) return;
        const previous = totals.get(playerId) || emptyStats();
        totals.set(playerId, applyMatchToStats(previous, row));
      });
    });
  });

  // MVP/MJ remain calculated from the complete match, then are assigned only to players that
  // survive the selected team/round filters.
  const scopedMvpMj = computeMvpMjCounts(scopedFullMatches);

  return players
    .filter((p) => totals.has(p.id))
    .map((p) => ({
      ...p,
      stats: {
        ...totals.get(p.id),
        mvp: scopedMvpMj[p.id]?.mvp || 0,
        mj: scopedMvpMj[p.id]?.mj || 0,
      },
    }))
    .filter((p) => num(p.stats.round) >= minimum);
}
