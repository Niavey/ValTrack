import { num } from "./stats.js";
import { isPlayedMap } from "./participation.js";
import { chronologicalTournaments, orgKeyOf } from "./elo.js";
import { agentRole, canonicalAgent, ROLES } from "./valorant.js";

// Réglages du calcul de rôle
export const ROLE_CONFIG = {
  halfLifeMaps: 30,  // une map vieille de 30 maps compte deux fois moins qu'une map récente
  majority: 0.6,     // ≥ 60 % d'un rôle (pondéré) → ce rôle
  flexShare: 0.25,   // sinon Flex si au moins 2 rôles à ≥ 25 %
  minMaps: 5,        // en dessous, pas assez de données pour décider
};

// Une ligne par joueur et par map où son agent est connu, dans l'ordre chronologique.
// Format d'une map : { a, b, map: "Ascent", lineupA, lineupB, agents: { playerId: "Jett" } }
export function collectAgentPlays(tournaments) {
  const plays = [];
  chronologicalTournaments(tournaments).forEach((t) => {
    (t.matches || []).forEach((m) => {
      const teamA = t.teams.find((x) => x.id === m.teamAId);
      const teamB = t.teams.find((x) => x.id === m.teamBId);
      (m.mapScores || []).forEach((map, mapIndex) => {
        if (!isPlayedMap(map) || !map.agents) return;
        Object.entries(map.agents).forEach(([playerId, rawAgent]) => {
          const agent = canonicalAgent(rawAgent);
          if (!agent) return;
          const side = map.lineupB?.includes(playerId) || (!map.lineupA?.includes(playerId) && teamB?.playerIds.includes(playerId)) ? "B" : "A";
          const team = side === "A" ? teamA : teamB;
          const own = num(side === "A" ? map.a : map.b);
          const other = num(side === "A" ? map.b : map.a);
          // stats saisies par match : chaque map du match reçoit le Rating/ACS du match
          // (estimation quand le joueur a changé d'agent en cours de match)
          const row = m.stats?.[playerId];
          const hasRating = row && row.rating !== "" && row.rating !== undefined && row.rating !== null;
          const hasAcs = row && row.acs !== "" && row.acs !== undefined && row.acs !== null;
          plays.push({
            rating: hasRating ? num(row.rating) : null,
            acs: hasAcs ? num(row.acs) : null,
            playerId, agent, role: agentRole(agent), mapName: map.map || "",
            tournamentId: t.id, tournamentName: t.name, date: t.date || "", matchId: m.id, mapIndex,
            teamName: team?.name || "", orgKey: team ? orgKeyOf(team) : null,
            won: own > other, rounds: own + other,
          });
        });
      });
    });
  });
  return plays;
}

// Rôle à partir d'une liste de maps jouées (ordre chronologique) : majorité pondérée, les maps
// récentes comptant plus. Renvoie { role, shares, maps } ; role = null si pas assez de maps.
export function computeRole(plays, config = ROLE_CONFIG) {
  const withRole = plays.filter((p) => p.role);
  if (withRole.length < config.minMaps) return { role: null, shares: {}, maps: withRole.length };
  const totals = {};
  let sum = 0;
  withRole.forEach((p, i) => {
    const age = withRole.length - 1 - i;
    const w = Math.pow(0.5, age / config.halfLifeMaps);
    totals[p.role] = (totals[p.role] || 0) + w;
    sum += w;
  });
  const shares = Object.fromEntries(Object.entries(totals).map(([r, w]) => [r, w / sum]));
  const ranked = Object.entries(shares).sort((a, b) => b[1] - a[1]);
  let role = ranked[0][0];
  if (ranked[0][1] < config.majority) {
    const significant = ranked.filter(([, s]) => s >= config.flexShare).length;
    if (significant >= 2) role = "flex";
  }
  return { role, shares, maps: withRole.length };
}

// Agents les plus joués d'un joueur : maps, part de ses maps, victoires
export function topAgents(plays, limit = 3) {
  const byAgent = new Map();
  plays.forEach((p) => {
    if (!byAgent.has(p.agent)) byAgent.set(p.agent, { agent: p.agent, role: p.role, maps: 0, wins: 0 });
    const e = byAgent.get(p.agent);
    e.maps += 1;
    if (p.won) e.wins += 1;
  });
  return [...byAgent.values()]
    .map((e) => ({ ...e, share: e.maps / plays.length, winRate: e.maps ? e.wins / e.maps : 0 }))
    .sort((a, b) => b.maps - a.maps || b.wins - a.wins)
    .slice(0, limit);
}

export function playerAgentProfile(playerId, plays, config = ROLE_CONFIG) {
  const mine = plays.filter((p) => p.playerId === playerId);
  return { plays: mine, top: topAgents(mine, 3), role: computeRole(mine, config) };
}

export function roleLabel(role) {
  return role ? ROLES[role]?.label || role : "";
}

// Maps jouées où des agents ont été saisis (une ligne par map), pour les pick rates :
// on ne compte que les maps renseignées, sinon les anciens matchs sans agents fausseraient tout.
export function collectAgentMaps(tournaments) {
  const maps = [];
  chronologicalTournaments(tournaments).forEach((t) => {
    (t.matches || []).forEach((m) => {
      const teamA = t.teams.find((x) => x.id === m.teamAId);
      const teamB = t.teams.find((x) => x.id === m.teamBId);
      (m.mapScores || []).forEach((map) => {
        if (!isPlayedMap(map) || !map.agents || !Object.values(map.agents).some(Boolean)) return;
        const sides = { A: new Set(), B: new Set() };
        Object.entries(map.agents).forEach(([id, raw]) => {
          const agent = canonicalAgent(raw);
          if (!agent) return;
          const side = map.lineupB?.includes(id) || (!map.lineupA?.includes(id) && teamB?.playerIds.includes(id)) ? "B" : "A";
          sides[side].add(agent);
        });
        maps.push({
          mapName: map.map || "", tournamentId: t.id,
          teams: { A: teamA ? { key: orgKeyOf(teamA), name: teamA.name } : null, B: teamB ? { key: orgKeyOf(teamB), name: teamB.name } : null },
          agents: sides,
        });
      });
    });
  });
  return maps;
}

export const AGENT_STATS_CONFIG = { minMapsForBestPlayers: 10 };

const avg = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);

// Vue d'ensemble de tous les agents : pick rate global, victoires, meilleur joueur
export function computeAgentOverview(tournaments, config = AGENT_STATS_CONFIG) {
  const maps = collectAgentMaps(tournaments);
  const plays = collectAgentPlays(tournaments);
  const agents = new Map();
  const entry = (agent) => {
    if (!agents.has(agent)) agents.set(agent, { agent, role: agentRole(agent), picks: 0, plays: [] });
    return agents.get(agent);
  };
  maps.forEach((m) => {
    new Set([...m.agents.A, ...m.agents.B]).forEach((a) => { entry(a).picks += 1; });
  });
  plays.forEach((p) => entry(p.agent).plays.push(p));
  return {
    totalMaps: maps.length,
    agents: [...agents.values()].map((a) => {
      const best = agentPlayers(a.plays, config)[0] || null;
      return {
        agent: a.agent, role: a.role, picks: a.picks,
        pickRate: maps.length ? a.picks / maps.length : 0,
        maps: a.plays.length,
        winRate: a.plays.length ? a.plays.filter((p) => p.won).length / a.plays.length : 0,
        rating: avg(a.plays.map((p) => p.rating).filter((r) => r !== null)),
        bestPlayer: best,
      };
    }).sort((x, y) => y.pickRate - x.pickRate || y.maps - x.maps),
  };
}

// Joueurs d'un agent, classés par Rating (minimum de maps pour être classé)
export function agentPlayers(plays, config = AGENT_STATS_CONFIG) {
  const byPlayer = new Map();
  plays.forEach((p) => {
    if (!byPlayer.has(p.playerId)) byPlayer.set(p.playerId, []);
    byPlayer.get(p.playerId).push(p);
  });
  return [...byPlayer.entries()].map(([playerId, list]) => ({
    playerId,
    maps: list.length,
    winRate: list.filter((p) => p.won).length / list.length,
    rating: avg(list.map((p) => p.rating).filter((r) => r !== null)),
    acs: avg(list.map((p) => p.acs).filter((r) => r !== null)),
    teams: [...new Set(list.map((p) => p.teamName).filter(Boolean))],
    ranked: list.length >= config.minMapsForBestPlayers,
  })).sort((a, b) => Number(b.ranked) - Number(a.ranked) || (b.rating ?? -1) - (a.rating ?? -1) || b.maps - a.maps);
}

// Fiche d'un agent : pick rate par map, meilleurs joueurs, équipes qui le jouent le plus
export function computeAgentDetail(agent, tournaments, config = AGENT_STATS_CONFIG) {
  const name = canonicalAgent(agent);
  const maps = collectAgentMaps(tournaments);
  const plays = collectAgentPlays(tournaments).filter((p) => p.agent === name);
  const byMap = new Map();
  const byTeam = new Map();
  maps.forEach((m) => {
    const label = m.mapName || "Map non renseignée";
    if (!byMap.has(label)) byMap.set(label, { mapName: label, played: 0, picked: 0 });
    const row = byMap.get(label);
    row.played += 1;
    let picked = false;
    ["A", "B"].forEach((side) => {
      if (!m.agents[side].has(name)) return;
      picked = true;
      const team = m.teams[side];
      if (!team) return;
      if (!byTeam.has(team.key)) byTeam.set(team.key, { key: team.key, name: team.name, picks: 0 });
      byTeam.get(team.key).picks += 1;
      byTeam.get(team.key).name = team.name;
    });
    if (picked) row.picked += 1;
  });
  const pickCount = maps.filter((m) => m.agents.A.has(name) || m.agents.B.has(name)).length;
  return {
    agent: name,
    role: agentRole(name),
    totalMaps: maps.length,
    picks: pickCount,
    pickRate: maps.length ? pickCount / maps.length : 0,
    maps: plays.length,
    winRate: plays.length ? plays.filter((p) => p.won).length / plays.length : 0,
    rating: avg(plays.map((p) => p.rating).filter((r) => r !== null)),
    byMap: [...byMap.values()].map((r) => ({ ...r, pickRate: r.played ? r.picked / r.played : 0 }))
      .sort((a, b) => b.pickRate - a.pickRate || b.played - a.played),
    players: agentPlayers(plays, config),
    teams: [...byTeam.values()].sort((a, b) => b.picks - a.picks),
  };
}
