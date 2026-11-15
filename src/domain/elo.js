import { num } from "./stats.js";

// team Elo ranking — global registry keyed by team name, recomputed live from every match
export const ELO_START = 1000;
export const ELO_MIN = 0;
export const ELO_MAX = 2000;
export const ELO_K = 48;
export const ELO_SCALE = 400;
export const TOURNAMENT_ELO_BONUS = { Split: 30, Masters: 60, Champions: 100, Autre: 20 };

export function clampElo(v) {
  return Math.max(ELO_MIN, Math.min(ELO_MAX, v));
}

// which team won a match: explicit winnerTeamId if set, otherwise inferred from the map score
export function matchWinnerTeamId(m) {
  if (m.winnerTeamId) return m.winnerTeamId;
  if (!m.mapScores || m.mapScores.length === 0) return null;
  let winsA = 0, winsB = 0;
  m.mapScores.forEach((s) => {
    const a = num(s.a), b = num(s.b);
    if (a === 0 && b === 0) return;
    if (a > b) winsA++; else if (b > a) winsB++;
  });
  if (winsA === winsB) return null;
  return winsA > winsB ? m.teamAId : m.teamBId;
}

// replays every recorded match (applied to the classement or not) in chronological order —
// tournaments sorted by date, matches in the order they were added within each tournament
export function getStompMultiplier(mapScores) {
  if (!mapScores || mapScores.length === 0) return 1;

  let roundsA = 0;
  let roundsB = 0;
  mapScores.forEach((map) => {
    roundsA += num(map.a);
    roundsB += num(map.b);
  });

  const totalRounds = roundsA + roundsB;
  if (totalRounds === 0) return 1;

  const roundDiff = Math.abs(roundsA - roundsB);
  const dominance = roundDiff / totalRounds;
  return 1 + dominance * 0.65;
}

export function computeTeamElo(tournaments) {
  const registry = {}; // lowercased name -> { name, elo, history: [...] }
  const getEntry = (name) => {
    const key = name.trim().toLowerCase();
    if (!registry[key]) registry[key] = { name, elo: ELO_START, history: [] };
    registry[key].name = name; // keep the most recently seen casing
    return registry[key];
  };

  const ordered = [...tournaments].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  ordered.forEach((t) => {
    (t.matches || []).forEach((m) => {
      const teamA = t.teams.find((x) => x.id === m.teamAId);
      const teamB = t.teams.find((x) => x.id === m.teamBId);
      if (!teamA || !teamB) return;
      const winnerId = matchWinnerTeamId(m);
      if (!winnerId) return;

      const eA = getEntry(teamA.name);
      const eB = getEntry(teamB.name);
      const beforeA = eA.elo, beforeB = eB.elo;
      const expectedA = 1 / (1 + Math.pow(10, (beforeB - beforeA) / ELO_SCALE));
      const actualA = winnerId === teamA.id ? 1 : 0;
      const stompMultiplier = getStompMultiplier(m.mapScores);
      const matchK = ELO_K * stompMultiplier;
      eA.elo = clampElo(beforeA + matchK * (actualA - expectedA));
      eB.elo = clampElo(beforeB + matchK * ((1 - actualA) - (1 - expectedA)));

      eA.history.push({ type: "match", tournamentName: t.name, matchLabel: m.label, opponentName: teamB.name, result: actualA ? "W" : "L", delta: eA.elo - beforeA, eloAfter: eA.elo });
      eB.history.push({ type: "match", tournamentName: t.name, matchLabel: m.label, opponentName: teamA.name, result: actualA ? "L" : "W", delta: eB.elo - beforeB, eloAfter: eB.elo });
    });

    if (t.finished && t.winnerTeamId) {
      const winnerTeam = t.teams.find((x) => x.id === t.winnerTeamId);
      if (winnerTeam) {
        const e = getEntry(winnerTeam.name);
        const before = e.elo;
        const bonus = TOURNAMENT_ELO_BONUS[t.type] ?? 0;
        e.elo = clampElo(before + bonus);
        e.history.push({ type: "trophy", tournamentName: t.name, tournamentType: t.type, delta: e.elo - before, eloAfter: e.elo });
      }
    }
  });

  return Object.values(registry).sort((a, b) => b.elo - a.elo);
}

// everything shown on a team's profile page: bilan, extremes, palmarès, roster, recent history
export function getTeamProfile(nameKey, tournaments, players) {
  const ranking = computeTeamElo(tournaments);
  const idx = ranking.findIndex((t) => t.name.trim().toLowerCase() === nameKey);
  if (idx === -1) return null;
  const entry = ranking[idx];
  const matches = entry.history.filter((h) => h.type === "match");
  const wins = matches.filter((h) => h.result === "W").length;
  const losses = matches.filter((h) => h.result === "L").length;
  const bestGain = matches.length ? matches.reduce((a, b) => (b.delta > a.delta ? b : a)) : null;
  const worstLoss = matches.length ? matches.reduce((a, b) => (b.delta < a.delta ? b : a)) : null;
  const trophies = entry.history.filter((h) => h.type === "trophy");

  const playerIdSet = new Set();
  tournaments.forEach((t) => t.teams.forEach((team) => {
    if (team.name.trim().toLowerCase() === nameKey) team.playerIds.forEach((id) => playerIdSet.add(id));
  }));
  const roster = [...playerIdSet].map((id) => players.find((p) => p.id === id)).filter(Boolean);

  return {
    entry, rank: idx + 1, wins, losses, bestGain, worstLoss, trophies, roster,
    recent: [...entry.history].reverse().slice(0, 12),
  };
}
