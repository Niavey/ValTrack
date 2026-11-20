import { num } from "./stats.js";
import { isPlayedMap } from "./participation.js";
import { chronologicalTournaments, orgKeyOf } from "./elo.js";
import { collectAgentMaps } from "./agents.js";

// Veto d'un match
// ------------------------------------------------------------------
// Rien de nouveau à créer dans Supabase : tout est dans map_scores.
//   - chaque map jouée peut indiquer qui l'a choisie : pick = "A" | "B" | "decider"
//   - les bans sont rangés sur la première map : mapScores[0].veto = { bans: [{ side, map }] }
//   - une decider jamais jouée (match plié avant) : mapScores[0].veto.decider = "Haven"
export function getVeto(match) {
  const mapScores = match?.mapScores || [];
  const bans = (mapScores[0]?.veto?.bans || []).filter((b) => b?.map);
  const picks = mapScores
    .filter((m) => isPlayedMap(m) && m.map && m.pick)
    .map((m) => ({ map: m.map, by: m.pick, played: true }));
  // decider connue mais jamais jouée (ex. BO3 gagné 2-0) : veto.decider sur la 1re map
  const unplayedDecider = mapScores[0]?.veto?.decider;
  if (unplayedDecider && !picks.some((p) => p.by === "decider")) {
    picks.push({ map: unplayedDecider, by: "decider", played: false });
  }
  return { bans, picks, hasData: bans.length > 0 || picks.length > 0 };
}

const teamOf = (t, m, side) => {
  const team = t.teams.find((x) => x.id === (side === "A" ? m.teamAId : m.teamBId));
  return team ? { key: orgKeyOf(team), name: team.name } : null;
};

// Une ligne par map, tous tournois confondus :
//   played   : nombre de fois jouée (maps avec un nom)
//   pickRate : part des matchs avec veto où une équipe l'a choisie
//   banRate  : part des matchs avec veto où elle a été bannie
//   deciderRate : part des matchs avec veto où elle a été la decider
export function computeMapOverview(tournaments, mapNames = []) {
  const rows = new Map();
  const row = (name) => {
    if (!rows.has(name)) rows.set(name, { map: name, played: 0, rounds: 0, picks: 0, bans: 0, deciders: 0 });
    return rows.get(name);
  };
  mapNames.forEach(row);
  let vetoMatches = 0;
  let playedTotal = 0;

  chronologicalTournaments(tournaments).forEach((t) => (t.matches || []).forEach((m) => {
    (m.mapScores || []).forEach((map) => {
      if (!isPlayedMap(map) || !map.map) return;
      const r = row(map.map);
      r.played += 1;
      r.rounds += num(map.a) + num(map.b);
      playedTotal += 1;
    });
    const veto = getVeto(m);
    if (!veto.hasData) return;
    vetoMatches += 1;
    veto.bans.forEach((b) => { row(b.map).bans += 1; });
    veto.picks.forEach((p) => { if (p.by === "decider") row(p.map).deciders += 1; else row(p.map).picks += 1; });
  }));

  const rate = (n) => (vetoMatches ? n / vetoMatches : 0);
  return {
    vetoMatches,
    playedTotal,
    maps: [...rows.values()].map((r) => ({
      ...r,
      playRate: playedTotal ? r.played / playedTotal : 0,
      pickRate: rate(r.picks),
      banRate: rate(r.bans),
      deciderRate: rate(r.deciders),
      avgRounds: r.played ? r.rounds / r.played : null,
    })).sort((a, b) => b.played - a.played || b.pickRate - a.pickRate || a.map.localeCompare(b.map)),
  };
}

// Fiche d'une map : équipes qui la choisissent / la bannissent le plus, bilan des équipes
// dessus, agents les plus joués dessus.
export function computeMapDetail(mapName, tournaments) {
  const overview = computeMapOverview(tournaments, [mapName]);
  const stats = overview.maps.find((r) => r.map === mapName);
  const teams = new Map();
  const team = (info) => {
    if (!teams.has(info.key)) teams.set(info.key, { key: info.key, name: info.name, picks: 0, bans: 0, played: 0, wins: 0 });
    const e = teams.get(info.key);
    e.name = info.name;
    return e;
  };

  chronologicalTournaments(tournaments).forEach((t) => (t.matches || []).forEach((m) => {
    (m.mapScores || []).forEach((map) => {
      if (!isPlayedMap(map) || map.map !== mapName) return;
      ["A", "B"].forEach((side) => {
        const info = teamOf(t, m, side);
        if (!info) return;
        const e = team(info);
        e.played += 1;
        const own = num(side === "A" ? map.a : map.b);
        const other = num(side === "A" ? map.b : map.a);
        if (own > other) e.wins += 1;
      });
    });
    const veto = getVeto(m);
    veto.bans.filter((b) => b.map === mapName).forEach((b) => { const info = teamOf(t, m, b.side); if (info) team(info).bans += 1; });
    veto.picks.filter((p) => p.map === mapName && p.by !== "decider").forEach((p) => { const info = teamOf(t, m, p.by); if (info) team(info).picks += 1; });
  }));

  const agentMaps = collectAgentMaps(tournaments).filter((m) => m.mapName === mapName);
  const agentCounts = new Map();
  agentMaps.forEach((m) => new Set([...m.agents.A, ...m.agents.B]).forEach((a) => agentCounts.set(a, (agentCounts.get(a) || 0) + 1)));

  const list = [...teams.values()].map((e) => ({ ...e, winRate: e.played ? e.wins / e.played : 0 }));
  return {
    ...stats,
    vetoMatches: overview.vetoMatches,
    mostPicked: list.filter((e) => e.picks > 0).sort((a, b) => b.picks - a.picks).slice(0, 8),
    mostBanned: list.filter((e) => e.bans > 0).sort((a, b) => b.bans - a.bans).slice(0, 8),
    teamRecords: list.filter((e) => e.played > 0).sort((a, b) => b.played - a.played || b.winRate - a.winRate),
    agentMaps: agentMaps.length,
    agents: [...agentCounts.entries()].map(([agent, n]) => ({ agent, picks: n, pickRate: n / agentMaps.length }))
      .sort((a, b) => b.picks - a.picks),
  };
}
