import { emptyStats, applyMatchToStats } from "./stats.js";
import { computeParticipation } from "./participation.js";
import { computeMvpMj } from "./records.js";
import { ELO_CONFIG, computeTeamElo, chronologicalTournaments, orgKeyOf } from "./elo.js";

const pickExtreme = (list, better) => (list.length ? list.reduce((a, b) => (better(a, b) ? b : a)) : null);
const hasAnyValue = (row) => Object.values(row || {}).some((v) => v !== "" && v !== undefined && v !== null);

// Tout ce qu'affiche la page d'une équipe (organisation) :
//   - classement Elo, bilan, plus gros gain/perte, historique récent
//   - roster actif (5 principaux + remplaçants) et anciens joueurs
//   - pour chaque joueur, ses stats calculées UNIQUEMENT sur ses matchs avec cette équipe
//   - palmarès, avec le roster qui a réellement gagné
// Les stats par équipe utilisent tous les matchs enregistrés (appliqués au classement ou non),
// comme les records et les MVP/MJ.
export function buildTeamPage(key, tournaments, players, { organizations = [], playerElo = new Map(), config = ELO_CONFIG } = {}) {
  const ranking = computeTeamElo(tournaments, config, organizations);
  const rankIndex = ranking.findIndex((r) => r.key === key);
  if (rankIndex === -1) return null;
  const entry = ranking[rankIndex];
  const playerById = new Map(players.map((p) => [p.id, p]));

  const stints = new Map(); // playerId → { stats, mvp, mj, first, last, tournaments:Set, trophies:[] }
  const stintOf = (id) => {
    if (!stints.has(id)) stints.set(id, { stats: emptyStats(), mvp: 0, mj: 0, first: "", last: "", tournaments: new Set(), trophies: [] });
    return stints.get(id);
  };
  const palmares = [];

  chronologicalTournaments(tournaments).forEach((t) => {
    const team = t.teams.find((x) => orgKeyOf(x) === key);
    if (!team) return;

    team.playerIds.forEach((id) => {
      const s = stintOf(id);
      s.tournaments.add(t.id);
      if (t.date) {
        if (!s.first || t.date < s.first) s.first = t.date;
        if (!s.last || t.date > s.last) s.last = t.date;
      }
    });

    (t.matches || []).forEach((m) => {
      if (m.teamAId !== team.id && m.teamBId !== team.id) return;
      const side = m.teamAId === team.id ? "A" : "B";
      const teamA = t.teams.find((x) => x.id === m.teamAId);
      const teamB = t.teams.find((x) => x.id === m.teamBId);
      const participation = computeParticipation(m, teamA, teamB);
      participation.forEach((p, id) => {
        if (p.side !== side) return;
        const row = m.stats?.[id];
        if (!hasAnyValue(row)) return;
        const s = stintOf(id);
        s.stats = applyMatchToStats(s.stats, row);
      });
      const { mvpId, mjId } = computeMvpMj(m.stats, teamA);
      if (mvpId && participation.get(mvpId)?.side === side) stintOf(mvpId).mvp += 1;
      if (mjId && participation.get(mjId)?.side === side) stintOf(mjId).mj += 1;
    });

    if (t.finished && t.winnerTeamId === team.id) {
      palmares.push({ tournamentId: t.id, tournamentName: t.name, type: t.type, date: t.date, playerIds: [...team.playerIds] });
      team.playerIds.forEach((id) => stintOf(id).trophies.push({ tournamentName: t.name, type: t.type }));
    }
  });

  const toRow = (id) => {
    const s = stints.get(id) || stintOf(id);
    return {
      id,
      player: playerById.get(id) || null,
      elo: playerElo.get(id)?.elo ?? config.start,
      stats: { ...s.stats, mvp: s.mvp, mj: s.mj },
      since: s.first,
      until: s.last,
      tournaments: s.tournaments.size,
      trophies: s.trophies,
    };
  };

  const activeIds = [...entry.roster.map((r) => r.id), ...entry.substitutes];
  const activeSet = new Set(activeIds);
  const active = activeIds.map((id) => ({ ...toRow(id), substitute: !entry.roster.some((r) => r.id === id) }));
  const former = [...stints.keys()]
    .filter((id) => !activeSet.has(id))
    .map(toRow)
    .sort((a, b) => b.stats.match - a.stats.match || String(b.until).localeCompare(String(a.until)));

  const matches = entry.history.filter((h) => h.type === "match");
  return {
    entry,
    rank: rankIndex + 1,
    wins: matches.filter((h) => h.result === "W").length,
    losses: matches.filter((h) => h.result === "L").length,
    bestGain: pickExtreme(matches.filter((h) => h.delta > 0), (a, b) => b.delta > a.delta),
    worstLoss: pickExtreme(matches.filter((h) => h.delta < 0), (a, b) => b.delta < a.delta),
    recent: [...entry.history].reverse().slice(0, 12),
    active,
    former,
    palmares: palmares.reverse(),
    // utilisé plus tard pour les Légendes du club
    allMembers: [...stints.keys()].map(toRow),
  };
}
