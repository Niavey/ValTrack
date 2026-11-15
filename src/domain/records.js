import { num, normPct, hasStatValue } from "./stats.js";

// a match is BO3 if the winning side took exactly 2 maps, BO5 if it took exactly 3 —
// works whether it was a sweep or went the distance
export function classifyMatchFormat(mapScores) {
  if (!mapScores || mapScores.length === 0) return null;
  let winsA = 0, winsB = 0;
  mapScores.forEach((m) => {
    const a = num(m.a), b = num(m.b);
    if (a === 0 && b === 0) return;
    if (a > b) winsA++; else if (b > a) winsB++;
  });
  const maxWins = Math.max(winsA, winsB);
  if (maxWins === 2) return "BO3";
  if (maxWins === 3) return "BO5";
  return null;
}

// flattens every player-in-a-match stat line across all tournaments into BO3/BO5 buckets,
// each entry carrying enough context (tournament, match label, opponent) to trace the record
// MVP = highest rating in the match, all players combined. MJ = highest rating among the
// players NOT on the MVP's team (i.e. the best performer on the opposing side).
export function computeMvpMj(matchStats, teamA) {
  const entries = Object.entries(matchStats || {})
    .filter(([, vals]) => hasStatValue(vals?.rating))
    .map(([pid, vals]) => ({
      pid, rating: num(vals.rating), onTeamA: !!teamA?.playerIds.includes(pid),
    }));
  if (entries.length === 0) return { mvpId: null, mjId: null };
  const mvp = [...entries].sort((a, b) => b.rating - a.rating)[0];
  const opponents = entries.filter((e) => e.onTeamA !== mvp.onTeamA);
  const mj = opponents.length ? [...opponents].sort((a, b) => b.rating - a.rating)[0] : null;
  return { mvpId: mvp.pid, mjId: mj?.pid || null };
}

// live tally across every recorded match, applied to the classement or not — same philosophy
// as the BO3/BO5 records, which also don't care about the "applied" toggle
export function computeMvpMjCounts(tournaments) {
  const counts = {};
  tournaments.forEach((t) => {
    (t.matches || []).forEach((m) => {
      if (!m.stats || Object.keys(m.stats).length === 0) return;
      const teamA = t.teams.find((x) => x.id === m.teamAId);
      const { mvpId, mjId } = computeMvpMj(m.stats, teamA);
      if (mvpId) { counts[mvpId] = counts[mvpId] || { mvp: 0, mj: 0 }; counts[mvpId].mvp += 1; }
      if (mjId) { counts[mjId] = counts[mjId] || { mvp: 0, mj: 0 }; counts[mjId].mj += 1; }
    });
  });
  return counts;
}


export function collectMatchRecords(tournaments, players) {
  const buckets = { BO3: [], BO5: [] };
  tournaments.forEach((t) => {
    (t.matches || []).forEach((m) => {
      const format = classifyMatchFormat(m.mapScores);
      if (!format) return;
      const teamA = t.teams.find((x) => x.id === m.teamAId);
      const teamB = t.teams.find((x) => x.id === m.teamBId);
      Object.entries(m.stats || {}).forEach(([playerId, vals]) => {
        const player = players.find((p) => p.id === playerId);
        if (!player) return;
        const onTeamA = teamA?.playerIds.includes(playerId);
        const kill = num(vals.kill), death = num(vals.death), assist = num(vals.assist);
        const clutch = num(vals.clutch), clutchAttempt = num(vals.clutchAttempt);
        buckets[format].push({
          playerId,
          playerName: player.name,
          tournamentName: t.name,
          matchLabel: m.label,
          opponentName: (onTeamA ? teamB?.name : teamA?.name) || "",
          kill, death, assist,
          multiKill: num(vals.multiKill) || (num(vals.doubleKill) + num(vals.tripleKill) + num(vals.quadKill) + num(vals.ace)),
          acs: num(vals.acs),
          rating: hasStatValue(vals.rating) ? num(vals.rating) : null,
          kast: hasStatValue(vals.kast) ? normPct(vals.kast) : null,
          fk: num(vals.fk),
          fd: num(vals.fd),
          clutch, clutchAttempt,
          kd: death > 0 ? kill / death : kill,
          kda: death > 0 ? (kill + assist) / death : kill + assist,
          clutchPct: clutchAttempt > 0 ? (clutch / clutchAttempt) * 100 : 0,
        });
      });
    });
  });
  return buckets;
}

// match-level (not player-level) records: which BO3/BO5 went the longest or shortest, by rounds
export function collectMatchDurationRecords(tournaments) {
  const buckets = { BO3: [], BO5: [] };
  tournaments.forEach((t) => {
    (t.matches || []).forEach((m) => {
      const format = classifyMatchFormat(m.mapScores);
      if (!format) return;
      const teamA = t.teams.find((x) => x.id === m.teamAId);
      const teamB = t.teams.find((x) => x.id === m.teamBId);
      const totalRounds = (m.mapScores || []).reduce((s, ms) => s + num(ms.a) + num(ms.b), 0);
      buckets[format].push({
        tournamentName: t.name,
        matchLabel: m.label,
        teamAName: teamA?.name || "?",
        teamBName: teamB?.name || "?",
        totalRounds,
      });
    });
  });
  return buckets;
}

// for single-match records: Death and FD are bad stats — the lowest value is the "record"
export const RECORD_LOWER_BETTER = new Set(["death", "fd"]);

// picks the standout entry for a stat: highest for most fields, lowest for Death/FD.
// ties on Clutch % are broken by who actually won/lost more clutches, not just the percentage.
export function validRecordEntries(entries, field) {
  return entries.filter((entry) => entry[field.key] !== null && entry[field.key] !== undefined && entry[field.key] !== "");
}

export function pickBest(entries, field) {
  const valid = validRecordEntries(entries, field);
  const lowerIsBetter = RECORD_LOWER_BETTER.has(field.key);
  return [...valid].sort((a, b) => {
    const diff = lowerIsBetter ? a[field.key] - b[field.key] : b[field.key] - a[field.key];
    if (diff !== 0) return diff;
    if (field.key === "clutchPct") return b.clutch - a.clutch;
    return 0;
  })[0];
}
export function pickWorst(entries, field) {
  const valid = validRecordEntries(entries, field);
  const lowerIsBetter = RECORD_LOWER_BETTER.has(field.key);
  return [...valid].sort((a, b) => {
    const diff = lowerIsBetter ? b[field.key] - a[field.key] : a[field.key] - b[field.key];
    if (diff !== 0) return diff;
    if (field.key === "clutchPct") return b.clutchAttempt - a.clutchAttempt;
    return 0;
  })[0];
}
