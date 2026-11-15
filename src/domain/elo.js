import { num } from "./stats.js";
import { computeParticipation, playedMaps } from "./participation.js";

// Elo individuel des joueurs
// ------------------------------------------------------------------
// Chaque joueur a son propre Elo, qu'il garde en changeant d'équipe. L'Elo d'une équipe est la
// moyenne de ses 5 joueurs principaux. Tout est recalculé à chaque affichage en rejouant les
// matchs dans l'ordre chronologique (tournois par date, matchs dans l'ordre de saisie) : changer
// un réglage ci-dessous s'applique donc immédiatement à tout l'historique, sans migration.
export const ELO_CONFIG = {
  start: 1000,          // Elo d'un nouveau joueur
  min: 0,
  max: 2000,
  k: 48,                // amplitude d'un match "normal"
  scale: 400,           // écart d'Elo pour lequel le favori a ~91 % de chances
  stompWeight: 0.65,    // 13-0 partout → gain/perte x1,65
  // coefficient selon la part des maps jouées : 1/3 → 0,60 · 2/3 → 0,80 · 3/3 → 1,00
  participationFloor: 0.4,
  // bonus/malus selon le Rating comparé à la moyenne de son équipe sur le match
  ratingSensitivity: 0.5, // Rating 20 % au-dessus de la moyenne → +10 %
  ratingCap: 0.10,        // effet plafonné à ±10 %
  tournamentBonus: { Split: 30, Masters: 60, Champions: 100, Autre: 20 },
  mainPlayers: 5,         // nombre de joueurs comptés dans l'Elo d'une équipe
};

export const ELO_START = ELO_CONFIG.start;
export const ELO_MIN = ELO_CONFIG.min;
export const ELO_MAX = ELO_CONFIG.max;
export const ELO_K = ELO_CONFIG.k;
export const ELO_SCALE = ELO_CONFIG.scale;
export const TOURNAMENT_ELO_BONUS = ELO_CONFIG.tournamentBonus;

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
  return 1 + dominance * ELO_CONFIG.stompWeight;
}

export function participationCoefficient(mapsPlayed, totalMaps, config = ELO_CONFIG) {
  if (!totalMaps || !mapsPlayed) return 1; // ancien match sans détail des maps
  const share = Math.min(1, mapsPlayed / totalMaps);
  return config.participationFloor + (1 - config.participationFloor) * share;
}

// +x % pour une bonne perf, −x % pour une mauvaise, par rapport au Rating moyen de son équipe
export function ratingAdjustment(playerRating, teamAverageRating, config = ELO_CONFIG) {
  if (playerRating === null || !teamAverageRating) return 0;
  const raw = (playerRating / teamAverageRating - 1) * config.ratingSensitivity;
  return Math.max(-config.ratingCap, Math.min(config.ratingCap, raw));
}

function hasRating(v) {
  return v !== "" && v !== undefined && v !== null && !Number.isNaN(Number(String(v).replace(",", ".")));
}

export function chronologicalTournaments(tournaments) {
  return [...(tournaments || [])].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
}

const teamKey = (name) => String(name || "").trim().toLowerCase();

// Rejoue tous les matchs et renvoie :
//   players : Map playerId → { elo, history[] }
//   teams   : Map nom d'équipe (minuscules) → { name, history[] }  (historique au niveau équipe)
export function computeEloState(tournaments, config = ELO_CONFIG) {
  const clamp = (v) => Math.max(config.min, Math.min(config.max, v));
  const players = new Map();
  const teams = new Map();
  const playerEntry = (id) => {
    if (!players.has(id)) players.set(id, { elo: config.start, history: [] });
    return players.get(id);
  };
  const teamEntry = (name) => {
    const key = teamKey(name);
    if (!teams.has(key)) teams.set(key, { name, history: [] });
    teams.get(key).name = name; // garde la dernière écriture du nom
    return teams.get(key);
  };

  chronologicalTournaments(tournaments).forEach((t) => {
    (t.matches || []).forEach((m) => {
      const teamA = t.teams.find((x) => x.id === m.teamAId);
      const teamB = t.teams.find((x) => x.id === m.teamBId);
      if (!teamA || !teamB) return;
      const winnerId = matchWinnerTeamId(m);
      if (!winnerId) return;

      const totalMaps = playedMaps(m.mapScores).length;
      const participation = computeParticipation(m, teamA, teamB);
      const sides = { A: teamA, B: teamB };
      const lineup = {};
      for (const side of ["A", "B"]) {
        let ids = [...participation.entries()].filter(([, p]) => p.side === side).map(([id, p]) => ({ id, maps: p.maps }));
        // match sans stats ni compo : on prend l'effectif de l'équipe
        if (ids.length === 0) ids = sides[side].playerIds.map((id) => ({ id, maps: 0 }));
        lineup[side] = ids;
      }
      if (lineup.A.length === 0 || lineup.B.length === 0) return;

      // force de chaque équipe = moyenne des Elo, pondérée par les maps jouées
      const strength = (ids) => {
        let sum = 0, weight = 0;
        ids.forEach(({ id, maps }) => { const w = maps || 1; sum += playerEntry(id).elo * w; weight += w; });
        return sum / weight;
      };
      const strengthA = strength(lineup.A);
      const strengthB = strength(lineup.B);
      const expectedA = 1 / (1 + Math.pow(10, (strengthB - strengthA) / config.scale));
      const actualA = winnerId === teamA.id ? 1 : 0;
      const baseA = config.k * getStompMultiplier(m.mapScores) * (actualA - expectedA);

      for (const side of ["A", "B"]) {
        const won = (side === "A") === (actualA === 1);
        const base = side === "A" ? baseA : -baseA;
        const opponent = side === "A" ? teamB : teamA;
        const ratings = lineup[side]
          .map(({ id }) => m.stats?.[id]?.rating)
          .filter(hasRating)
          .map(num);
        const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;

        let teamDeltaSum = 0, teamWeight = 0;
        lineup[side].forEach(({ id, maps }) => {
          const entry = playerEntry(id);
          const coef = participationCoefficient(maps, totalMaps, config);
          const rating = hasRating(m.stats?.[id]?.rating) ? num(m.stats[id].rating) : null;
          const perf = ratingAdjustment(rating, avgRating, config);
          // une bonne perf fait gagner un peu plus… et perdre un peu moins
          const delta = base * coef * (won ? 1 + perf : 1 - perf);
          const before = entry.elo;
          entry.elo = clamp(before + delta);
          entry.history.push({
            type: "match", tournamentId: t.id, tournamentName: t.name, matchId: m.id, matchLabel: m.label,
            teamName: sides[side].name, opponentName: opponent.name, result: won ? "W" : "L",
            delta: entry.elo - before, eloAfter: entry.elo, participation: coef, performance: perf,
          });
          const w = maps || 1;
          teamDeltaSum += (entry.elo - before) * w;
          teamWeight += w;
        });

        teamEntry(sides[side].name).history.push({
          type: "match", tournamentName: t.name, matchLabel: m.label, opponentName: opponent.name,
          result: won ? "W" : "L", delta: teamWeight ? teamDeltaSum / teamWeight : 0,
          strengthBefore: side === "A" ? strengthA : strengthB,
        });
      }
    });

    // bonus de victoire en tournoi pour chaque joueur du roster vainqueur
    if (t.finished && t.winnerTeamId) {
      const winnerTeam = t.teams.find((x) => x.id === t.winnerTeamId);
      if (winnerTeam) {
        const bonus = config.tournamentBonus[t.type] ?? 0;
        winnerTeam.playerIds.forEach((id) => {
          const entry = playerEntry(id);
          const before = entry.elo;
          entry.elo = clamp(before + bonus);
          entry.history.push({ type: "trophy", tournamentId: t.id, tournamentName: t.name, tournamentType: t.type, teamName: winnerTeam.name, delta: entry.elo - before, eloAfter: entry.elo });
        });
        teamEntry(winnerTeam.name).history.push({ type: "trophy", tournamentName: t.name, tournamentType: t.type, delta: bonus });
      }
    }
  });

  return { players, teams };
}

// Les 5 joueurs principaux d'une équipe : son dernier tournoi, classés par maps jouées dans ce
// tournoi (un remplaçant passe donc après les titulaires).
export function currentMainRoster(name, tournaments, config = ELO_CONFIG) {
  const key = teamKey(name);
  const ordered = chronologicalTournaments(tournaments);
  for (let i = ordered.length - 1; i >= 0; i--) {
    const t = ordered[i];
    const team = t.teams.find((x) => teamKey(x.name) === key);
    if (!team) continue;
    const mapsPlayed = new Map(team.playerIds.map((id) => [id, 0]));
    (t.matches || []).forEach((m) => {
      if (m.teamAId !== team.id && m.teamBId !== team.id) return;
      const teamA = t.teams.find((x) => x.id === m.teamAId);
      const teamB = t.teams.find((x) => x.id === m.teamBId);
      const side = m.teamAId === team.id ? "A" : "B";
      computeParticipation(m, teamA, teamB).forEach((p, id) => {
        if (p.side === side && mapsPlayed.has(id)) mapsPlayed.set(id, mapsPlayed.get(id) + Math.max(1, p.maps));
      });
    });
    const sorted = [...team.playerIds].sort((a, b) => mapsPlayed.get(b) - mapsPlayed.get(a));
    return { tournament: t, team, main: sorted.slice(0, config.mainPlayers), others: sorted.slice(config.mainPlayers) };
  }
  return null;
}

// Classement des équipes : Elo actuel = moyenne des Elo des 5 joueurs principaux.
export function computeTeamElo(tournaments, config = ELO_CONFIG) {
  const { players, teams } = computeEloState(tournaments, config);
  const names = new Map();
  chronologicalTournaments(tournaments).forEach((t) => t.teams.forEach((team) => names.set(teamKey(team.name), team.name)));

  const ranking = [];
  names.forEach((name, key) => {
    const roster = currentMainRoster(name, tournaments, config);
    const main = roster?.main || [];
    const playerElos = main.map((id) => ({ id, elo: players.get(id)?.elo ?? config.start }));
    // une équipe qui n'a encore rien joué est quand même classée avec l'Elo de ses joueurs
    const history = teams.get(key)?.history || [];
    const elo = playerElos.length ? playerElos.reduce((s, p) => s + p.elo, 0) / playerElos.length : config.start;
    ranking.push({ name, elo, history, roster: playerElos, substitutes: roster?.others || [] });
  });
  return ranking.sort((a, b) => b.elo - a.elo);
}

export function computePlayerElo(tournaments, config = ELO_CONFIG) {
  return computeEloState(tournaments, config).players;
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
