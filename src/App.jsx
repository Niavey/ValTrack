import { useState, useEffect, useMemo, useRef } from "react";
import {
  Search, Plus, Upload, X, ChevronLeft, Crosshair,
  Trash2, ArrowUp, ArrowDown, Swords, Loader2, Pencil, UserCog, ListPlus,
  Trophy, Award, Image as ImageIcon, Globe, Users, Crown, CalendarDays, Flame, GitCompare, Shield,
} from "lucide-react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import "flag-icons/css/flag-icons.min.css";
import { isSupabaseConfigured } from "./supabaseClient";
import {
  loadValtrackData, upsertPlayerDb, upsertPlayersDb, deletePlayerDb,
  upsertTournamentDb, upsertTeamDb, upsertMatchDb, setMatchAppliedDb,
  setTeamLogoDb, setHiddenTeamDb, migrateLegacySnapshotDb, readLegacyWindowStorage,
} from "./valtrackDb";

const STORAGE_KEY = "vt_players_v2";
const TOURNAMENTS_KEY = "vt_tournaments_v1";
const HIDDEN_TEAMS_KEY = "vt_hidden_teams_v1";

// ---------- helpers ----------
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const num = (v) => {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return isNaN(n) ? 0 : n;
};

const round = (v, d = 0) => {
  const f = Math.pow(10, d);
  return Math.round((v + Number.EPSILON) * f) / f;
};

// a percentage sometimes arrives as a fraction (0.72) from spreadsheet % formatting
const normPct = (v) => {
  const n = num(v);
  return n !== 0 && Math.abs(n) <= 1 ? n * 100 : n;
};

function normalizeHeader(h) {
  return String(h || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/%/g, "pct")
    .replace(/[^a-z0-9]/g, "");
}

function CountryFlag({ code, style = {} }) {
  if (!code || code.length !== 2) return null;
  return (
    <span
      className={`fi fi-${code.toLowerCase()}`}
      style={{
        display: "inline-block",
        width: "1.35em",
        height: "1em",
        borderRadius: 2,
        flexShrink: 0,
        ...style,
      }}
    />
  );
}

const COUNTRIES = [
  ["FR", "France"], ["BE", "Belgique"], ["CH", "Suisse"], ["GB", "Royaume-Uni"],
  ["DE", "Allemagne"], ["ES", "Espagne"], ["IT", "Italie"], ["PT", "Portugal"],
  ["NL", "Pays-Bas"], ["SE", "Suède"], ["DK", "Danemark"], ["NO", "Norvège"],
  ["FI", "Finlande"], ["PL", "Pologne"], ["TR", "Turquie"], ["RU", "Russie"], ["KZ", "Kazakhstan"],
  ["UA", "Ukraine"], ["AT", "Autriche"], ["CZ", "République tchèque"],
  ["SK", "Slovaquie"], ["HU", "Hongrie"], ["RO", "Roumanie"], ["BG", "Bulgarie"],
  ["GR", "Grèce"], ["HR", "Croatie"], ["RS", "Serbie"], ["IS", "Islande"],
  ["IE", "Irlande"], ["US", "États-Unis"], ["CA", "Canada"], ["BR", "Brésil"],
  ["AR", "Argentine"], ["CL", "Chili"], ["CO", "Colombie"], ["EC", "Equateur"], ["MX", "Mexique"], ["KR", "Corée du Sud"],
  ["JP", "Japon"], ["CN", "Chine"], ["TW", "Taïwan"], ["HK", "Hong Kong"],
  ["SG", "Singapour"], ["TH", "Thaïlande"], ["PH", "Philippines"],
  ["ID", "Indonésie"], ["VN", "Vietnam"], ["IN", "Inde"], ["AU", "Australie"],
  ["NZ", "Nouvelle-Zélande"], ["MA", "Maroc"], ["DZ", "Algérie"],
  ["TN", "Tunisie"], ["EG", "Égypte"], ["SA", "Arabie saoudite"],
  ["AE", "Émirats arabes unis"], ["IL", "Israël"],
];

// canonical stat fields, in the exact order requested
const STAT_FIELDS = [
  { key: "match", label: "Match", decimals: 0 },
  { key: "maps", label: "Maps", decimals: 0 },
  { key: "round", label: "Round", decimals: 0 },
  { key: "rating", label: "Rating", decimals: 2 },
  { key: "acs", label: "ACS", decimals: 0 },
  { key: "kda", label: "KDA", decimals: 2 },
  { key: "kd", label: "KD", decimals: 2 },
  { key: "kill", label: "Kill", decimals: 0 },
  { key: "death", label: "Death", decimals: 0 },
  { key: "assist", label: "Assist", decimals: 0 },
  { key: "multiKill", label: "Multi Kill", decimals: 0 },
  { key: "kast", label: "KAST", decimals: 0, suffix: "%" },
  { key: "fk", label: "FK", decimals: 0 },
  { key: "fd", label: "FD", decimals: 0 },
  { key: "kdDiff", label: "KD Diff", decimals: 0 },
  { key: "fkDiff", label: "FK Diff", decimals: 0 },
  { key: "clutch", label: "Clutch", decimals: 0 },
  { key: "clutchAttempt", label: "Clutch Attempt", decimals: 0 },
  { key: "clutchPct", label: "Clutch %", decimals: 0, suffix: "%" },
  { key: "mvp", label: "MVP", decimals: 0 },
  { key: "mj", label: "MJ", decimals: 0 },
];

const HEADLINE_KEYS = ["rating", "acs", "kd", "kda", "kast", "clutchPct", "mvp", "mj"];

// single-match performance records — no Match/Maps/Round, those aren't personal records
const RECORD_FIELDS = [
  { key: "rating", label: "Rating", decimals: 2 },
  { key: "acs", label: "ACS", decimals: 0 },
  { key: "kda", label: "KDA", decimals: 2 },
  { key: "kd", label: "KD", decimals: 2 },
  { key: "kill", label: "Kill", decimals: 0 },
  { key: "death", label: "Death", decimals: 0 },
  { key: "assist", label: "Assist", decimals: 0 },
  { key: "multiKill", label: "Multi Kill", decimals: 0 },
  { key: "kast", label: "KAST", decimals: 0, suffix: "%" },
  { key: "fk", label: "FK", decimals: 0 },
  { key: "fd", label: "FD", decimals: 0 },
  { key: "clutch", label: "Clutch", decimals: 0 },
  { key: "clutchAttempt", label: "Clutch Attempt", decimals: 0 },
  { key: "clutchPct", label: "Clutch %", decimals: 0, suffix: "%" },
];

// a match is BO3 if the winning side took exactly 2 maps, BO5 if it took exactly 3 —
// works whether it was a sweep or went the distance
function classifyMatchFormat(mapScores) {
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
function computeMvpMj(matchStats, teamA, teamB) {
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
function computeMvpMjCounts(tournaments) {
  const counts = {};
  tournaments.forEach((t) => {
    (t.matches || []).forEach((m) => {
      if (!m.stats || Object.keys(m.stats).length === 0) return;
      const teamA = t.teams.find((x) => x.id === m.teamAId);
      const teamB = t.teams.find((x) => x.id === m.teamBId);
      const { mvpId, mjId } = computeMvpMj(m.stats, teamA, teamB);
      if (mvpId) { counts[mvpId] = counts[mvpId] || { mvp: 0, mj: 0 }; counts[mvpId].mvp += 1; }
      if (mjId) { counts[mjId] = counts[mjId] || { mvp: 0, mj: 0 }; counts[mjId].mj += 1; }
    });
  });
  return counts;
}

// full recompute (not additive) of MVP/MJ totals from every already-applied match — used once
// to backfill matches that existed before this feature, and safe to re-run (always idempotent)
function recomputeMvpMjTotals(tournaments) {
  const totals = {};
  tournaments.forEach((t) => {
    (t.matches || []).forEach((m) => {
      if (!m.appliedToStats) return;
      const teamA = t.teams.find((x) => x.id === m.teamAId);
      const teamB = t.teams.find((x) => x.id === m.teamBId);
      const { mvpId, mjId } = computeMvpMj(m.stats, teamA, teamB);
      if (mvpId) { totals[mvpId] = totals[mvpId] || { mvp: 0, mj: 0 }; totals[mvpId].mvp += 1; }
      if (mjId) { totals[mjId] = totals[mjId] || { mvp: 0, mj: 0 }; totals[mjId].mj += 1; }
    });
  });
  return totals;
}

function collectMatchRecords(tournaments, players) {
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
function collectMatchDurationRecords(tournaments) {
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

const MULTI_KILL_DETAIL_FIELDS = [
  { key: "doubleKill", label: "Double" },
  { key: "tripleKill", label: "Triple" },
  { key: "quadKill", label: "Quad" },
  { key: "ace", label: "Ace" },
];

const CLUTCH_DETAIL_FIELDS = [
  { key: "clutch1v1", label: "Clutch 1v1" },
  { key: "clutch1v2", label: "Clutch 1v2" },
  { key: "clutch1v3", label: "Clutch 1v3" },
  { key: "clutch1v4", label: "Clutch 1v4" },
  { key: "clutch1v5", label: "Clutch 1v5" },
];

const DETAIL_STAT_FIELDS = [...MULTI_KILL_DETAIL_FIELDS, ...CLUTCH_DETAIL_FIELDS];
const DETAIL_STAT_KEYS = new Set(DETAIL_STAT_FIELDS.map((f) => f.key));
const STAT_LABELS = Object.fromEntries([...STAT_FIELDS, ...DETAIL_STAT_FIELDS].map((f) => [f.key, f.label]));

const MATCH_INPUT_FIELDS = [
  "maps", "round", "kill", "death", "assist", "acs", "rating", "kast", "fk", "fd",
  "doubleKill", "tripleKill", "quadKill", "ace",
  "clutch1v1", "clutch1v2", "clutch1v3", "clutch1v4", "clutch1v5",
  "clutchAttempt",
];
// volume fields aren't ranked as "performance" — everything else is, lower-is-better only for Death
const RANK_ASCENDING = new Set(["death"]);

// for single-match records: Death and FD are bad stats — the lowest value is the "record"
const RECORD_LOWER_BETTER = new Set(["death", "fd"]);

// picks the standout entry for a stat: highest for most fields, lowest for Death/FD.
// ties on Clutch % are broken by who actually won/lost more clutches, not just the percentage.
function validRecordEntries(entries, field) {
  return entries.filter((entry) => entry[field.key] !== null && entry[field.key] !== undefined && entry[field.key] !== "");
}

function pickBest(entries, field) {
  const valid = validRecordEntries(entries, field);
  const lowerIsBetter = RECORD_LOWER_BETTER.has(field.key);
  return [...valid].sort((a, b) => {
    const diff = lowerIsBetter ? a[field.key] - b[field.key] : b[field.key] - a[field.key];
    if (diff !== 0) return diff;
    if (field.key === "clutchPct") return b.clutch - a.clutch;
    return 0;
  })[0];
}
function pickWorst(entries, field) {
  const valid = validRecordEntries(entries, field);
  const lowerIsBetter = RECORD_LOWER_BETTER.has(field.key);
  return [...valid].sort((a, b) => {
    const diff = lowerIsBetter ? b[field.key] - a[field.key] : a[field.key] - b[field.key];
    if (diff !== 0) return diff;
    if (field.key === "clutchPct") return b.clutchAttempt - a.clutchAttempt;
    return 0;
  })[0];
}
const RANKABLE_KEYS = new Set(STAT_FIELDS.map((f) => f.key).filter((k) => !["match", "maps", "round"].includes(k)));

const TROPHY_TYPES = ["Split", "Masters", "Champions", "Autre"];
const TROPHY_RANK = { Split: 1, Masters: 2, Champions: 3, Autre: 0 };
const TROPHY_COLOR = { Split: "#8792A0", Masters: "#C77B4B", Champions: "#E8B95E", Autre: "#8792A0" };

// team Elo ranking — global registry keyed by team name, recomputed live from every match
const ELO_START = 1000;
const ELO_MIN = 0;
const ELO_MAX = 2000;
const ELO_K = 48;
const ELO_SCALE = 400;
const TOURNAMENT_ELO_BONUS = { Split: 30, Masters: 60, Champions: 100, Autre: 20 };

function clampElo(v) {
  return Math.max(ELO_MIN, Math.min(ELO_MAX, v));
}

// which team won a match: explicit winnerTeamId if set, otherwise inferred from the map score
function matchWinnerTeamId(m) {
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
function getStompMultiplier(mapScores) {
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

function computeTeamElo(tournaments) {
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
function getTeamProfile(nameKey, tournaments, players) {
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

// these are never typed by hand — always computed from the raw counts
const DERIVED_KEYS = new Set(["kd", "kda", "kdDiff", "fkDiff", "clutchPct", "mvp", "mj"]);
const FORM_INPUT_FIELDS = STAT_FIELDS.filter((f) => !DERIVED_KEYS.has(f.key));

function hasEnteredDetail(stats, keys) {
  return keys.some((key) => stats?.[key] !== "" && stats?.[key] !== undefined && stats?.[key] !== null);
}

function multiKillFromDetails(stats) {
  return num(stats.doubleKill) + num(stats.tripleKill) + num(stats.quadKill) + num(stats.ace);
}

function clutchFromDetails(stats) {
  return num(stats.clutch1v1) + num(stats.clutch1v2) + num(stats.clutch1v3) + num(stats.clutch1v4) + num(stats.clutch1v5);
}

function computeMatchDerived(stats) {
  const multiKill = hasEnteredDetail(stats, MULTI_KILL_DETAIL_FIELDS.map((f) => f.key))
    ? multiKillFromDetails(stats)
    : num(stats.multiKill);
  const clutch = hasEnteredDetail(stats, CLUTCH_DETAIL_FIELDS.map((f) => f.key))
    ? clutchFromDetails(stats)
    : num(stats.clutch);
  return computeDerived({ ...stats, multiKill, clutch });
}

function computeDerived(stats) {
  const kill = num(stats.kill), death = num(stats.death), assist = num(stats.assist);
  const fk = num(stats.fk), fd = num(stats.fd);
  const clutch = num(stats.clutch), clutchAttempt = num(stats.clutchAttempt);
  const multiKill = hasEnteredDetail(stats, MULTI_KILL_DETAIL_FIELDS.map((f) => f.key))
    ? multiKillFromDetails(stats)
    : num(stats.multiKill);
  return {
    ...stats,
    multiKill,
    kd: death > 0 ? kill / death : kill,
    kda: death > 0 ? (kill + assist) / death : kill + assist,
    kdDiff: kill - death,
    fkDiff: fk - fd,
    clutchPct: clutchAttempt > 0 ? (clutch / clutchAttempt) * 100 : 0,
  };
}

// tie-break chains: applied in order, independent of the primary column's sort direction
const FIELD_ALIASES = {
  joueur: "name", nom: "name", name: "name", player: "name", pseudo: "name",
  equipe: "team", team: "team", org: "team",
  nationalite: "nationality", nationality: "nationality", pays: "nationality", country: "nationality",
  match: "match", matchs: "match", matches: "match", nbmatch: "match", nombredematchs: "match",
  maps: "maps", map: "maps",
  round: "round", rounds: "round",
  rating: "rating", rate: "rating",
  acs: "acs",
  kda: "kda",
  kd: "kd", ratiokd: "kd", kdratio: "kd",
  kill: "kill", kills: "kill",
  death: "death", deaths: "death",
  assist: "assist", assists: "assist",
  multikill: "multiKill", multikills: "multiKill",
  double: "doubleKill", doublekill: "doubleKill", doublekills: "doubleKill",
  triple: "tripleKill", triplekill: "tripleKill", triplekills: "tripleKill",
  quad: "quadKill", quadkill: "quadKill", quadkills: "quadKill", quadruple: "quadKill",
  ace: "ace", aces: "ace",
  clutch1v1: "clutch1v1", clutch1v2: "clutch1v2", clutch1v3: "clutch1v3", clutch1v4: "clutch1v4", clutch1v5: "clutch1v5",
  kast: "kast",
  fk: "fk", firstkills: "fk", premierskills: "fk",
  fd: "fd", firstdeaths: "fd", premieresmorts: "fd",
  kddiff: "kdDiff", diffkd: "kdDiff",
  fkdiff: "fkDiff", difffk: "fkDiff",
  clutch: "clutch", clutchsgagnes: "clutch", clutcheswon: "clutch", clutchwon: "clutch", clutchgagne: "clutch",
  clutchattempt: "clutchAttempt", clutchattempts: "clutchAttempt", tentativesclutch: "clutchAttempt", tentativeclutch: "clutchAttempt",
  clutchpct: "clutchPct", clutchpourcentage: "clutchPct", pctclutch: "clutchPct",
};

function mapRow(raw) {
  const row = {};
  Object.entries(raw).forEach(([h, v]) => {
    const key = FIELD_ALIASES[normalizeHeader(h)];
    if (key) row[key] = v;
  });
  return row;
}

function emptyStats() {
  const s = {};
  STAT_FIELDS.forEach((f) => { s[f.key] = ""; });
  return s;
}

function fmtStat(v, field) {
  if (v === "" || v === undefined || v === null) return "—";
  let n = num(v);
  if (field.suffix === "%" && n !== 0 && Math.abs(n) <= 1) n *= 100;
  return round(n, field.decimals) + (field.suffix || "");
}

// fields where "did it go up or down" isn't meaningful — they only ever accumulate
const NO_EVOLUTION_KEYS = new Set(["match", "maps", "round"]);

// compares the DISPLAYED (rounded) value against the snapshot taken just before the last
// match was added — green if it rose, red if it fell, null (default color) if unchanged or unknown
function evolutionColor(player, field) {
  if (NO_EVOLUTION_KEYS.has(field.key) || !player.prevStats) return null;
  const displayed = (v) => {
    let n = num(v);
    if (field.suffix === "%" && n !== 0 && Math.abs(n) <= 1) n *= 100;
    return round(n, field.decimals);
  };
  const cur = displayed(player.stats[field.key]);
  const prev = displayed(player.prevStats[field.key]);
  if (cur === prev) return null;
  return cur > prev ? "var(--green)" : "var(--red)";
}

function currentTeam(player) {
  const h = player.teamHistory || [];
  if (!h.length) return "";
  const last = h[h.length - 1];
  return last.until ? "" : last.team;
}

// label for a team-history row: "depuis X" only for the still-current spell; a closed spell
// shows its actual span (explicit "until", or inferred from when the next team started)
function teamPeriodLabel(entry, isCurrent, impliedUntil) {
  const until = entry.until || impliedUntil || "";
  if (isCurrent) return entry.since ? `depuis ${entry.since}` : "";
  if (entry.since && until) return `${entry.since} → ${until}`;
  if (until) return `jusqu'à ${until}`;
  if (entry.since) return `depuis ${entry.since}`;
  return "";
}

// tie-break chains: when the sorted column is equal, fall through these criteria in order
const TIEBREAKERS = {
  rating: [["round", "desc"], ["maps", "desc"], ["match", "desc"]],
  acs: [["round", "desc"], ["maps", "desc"], ["match", "desc"]],
  kast: [["round", "desc"], ["maps", "desc"], ["match", "desc"]],
  kda: [["kill", "desc"]],
  kd: [["kill", "desc"]],
  kill: [["round", "asc"]],
  assist: [["round", "asc"]],
  fk: [["round", "asc"]],
  fd: [["round", "asc"]],
  clutch: [["clutchAttempt", "asc"]],
  clutchPct: [["clutchAttempt", "desc"]],
  kdDiff: [["round", "asc"]],
  fkDiff: [["round", "asc"]],
  match: [["rating", "desc"]],
  maps: [["rating", "desc"]],
  round: [["rating", "desc"]],
};

function tieValue(player, key, dir) {
  const v = num(player.stats[key]);
  return dir === "asc" ? -v : v;
}

// ascending-style comparator for a stat column, falling through its tie-break chain, then name
function statCompareAsc(a, b, key) {
  const field = STAT_FIELDS.find((f) => f.key === key);
  const decimals = field ? field.decimals : 2;
  // percentage fields may be stored as a fraction (0.72) or as a full value (72) depending on
  // where the number came from — normalize both the same way fmtStat displays them
  const rawA = field && field.suffix === "%" ? normPct(a.stats[key]) : num(a.stats[key]);
  const rawB = field && field.suffix === "%" ? normPct(b.stats[key]) : num(b.stats[key]);
  // compare the rounded (displayed) value first — two players both showing "1.20" should
  // count as tied, even if their raw stored values differ by an invisible fraction
  const diff = round(rawA, decimals) - round(rawB, decimals);
  if (diff !== 0) return diff;
  for (const [tKey, dir] of TIEBREAKERS[key] || []) {
    const d = tieValue(a, tKey, dir) - tieValue(b, tKey, dir);
    if (d !== 0) return d;
  }
  return a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
}

function getLogo(teamLogos, teamName) {
  if (!teamName) return null;
  return teamLogos[teamName.trim().toLowerCase()] || null;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// pressing Enter moves to the next input in the same table/group instead of submitting or doing nothing
function focusNextInput(e) {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const container = e.currentTarget.closest("table") || e.currentTarget.closest(".vt-input-flow");
  if (!container) return;
  const inputs = Array.from(container.querySelectorAll("input"));
  const idx = inputs.indexOf(e.currentTarget);
  if (idx > -1 && idx < inputs.length - 1) inputs[idx + 1].focus();
}

// rank of a player on a given stat among players who have entered a value for it
function getRank(players, key, playerId) {
  if (!RANKABLE_KEYS.has(key)) return null;
  const ascending = RANK_ASCENDING.has(key);
  const withVal = players.filter((p) => p.stats[key] !== "" && p.stats[key] !== undefined && p.stats[key] !== null);
  if (withVal.length < 2) return null;
  const sorted = [...withVal].sort((a, b) => {
    const av = num(a.stats[key]), bv = num(b.stats[key]);
    return ascending ? av - bv : bv - av;
  });
  const idx = sorted.findIndex((p) => p.id === playerId);
  return idx === -1 ? null : idx + 1;
}

function countryLabel(code) {
  const c = COUNTRIES.find((x) => x[0] === code);
  return c ? c[1] : code || "";
}

function migratePlayer(p) {
  return {
    id: p.id || uid(),
    name: p.name || "",
    nationality: p.nationality || "",
    teamHistory: (p.teamHistory && p.teamHistory.length) ? p.teamHistory : (p.team ? [{ id: uid(), team: p.team, since: "" }] : []),
    trophies: p.trophies || [],
    stats: { ...emptyStats(), ...(p.stats || {}) },
    prevStats: p.prevStats || null,
  };
}

function migrateTournament(t) {
  return {
    id: t.id || uid(),
    name: t.name || "",
    type: t.type || TROPHY_TYPES[0],
    date: t.date || "",
    format: { groups: !!t.format?.groups, doubleElim: !!t.format?.doubleElim },
    teams: (t.teams || []).map((team) => ({ ...team, eliminated: !!team.eliminated })),
    matches: (t.matches || []).map((m) => ({ ...m, appliedToStats: m.appliedToStats !== undefined ? m.appliedToStats : true })),
    winnerTeamId: t.winnerTeamId || null,
    finished: !!t.finished,
  };
}

// running totals + weighted-average recompute when adding a new match's raw numbers
function hasStatValue(v) {
  return v !== "" && v !== undefined && v !== null && !Number.isNaN(Number(String(v).replace(",", ".")));
}

function averageCount(stats, key) {
  const stored = stats?.[`_${key}Count`];
  if (stored !== undefined && stored !== null && stored !== "") return Math.max(0, num(stored));
  return hasStatValue(stats?.[key]) && num(stats?.match) > 0 ? num(stats.match) : 0;
}

function applyMatchToStats(stats, m) {
  const oldMatch = num(stats.match);
  const totMatch = oldMatch + 1;

  const totMaps = num(stats.maps) + num(m.maps);
  const totRound = num(stats.round) + num(m.round);
  const totKill = num(stats.kill) + num(m.kill);
  const totDeath = num(stats.death) + num(m.death);
  const totAssist = num(stats.assist) + num(m.assist);
  const totFk = num(stats.fk) + num(m.fk);
  const totFd = num(stats.fd) + num(m.fd);

  const matchDoubleKill = num(m.doubleKill);
  const matchTripleKill = num(m.tripleKill);
  const matchQuadKill = num(m.quadKill);
  const matchAce = num(m.ace);
  const matchMultiKill = hasEnteredDetail(m, MULTI_KILL_DETAIL_FIELDS.map((f) => f.key))
    ? matchDoubleKill + matchTripleKill + matchQuadKill + matchAce
    : num(m.multiKill);

  const totDoubleKill = num(stats.doubleKill) + matchDoubleKill;
  const totTripleKill = num(stats.tripleKill) + matchTripleKill;
  const totQuadKill = num(stats.quadKill) + matchQuadKill;
  const totAce = num(stats.ace) + matchAce;
  const totMultiKill = num(stats.multiKill) + matchMultiKill;

  const matchClutch1v1 = num(m.clutch1v1);
  const matchClutch1v2 = num(m.clutch1v2);
  const matchClutch1v3 = num(m.clutch1v3);
  const matchClutch1v4 = num(m.clutch1v4);
  const matchClutch1v5 = num(m.clutch1v5);
  const matchClutch = hasEnteredDetail(m, CLUTCH_DETAIL_FIELDS.map((f) => f.key))
    ? matchClutch1v1 + matchClutch1v2 + matchClutch1v3 + matchClutch1v4 + matchClutch1v5
    : num(m.clutch);

  const totClutch1v1 = num(stats.clutch1v1) + matchClutch1v1;
  const totClutch1v2 = num(stats.clutch1v2) + matchClutch1v2;
  const totClutch1v3 = num(stats.clutch1v3) + matchClutch1v3;
  const totClutch1v4 = num(stats.clutch1v4) + matchClutch1v4;
  const totClutch1v5 = num(stats.clutch1v5) + matchClutch1v5;
  const totClutch = num(stats.clutch) + matchClutch;
  const totClutchAttempt = num(stats.clutchAttempt) + num(m.clutchAttempt);

  // Rating et KAST ignorent complètement les matchs où la valeur n'a pas été saisie.
  const oldRatingCount = averageCount(stats, "rating");
  const hasRating = hasStatValue(m.rating);
  const ratingCount = oldRatingCount + (hasRating ? 1 : 0);
  const rating = ratingCount > 0
    ? (num(stats.rating) * oldRatingCount + (hasRating ? num(m.rating) : 0)) / ratingCount
    : "";

  const oldKastCount = averageCount(stats, "kast");
  const hasKast = hasStatValue(m.kast);
  const kastCount = oldKastCount + (hasKast ? 1 : 0);
  const kast = kastCount > 0
    ? (normPct(stats.kast) * oldKastCount + (hasKast ? normPct(m.kast) : 0)) / kastCount
    : "";

  // ACS conserve le comportement historique (moyenne par match).
  const acs = (num(stats.acs) * oldMatch + num(m.acs)) / totMatch;

  return {
    ...stats,
    match: totMatch,
    maps: totMaps,
    round: totRound,
    rating,
    _ratingCount: ratingCount,
    acs,
    kast,
    _kastCount: kastCount,
    kd: totDeath > 0 ? totKill / totDeath : totKill,
    kda: totDeath > 0 ? (totKill + totAssist) / totDeath : totKill + totAssist,
    kill: totKill, death: totDeath, assist: totAssist,
    multiKill: totMultiKill,
    doubleKill: totDoubleKill, tripleKill: totTripleKill, quadKill: totQuadKill, ace: totAce,
    fk: totFk, fd: totFd,
    kdDiff: totKill - totDeath,
    fkDiff: totFk - totFd,
    clutch: totClutch,
    clutch1v1: totClutch1v1, clutch1v2: totClutch1v2, clutch1v3: totClutch1v3,
    clutch1v4: totClutch1v4, clutch1v5: totClutch1v5,
    clutchAttempt: totClutchAttempt,
    clutchPct: totClutchAttempt > 0 ? (totClutch / totClutchAttempt) * 100 : 0,
  };
}

function removeMatchFromStats(stats, m) {
  const oldMatch = num(stats.match);
  if (oldMatch <= 0) return stats;
  const totMatch = Math.max(0, oldMatch - 1);

  const sub = (key) => Math.max(0, num(stats[key]) - num(m[key]));
  const totMaps = sub("maps");
  const totRound = sub("round");
  const totKill = sub("kill");
  const totDeath = sub("death");
  const totAssist = sub("assist");
  const totFk = sub("fk");
  const totFd = sub("fd");

  const matchDoubleKill = num(m.doubleKill);
  const matchTripleKill = num(m.tripleKill);
  const matchQuadKill = num(m.quadKill);
  const matchAce = num(m.ace);
  const matchMultiKill = hasEnteredDetail(m, MULTI_KILL_DETAIL_FIELDS.map((f) => f.key))
    ? matchDoubleKill + matchTripleKill + matchQuadKill + matchAce
    : num(m.multiKill);

  const totDoubleKill = Math.max(0, num(stats.doubleKill) - matchDoubleKill);
  const totTripleKill = Math.max(0, num(stats.tripleKill) - matchTripleKill);
  const totQuadKill = Math.max(0, num(stats.quadKill) - matchQuadKill);
  const totAce = Math.max(0, num(stats.ace) - matchAce);
  const totMultiKill = Math.max(0, num(stats.multiKill) - matchMultiKill);

  const matchClutch1v1 = num(m.clutch1v1);
  const matchClutch1v2 = num(m.clutch1v2);
  const matchClutch1v3 = num(m.clutch1v3);
  const matchClutch1v4 = num(m.clutch1v4);
  const matchClutch1v5 = num(m.clutch1v5);
  const matchClutch = hasEnteredDetail(m, CLUTCH_DETAIL_FIELDS.map((f) => f.key))
    ? matchClutch1v1 + matchClutch1v2 + matchClutch1v3 + matchClutch1v4 + matchClutch1v5
    : num(m.clutch);

  const totClutch1v1 = Math.max(0, num(stats.clutch1v1) - matchClutch1v1);
  const totClutch1v2 = Math.max(0, num(stats.clutch1v2) - matchClutch1v2);
  const totClutch1v3 = Math.max(0, num(stats.clutch1v3) - matchClutch1v3);
  const totClutch1v4 = Math.max(0, num(stats.clutch1v4) - matchClutch1v4);
  const totClutch1v5 = Math.max(0, num(stats.clutch1v5) - matchClutch1v5);
  const totClutch = Math.max(0, num(stats.clutch) - matchClutch);
  const totClutchAttempt = Math.max(0, num(stats.clutchAttempt) - num(m.clutchAttempt));

  const oldRatingCount = averageCount(stats, "rating");
  const hadRating = hasStatValue(m.rating);
  const ratingCount = Math.max(0, oldRatingCount - (hadRating ? 1 : 0));
  const rating = ratingCount > 0
    ? (num(stats.rating) * oldRatingCount - (hadRating ? num(m.rating) : 0)) / ratingCount
    : "";

  const oldKastCount = averageCount(stats, "kast");
  const hadKast = hasStatValue(m.kast);
  const kastCount = Math.max(0, oldKastCount - (hadKast ? 1 : 0));
  const kast = kastCount > 0
    ? (normPct(stats.kast) * oldKastCount - (hadKast ? normPct(m.kast) : 0)) / kastCount
    : "";

  const acs = totMatch > 0 ? (num(stats.acs) * oldMatch - num(m.acs)) / totMatch : "";

  return {
    ...stats,
    match: totMatch,
    maps: totMaps,
    round: totRound,
    rating,
    _ratingCount: ratingCount,
    acs,
    kast,
    _kastCount: kastCount,
    kd: totDeath > 0 ? totKill / totDeath : totKill,
    kda: totDeath > 0 ? (totKill + totAssist) / totDeath : totKill + totAssist,
    kill: totKill, death: totDeath, assist: totAssist,
    multiKill: totMultiKill,
    doubleKill: totDoubleKill, tripleKill: totTripleKill, quadKill: totQuadKill, ace: totAce,
    fk: totFk, fd: totFd,
    kdDiff: totKill - totDeath,
    fkDiff: totFk - totFd,
    clutch: totClutch,
    clutch1v1: totClutch1v1, clutch1v2: totClutch1v2, clutch1v3: totClutch1v3,
    clutch1v4: totClutch1v4, clutch1v5: totClutch1v5,
    clutchAttempt: totClutchAttempt,
    clutchPct: totClutchAttempt > 0 ? (totClutch / totClutchAttempt) * 100 : 0,
  };
}

// ---------- style block (design system) ----------
const Styles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap');

    .vt-root {
      --void: #0A0E13;
      --panel: #10161E;
      --panel-raised: #171F29;
      --line: rgba(255,255,255,0.08);
      --red: #FF4655;
      --red-dim: rgba(255,70,85,0.14);
      --gold: #E8B95E;
      --silver: #B9C4CE;
      --bronze: #C77B4B;
      --steel: #7FA1C4;
      --text: #ECEFF3;
      --text-dim: #8792A0;
      --green: #4ADE80;
      font-family: 'Inter', sans-serif;
      background: var(--void);
      color: var(--text);
      min-height: 100vh;
      background-image:
        linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
      background-size: 32px 32px;
    }
    .vt-display { font-family: 'Rajdhani', sans-serif; letter-spacing: 0.01em; }
    .vt-mono { font-family: 'JetBrains Mono', monospace; }

    .vt-cut {
      clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
    }
    .vt-cut-sm {
      clip-path: polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px);
    }
    .vt-panel {
      background: var(--panel);
      border: 1px solid var(--line);
    }
    .vt-btn {
      font-family: 'Rajdhani', sans-serif;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      font-size: 13px;
      padding: 9px 16px;
      background: var(--panel-raised);
      border: 1px solid var(--line);
      color: var(--text);
      cursor: pointer;
      transition: border-color .15s ease, color .15s ease;
      display: inline-flex; align-items: center; gap: 8px;
    }
    .vt-btn:hover { border-color: var(--steel); color: #fff; }
    .vt-btn-primary {
      background: var(--red);
      border-color: var(--red);
      color: #180508;
    }
    .vt-btn-primary:hover { border-color: var(--red); color: #180508; filter: brightness(1.08); }
    .vt-input, .vt-select {
      background: var(--void);
      border: 1px solid var(--line);
      color: var(--text);
      padding: 8px 12px;
      font-family: 'Inter', sans-serif;
      font-size: 14px;
      outline: none;
    }
    .vt-input:focus, .vt-select:focus { border-color: var(--steel); }
    .vt-label {
      font-family: 'Rajdhani', sans-serif;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-size: 11px;
      color: var(--text-dim);
    }
    .vt-th {
      font-family: 'Rajdhani', sans-serif;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      font-size: 12px;
      color: var(--text-dim);
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
    }
    .vt-th:hover { color: var(--text); }
    .vt-row:hover { background: rgba(255,255,255,0.03); }
    .vt-ping {
      width: 7px; height: 7px; border-radius: 50%;
      background: var(--red);
      box-shadow: 0 0 0 0 rgba(255,70,85,0.6);
      animation: vt-pulse 1.8s infinite;
    }
    @keyframes vt-pulse {
      0% { box-shadow: 0 0 0 0 rgba(255,70,85,0.55); }
      70% { box-shadow: 0 0 0 8px rgba(255,70,85,0); }
      100% { box-shadow: 0 0 0 0 rgba(255,70,85,0); }
    }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .vt-medal-1 { color: var(--gold); }
    .vt-medal-2 { color: var(--silver); }
    .vt-medal-3 { color: var(--bronze); }
    .vt-scroll::-webkit-scrollbar { height: 6px; width: 6px; }
    .vt-scroll::-webkit-scrollbar-thumb { background: var(--line); }
    .vt-overlay {
      position: fixed; inset: 0; background: rgba(6,8,11,0.75);
      display: flex; align-items: center; justify-content: center;
      z-index: 50; padding: 16px;
      backdrop-filter: blur(2px);
    }
    .vt-flag-row {
      position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
      font-size: 40px; line-height: 1; opacity: 0.16; pointer-events: none;
      -webkit-mask-image: radial-gradient(circle, black 0%, transparent 72%);
      mask-image: radial-gradient(circle, black 0%, transparent 72%);
    }
    .vt-flag-header {
      position: absolute; right: -6px; top: 50%; transform: translateY(-50%);
      font-size: 128px; line-height: 1; opacity: 0.14; pointer-events: none;
      -webkit-mask-image: radial-gradient(circle, black 0%, transparent 70%);
      mask-image: radial-gradient(circle, black 0%, transparent 70%);
    }
    .vt-logo { width: 20px; height: 20px; object-fit: contain; border-radius: 3px; flex-shrink: 0; }
    .vt-logo-lg { width: 40px; height: 40px; object-fit: contain; border-radius: 5px; flex-shrink: 0; background: var(--panel-raised); border: 1px solid var(--line); }
    .vt-logo-upload {
      display: inline-flex; align-items: center; justify-content: center;
      width: 28px; height: 28px; cursor: pointer; color: var(--text-dim);
      background: var(--panel-raised); border: 1px solid var(--line); flex-shrink: 0;
    }
    .vt-logo-upload:hover { color: var(--text); border-color: var(--steel); }
    .vt-trophy-pill {
      display: inline-flex; align-items: center; gap: 6px;
      background: var(--red-dim); border: 1px solid var(--gold); padding: 6px 10px;
    }
  `}</style>
);

// ---------- small UI atoms ----------
function RankBadge({ rank }) {
  if (!rank || rank > 3) return null;
  const cls = rank === 1 ? "vt-medal-1" : rank === 2 ? "vt-medal-2" : "vt-medal-3";
  return (
    <span className={cls + " vt-display"} style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 11, fontWeight: 700, marginLeft: 6 }}>
      <Award size={11} /> #{rank}
    </span>
  );
}

function StatCard({ label, value, accent, rank }) {
  return (
    <div className="vt-panel vt-cut-sm" style={{ padding: "14px 16px", minWidth: 110 }}>
      <div className="vt-label" style={{ display: "flex", alignItems: "center" }}>{label}<RankBadge rank={rank} /></div>
      <div className="vt-mono vt-display" style={{ fontSize: 26, fontWeight: 600, color: accent || "var(--text)" }}>
        {value}
      </div>
    </div>
  );
}

function TeamLogoUpload({ team, teamLogos, onSetLogo, size = "sm" }) {
  const ref = useRef(null);
  const logo = getLogo(teamLogos, team);
  const handleChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !team) return;
    const dataUrl = await fileToDataUrl(file);
    onSetLogo(team, dataUrl);
  };
  return (
    <>
      <button
        type="button"
        className="vt-logo-upload"
        title={logo ? "Changer le logo" : "Ajouter un logo"}
        onClick={() => ref.current?.click()}
        disabled={!team}
        style={{ opacity: team ? 1 : 0.4, cursor: team ? "pointer" : "not-allowed" }}
      >
        {logo ? <img src={logo} className={size === "lg" ? "vt-logo-lg" : "vt-logo"} alt="" /> : <ImageIcon size={14} />}
      </button>
      <input ref={ref} type="file" accept="image/*" style={{ display: "none" }} onChange={handleChange} />
    </>
  );
}

function TrophySection({ player, onUpdate }) {
  const [type, setType] = useState(TROPHY_TYPES[0]);
  const [detail, setDetail] = useState("");
  const trophies = [...(player.trophies || [])].sort((a, b) => (TROPHY_RANK[b.type] ?? 0) - (TROPHY_RANK[a.type] ?? 0));

  const add = () => {
    onUpdate({ ...player, trophies: [...(player.trophies || []), { id: uid(), type, detail: detail.trim() }] });
    setDetail("");
  };
  const remove = (id) => onUpdate({ ...player, trophies: (player.trophies || []).filter((t) => t.id !== id) });

  return (
    <div style={{ marginBottom: 22 }}>
      <div className="vt-label" style={{ marginBottom: 8 }}>Trophées</div>
      {trophies.length === 0 ? (
        <div className="vt-panel vt-cut-sm" style={{ padding: 16, color: "var(--text-dim)", fontSize: 14, marginBottom: 10 }}>Aucun trophée pour le moment.</div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          {trophies.map((t) => {
            const c = TROPHY_COLOR[t.type] || TROPHY_COLOR.Autre;
            return (
              <div key={t.id} className="vt-trophy-pill vt-cut-sm" style={{ borderColor: c }}>
                <Trophy size={14} color={c} />
                <span className="vt-display" style={{ fontSize: 13, fontWeight: 600, color: c }}>{t.type}{t.detail ? " — " + t.detail : ""}</span>
                <button onClick={() => remove(t.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: 0, display: "flex" }}><X size={12} /></button>
              </div>
            );
          })}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select className="vt-select" value={type} onChange={(e) => setType(e.target.value)}>
          {TROPHY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input className="vt-input" style={{ flex: "1 1 160px" }} placeholder="Détail (ex : Madrid 2024, EMEA)" value={detail} onChange={(e) => setDetail(e.target.value)} />
        <button className="vt-btn vt-cut-sm" onClick={add}><Plus size={14} /> Ajouter</button>
      </div>
    </div>
  );
}

function SortHeader({ field, sortKey, sortDir, onClick, align = "right" }) {
  const active = sortKey === field.key;
  return (
    <th className="vt-th" style={{ padding: "10px 14px", textAlign: align }} onClick={() => onClick(field.key)}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {field.label}
        {active && (sortDir === "desc" ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
      </span>
    </th>
  );
}

function ModalShell({ title, onClose, children, wide }) {
  return (
    <div className="vt-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="vt-panel vt-cut vt-scroll" style={{ width: "100%", maxWidth: wide ? 680 : 460, maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--line)" }}>
          <h2 className="vt-display" style={{ fontSize: 20, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em" }}>{title}</h2>
          <button className="vt-btn vt-cut-sm" style={{ padding: 6 }} onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="vt-label" style={{ marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}

function NationalitySelect({ value, onChange }) {
  const isKnown = !value || COUNTRIES.some((c) => c[0] === value);
  const [custom, setCustom] = useState(!isKnown);
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      {!custom ? (
        <select className="vt-select" style={{ width: "100%" }} value={value} onChange={(e) => {
          if (e.target.value === "__custom") { setCustom(true); return; }
          onChange(e.target.value);
        }}>
          <option value="">— Non renseignée —</option>
          {COUNTRIES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          <option value="__custom">Autre (code ISO personnalisé)…</option>
        </select>
      ) : (
        <input
          className="vt-input vt-mono"
          style={{ width: "100%", textTransform: "uppercase" }}
          maxLength={2}
          placeholder="Code ISO, ex : FR"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
        />
      )}
      {value && <CountryFlag code={value} style={{ width: 30, height: 20 }} />}
    </div>
  );
}

// ---------- player creation ----------
function PlayerFormModal({ onClose, onSave }) {
  const [name, setName] = useState("");
  const [nationality, setNationality] = useState("");
  const [team, setTeam] = useState("");
  const [stats, setStats] = useState(emptyStats());
  const setField = (k) => (e) => setStats((s) => ({ ...s, [k]: e.target.value }));

  return (
    <ModalShell title="Nouveau joueur" onClose={onClose} wide>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Nom du joueur *">
          <input className="vt-input" style={{ width: "100%" }} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Équipe actuelle">
          <input className="vt-input" style={{ width: "100%" }} value={team} onChange={(e) => setTeam(e.target.value)} />
        </Field>
      </div>
      <Field label="Nationalité">
        <NationalitySelect value={nationality} onChange={setNationality} />
      </Field>

      <div className="vt-label" style={{ margin: "14px 0 8px" }}>Stats (facultatif à la création)</div>
      <div className="vt-input-flow" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {FORM_INPUT_FIELDS.map((f) => (
          <Field key={f.key} label={f.label}>
            <input type="number" step="any" className="vt-input vt-mono" style={{ width: "100%" }} value={stats[f.key]} onChange={setField(f.key)} onKeyDown={focusNextInput} />
          </Field>
        ))}
      </div>
      <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 4 }}>
        KD, KDA, KD Diff, FK Diff et Clutch % sont calculés automatiquement.
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <button className="vt-btn vt-cut-sm" onClick={onClose}>Annuler</button>
        <button
          className="vt-btn vt-btn-primary vt-cut-sm"
          onClick={() => {
            if (!name.trim()) return;
            onSave({
              id: uid(), name: name.trim(), nationality,
              teamHistory: team.trim() ? [{ id: uid(), team: team.trim(), since: "" }] : [],
              trophies: [],
              stats: computeDerived(stats),
            });
          }}
        >
          Créer
        </button>
      </div>
    </ModalShell>
  );
}

// ---------- profile edit: name, nationality, team history ----------
function ProfileEditModal({ player, teamLogos, onSetLogo, onClose, onSave }) {
  const [name, setName] = useState(player.name);
  const [nationality, setNationality] = useState(player.nationality || "");
  const [history, setHistory] = useState(player.teamHistory || []);
  const [newTeam, setNewTeam] = useState("");
  const [newSince, setNewSince] = useState("");

  const addEntry = () => {
    if (!newTeam.trim()) return;
    setHistory((h) => [...h, { id: uid(), team: newTeam.trim(), since: newSince.trim(), until: "" }]);
    setNewTeam(""); setNewSince("");
  };
  const removeEntry = (id) => setHistory((h) => h.filter((e) => e.id !== id));
  const updateEntry = (id, field, value) => setHistory((h) => h.map((e) => (e.id === id ? { ...e, [field]: value } : e)));

  return (
    <ModalShell title={`Modifier le profil — ${player.name}`} onClose={onClose} wide>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Nom du joueur *">
          <input className="vt-input" style={{ width: "100%" }} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Nationalité">
          <NationalitySelect value={nationality} onChange={setNationality} />
        </Field>
      </div>

      <div className="vt-label" style={{ margin: "16px 0 8px" }}>Historique d'équipes</div>
      {history.length === 0 && <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 10 }}>Aucune équipe enregistrée.</div>}
      {history.map((e, i) => {
        const isCurrent = i === history.length - 1 && !e.until;
        return (
          <div key={e.id} className="vt-panel vt-cut-sm" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", marginBottom: 6, gap: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <TeamLogoUpload team={e.team} teamLogos={teamLogos} onSetLogo={onSetLogo} />
              <span className="vt-display" style={{ fontWeight: 600 }}>{e.team}</span>
              {isCurrent && <span className="vt-label" style={{ color: "var(--red)" }}>Actuelle</span>}
              <input
                className="vt-input" style={{ width: 100, fontSize: 12, padding: "5px 8px" }}
                placeholder="Depuis" value={e.since} onChange={(ev) => updateEntry(e.id, "since", ev.target.value)}
              />
              <span style={{ color: "var(--text-dim)", fontSize: 12 }}>→</span>
              <input
                className="vt-input" style={{ width: 100, fontSize: 12, padding: "5px 8px" }}
                placeholder="Jusqu'à" value={e.until || ""} onChange={(ev) => updateEntry(e.id, "until", ev.target.value)}
              />
            </div>
            <button className="vt-btn vt-cut-sm" style={{ padding: "4px 8px" }} onClick={() => removeEntry(e.id)}><Trash2 size={12} /></button>
          </div>
        );
      })}

      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
        <TeamLogoUpload team={newTeam} teamLogos={teamLogos} onSetLogo={onSetLogo} />
        <input className="vt-input" style={{ flex: "2 1 160px" }} placeholder="Nom de l'équipe" value={newTeam} onChange={(e) => setNewTeam(e.target.value)} />
        <input className="vt-input" style={{ flex: "1 1 120px" }} placeholder="Depuis (ex : 2024, Jan. 2024)" value={newSince} onChange={(e) => setNewSince(e.target.value)} />
        <button className="vt-btn vt-cut-sm" onClick={addEntry}><Plus size={14} /> Ajouter</button>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 6 }}>
        La dernière équipe ajoutée sans date « Jusqu'à » est l'équipe actuelle du joueur. Renseigne
        « Jusqu'à » sur une équipe passée pour indiquer quand il l'a quittée — utile aussi si le
        joueur est actuellement sans équipe (mets « Jusqu'à » sur la dernière équipe et laisse-la
        sans nouvelle entrée).
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
        <button className="vt-btn vt-cut-sm" onClick={onClose}>Annuler</button>
        <button
          className="vt-btn vt-btn-primary vt-cut-sm"
          onClick={() => {
            if (!name.trim()) return;
            // if the user typed a team but never clicked "Ajouter", include it anyway
            const finalHistory = newTeam.trim()
              ? [...history, { id: uid(), team: newTeam.trim(), since: newSince.trim(), until: "" }]
              : history;
            onSave({ ...player, name: name.trim(), nationality, teamHistory: finalHistory });
          }}
        >
          Enregistrer
        </button>
      </div>
    </ModalShell>
  );
}

// ---------- raw stats correction (overwrite every field) ----------
function StatsCorrectionModal({ player, onClose, onSave }) {
  const [stats, setStats] = useState(player.stats);
  const setField = (k) => (e) => setStats((s) => ({ ...s, [k]: e.target.value }));
  return (
    <ModalShell title={`Corriger les valeurs — ${player.name}`} onClose={onClose} wide>
      <p style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 12 }}>
        Écrase directement chaque valeur — utile après un import ou pour corriger une erreur.
        KD, KDA, KD Diff, FK Diff et Clutch % sont recalculés automatiquement, pas besoin de les saisir.
      </p>
      <div className="vt-input-flow" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {FORM_INPUT_FIELDS.map((f) => (
          <Field key={f.key} label={f.label}>
            <input type="number" step="any" className="vt-input vt-mono" style={{ width: "100%" }} value={stats[f.key]} onChange={setField(f.key)} onKeyDown={focusNextInput} />
          </Field>
        ))}
      </div>
      <div className="vt-label" style={{ margin: "16px 0 8px" }}>Détail multi-kills & clutches</div>
      <div className="vt-input-flow" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {DETAIL_STAT_FIELDS.map((f) => (
          <Field key={f.key} label={f.label}>
            <input type="number" step="1" min="0" className="vt-input vt-mono" style={{ width: "100%" }} value={stats[f.key] ?? ""} onChange={setField(f.key)} onKeyDown={focusNextInput} />
          </Field>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <button className="vt-btn vt-cut-sm" onClick={onClose}>Annuler</button>
        <button className="vt-btn vt-btn-primary vt-cut-sm" onClick={() => onSave({ ...player, stats: computeDerived(stats) })}>Enregistrer</button>
      </div>
    </ModalShell>
  );
}

// ---------- add a match: enter raw numbers, totals/averages recomputed ----------
function AddMatchModal({ player, onClose, onSave }) {
  const [form, setForm] = useState(Object.fromEntries(MATCH_INPUT_FIELDS.map((k) => [k, ""])));
  const setField = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const labels = STAT_LABELS;

  return (
    <ModalShell title={`Ajouter un match — ${player.name}`} onClose={onClose} wide>
      <p style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 12 }}>
        Entre les chiffres de ce match : les totaux (Kill, Death, Round…) s'additionnent, et
        ACS / Rating / KAST deviennent une moyenne pondérée par le nombre de matchs joués. KD, KDA,
        KD Diff, FK Diff et Clutch % sont recalculés automatiquement.
      </p>
      <div className="vt-input-flow" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {MATCH_INPUT_FIELDS.map((k) => (
          <Field key={k} label={labels[k]}>
            <input type="number" step="any" className="vt-input vt-mono" style={{ width: "100%" }} value={form[k]} onChange={setField(k)} onKeyDown={focusNextInput} />
          </Field>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <button className="vt-btn vt-cut-sm" onClick={onClose}>Annuler</button>
        <button
          className="vt-btn vt-btn-primary vt-cut-sm"
          onClick={() => onSave({ ...player, prevStats: player.stats, stats: applyMatchToStats(player.stats, form) })}
        >
          Ajouter et recalculer
        </button>
      </div>
    </ModalShell>
  );
}

function ImportModal({ onClose, onImport }) {
  const [status, setStatus] = useState(null);
  const fileRef = useRef(null);

  const handleFile = (file) => {
    if (!file) return;
    setStatus("parsing");
    const ext = file.name.split(".").pop().toLowerCase();

    if (ext === "csv") {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const rows = results.data.map(mapRow).filter((r) => r.name);
          onImport(rows);
          setStatus({ ok: true, count: rows.length });
        },
        error: () => setStatus({ ok: false }),
      });
      return;
    }

    if (["ods", "xlsx", "xls"].includes(ext)) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target.result, { type: "array" });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const raw = XLSX.utils.sheet_to_json(sheet, { defval: "" });
          const rows = raw.map(mapRow).filter((r) => r.name);
          onImport(rows);
          setStatus({ ok: true, count: rows.length });
        } catch (err) {
          setStatus({ ok: false });
        }
      };
      reader.onerror = () => setStatus({ ok: false });
      reader.readAsArrayBuffer(file);
      return;
    }

    setStatus({ ok: false, unsupported: true });
  };

  return (
    <ModalShell title="Importer un tableur" onClose={onClose} wide>
      <p style={{ color: "var(--text-dim)", fontSize: 14, marginBottom: 14, lineHeight: 1.5 }}>
        Fichier .ods, .xlsx ou .csv avec <strong>une ligne par joueur</strong>. Colonnes reconnues,
        dans n'importe quel ordre : Joueur, Équipe, Nationalité, Match, Maps, Round, Rating, ACS,
        KDA, KD, Kill, Death, Assist, KAST, FK, FD, KD Diff, FK Diff, Clutch, Clutch Attempt,
        Clutch %. Si un joueur existe déjà (même nom), ses valeurs sont écrasées par celles du
        fichier, et un changement d'équipe est ajouté à son historique.
      </p>
      <div
        className="vt-cut-sm"
        style={{ border: "1px dashed var(--line)", padding: 28, textAlign: "center", cursor: "pointer" }}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]); }}
      >
        <Upload size={22} style={{ marginBottom: 8, color: "var(--steel)" }} />
        <div className="vt-label">Glisse ton fichier .ods, .xlsx ou .csv ici, ou clique pour parcourir</div>
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.ods" style={{ display: "none" }} onChange={(e) => handleFile(e.target.files?.[0])} />
      </div>
      {status === "parsing" && <div style={{ marginTop: 12, color: "var(--text-dim)", fontSize: 13 }}>Lecture du fichier…</div>}
      {status?.ok && <div style={{ marginTop: 12, color: "var(--steel)", fontSize: 13 }}>{status.count} joueur(s) importé(s)/mis à jour.</div>}
      {status?.ok === false && !status.unsupported && <div style={{ marginTop: 12, color: "var(--red)", fontSize: 13 }}>Le fichier n'a pas pu être lu.</div>}
      {status?.unsupported && <div style={{ marginTop: 12, color: "var(--red)", fontSize: 13 }}>Format non reconnu — utilise un .ods, .xlsx ou .csv.</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
        <button className="vt-btn vt-cut-sm" onClick={onClose}>Fermer</button>
      </div>
    </ModalShell>
  );
}

function PlayerSortHeader({ sortKey, sortDir, onClick }) {
  let icon = null;
  if (sortKey === "name") icon = sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
  else if (sortKey === "nationality") icon = <Globe size={12} />;
  return (
    <th className="vt-th" style={{ padding: "10px 14px", textAlign: "left" }} onClick={() => onClick("name")} title="Clique pour changer le tri : A→Z, puis Z→A, puis par nationalité">
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>Joueur {icon}</span>
    </th>
  );
}

// ---------- leaderboard ----------
function Leaderboard({ players, onOpenPlayer, query, sortKey, sortDir, onSort, teamLogos }) {
  const rows = useMemo(() => {
    const filtered = players.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));
    return [...filtered].sort((a, b) => {
      let compareAsc;
      if (sortKey === "name") {
        compareAsc = a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
      } else if (sortKey === "nationality") {
        const an = countryLabel(a.nationality) || "\uffff";
        const bn = countryLabel(b.nationality) || "\uffff";
        compareAsc = an.localeCompare(bn, "fr", { sensitivity: "base" });
        if (compareAsc === 0) compareAsc = num(b.stats.rating) - num(a.stats.rating);
      } else {
        compareAsc = statCompareAsc(a, b, sortKey);
      }
      return sortDir === "asc" ? compareAsc : -compareAsc;
    });
  }, [players, sortKey, sortDir, query]);

  if (players.length === 0) {
    return (
      <div className="vt-panel vt-cut" style={{ padding: 48, textAlign: "center", color: "var(--text-dim)" }}>
        <Crosshair size={28} style={{ marginBottom: 10, opacity: 0.6 }} />
        <div className="vt-display" style={{ fontSize: 20, color: "var(--text)", marginBottom: 6 }}>Aucun joueur pour le moment</div>
        <div style={{ fontSize: 14 }}>Ajoute un joueur ou importe ton tableur pour démarrer le suivi.</div>
      </div>
    );
  }

  return (
    <div className="vt-panel vt-cut vt-scroll" style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1550 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--line)" }}>
            <th className="vt-th" style={{ padding: "10px 14px", textAlign: "left" }}>#</th>
            <PlayerSortHeader sortKey={sortKey} sortDir={sortDir} onClick={onSort} />
            {STAT_FIELDS.map((f) => (
              <SortHeader key={f.key} field={f} sortKey={sortKey} sortDir={sortDir} onClick={onSort} />
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((player, i) => {
            const rank = i + 1;
            const medal = rank === 1 ? "vt-medal-1" : rank === 2 ? "vt-medal-2" : rank === 3 ? "vt-medal-3" : "";
            const logo = getLogo(teamLogos, currentTeam(player));
            return (
              <tr key={player.id} className="vt-row" style={{ borderBottom: "1px solid var(--line)", cursor: "pointer" }} onClick={() => onOpenPlayer(player.id)}>
                <td className={"vt-display vt-mono " + medal} style={{ padding: "12px 14px", fontSize: 18, fontWeight: 700 }}>{rank}</td>
                <td style={{ padding: "12px 14px", position: "relative", overflow: "hidden" }}>
                  {player.nationality && <span className="vt-flag-row"><CountryFlag code={player.nationality} style={{ width: 46, height: 32 }} /></span>}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, position: "relative" }}>
                    {rank === 1 && <span className="vt-ping" title="Meilleur sur cette colonne" />}
                    {logo && <img src={logo} className="vt-logo" alt="" />}
                    <div>
                      <div className="vt-display" style={{ fontWeight: 600, fontSize: 15 }}>{player.name}</div>
                      {currentTeam(player) && <div style={{ fontSize: 12, color: "var(--text-dim)" }}>{currentTeam(player)}</div>}
                    </div>
                  </div>
                </td>
                {STAT_FIELDS.map((f) => (
                  <td key={f.key} className="vt-mono" style={{ padding: "12px 14px", textAlign: "right", color: evolutionColor(player, f) || "var(--text)" }}>
                    {fmtStat(player.stats[f.key], f)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------- player detail ----------
function PlayerDetail({ player, players, tournaments, teamLogos, onSetLogo, onAddMatch, onEditProfile, onCorrectStats, onDeletePlayer, onUpdate, onBack }) {
  const [tab, setTab] = useState("profile");
  const [compareOpen, setCompareOpen] = useState(false);
  const history = [...(player.teamHistory || [])].reverse();
  const logo = getLogo(teamLogos, currentTeam(player));
  return (
    <div>
      <button className="vt-btn vt-cut-sm" style={{ marginBottom: 16 }} onClick={onBack}>
        <ChevronLeft size={15} /> Classement
      </button>

      <div className="vt-panel vt-cut" style={{ position: "relative", overflow: "hidden", padding: "20px 22px", marginBottom: 18 }}>
        {player.nationality && <span className="vt-flag-header"><CountryFlag code={player.nationality} style={{ width: 120, height: 80 }} /></span>}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12, position: "relative" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
            {logo && <img src={logo} className="vt-logo-lg" alt="" style={{ marginTop: 4 }} />}
            <div>
              <h1 className="vt-display" style={{ fontSize: 32, fontWeight: 700, textTransform: "uppercase" }}>{player.name}</h1>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                {currentTeam(player) && <span style={{ color: "var(--steel)", fontSize: 14 }}>{currentTeam(player)}</span>}
                {player.nationality && <span style={{ fontSize: 13, color: "var(--text-dim)", display: "inline-flex", alignItems: "center", gap: 6 }}><CountryFlag code={player.nationality} /> {countryLabel(player.nationality)}</span>}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="vt-btn vt-btn-primary vt-cut-sm" onClick={onAddMatch}><ListPlus size={14} /> Ajouter un match</button>
            <button className="vt-btn vt-cut-sm" onClick={() => setCompareOpen(true)}><GitCompare size={14} /> Comparer</button>
            <button className="vt-btn vt-cut-sm" onClick={onEditProfile}><UserCog size={14} /> Profil</button>
            <button className="vt-btn vt-cut-sm" onClick={onCorrectStats}><Pencil size={14} /> Corriger</button>
            <button className="vt-btn vt-cut-sm" onClick={onDeletePlayer}><Trash2 size={14} /></button>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        <button
          className="vt-btn vt-cut-sm"
          style={{ background: tab === "profile" ? "var(--panel-raised)" : "var(--panel)", borderColor: tab === "profile" ? "var(--steel)" : "var(--line)" }}
          onClick={() => setTab("profile")}
        >
          Profil
        </button>
        <button
          className="vt-btn vt-cut-sm"
          style={{ background: tab === "records" ? "var(--panel-raised)" : "var(--panel)", borderColor: tab === "records" ? "var(--steel)" : "var(--line)" }}
          onClick={() => setTab("records")}
        >
          <Flame size={14} /> Records
        </button>
      </div>

      {tab === "records" ? (
        <PlayerRecordsSection player={player} tournaments={tournaments} players={players} />
      ) : (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 22 }}>
            {HEADLINE_KEYS.map((k) => {
              const f = STAT_FIELDS.find((x) => x.key === k);
              return (
                <StatCard
                  key={k}
                  label={f.label}
                  value={fmtStat(player.stats[k], f)}
                  accent={k === "rating" ? "var(--red)" : k === "clutchPct" ? "var(--gold)" : k === "mvp" ? "var(--gold)" : k === "mj" ? "var(--steel)" : undefined}
                  rank={getRank(players, k, player.id)}
                />
              );
            })}
          </div>

          <TrophySection player={player} onUpdate={onUpdate} />

          <div className="vt-label" style={{ marginBottom: 8 }}>Autres stats</div>
          <div className="vt-panel vt-cut" style={{ padding: 4, marginBottom: 22 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
              {STAT_FIELDS.filter((f) => !HEADLINE_KEYS.includes(f.key)).map((f) => (
                <div key={f.key} style={{ padding: "14px 16px", borderBottom: "1px solid var(--line)" }}>
                  <div className="vt-label" style={{ display: "flex", alignItems: "center" }}>{f.label}<RankBadge rank={getRank(players, f.key, player.id)} /></div>
                  <div className="vt-mono" style={{ fontSize: 17, marginTop: 3 }}>{fmtStat(player.stats[f.key], f)}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginBottom: 22 }}>
            <div className="vt-panel vt-cut-sm" style={{ padding: 16 }}>
              <div className="vt-label" style={{ marginBottom: 12 }}>Détail des multi-kills</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 14 }}>
                <div>Double <strong className="vt-mono" style={{ float: "right" }}>{num(player.stats.doubleKill)}</strong></div>
                <div>Triple <strong className="vt-mono" style={{ float: "right" }}>{num(player.stats.tripleKill)}</strong></div>
                <div>Quad <strong className="vt-mono" style={{ float: "right" }}>{num(player.stats.quadKill)}</strong></div>
                <div>Ace <strong className="vt-mono" style={{ float: "right" }}>{num(player.stats.ace)}</strong></div>
              </div>
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--line)", display: "flex", justifyContent: "space-between" }}>
                <span className="vt-label">Total Multi Kill</span>
                <strong className="vt-mono">{num(player.stats.multiKill)}</strong>
              </div>
            </div>

            <div className="vt-panel vt-cut-sm" style={{ padding: 16 }}>
              <div className="vt-label" style={{ marginBottom: 12 }}>Détail des clutches gagnés</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 14 }}>
                <div>1v1 <strong className="vt-mono" style={{ float: "right" }}>{num(player.stats.clutch1v1)}</strong></div>
                <div>1v2 <strong className="vt-mono" style={{ float: "right" }}>{num(player.stats.clutch1v2)}</strong></div>
                <div>1v3 <strong className="vt-mono" style={{ float: "right" }}>{num(player.stats.clutch1v3)}</strong></div>
                <div>1v4 <strong className="vt-mono" style={{ float: "right" }}>{num(player.stats.clutch1v4)}</strong></div>
                <div>1v5 <strong className="vt-mono" style={{ float: "right" }}>{num(player.stats.clutch1v5)}</strong></div>
              </div>
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--line)", display: "flex", justifyContent: "space-between" }}>
                <span className="vt-label">Total Clutch</span>
                <strong className="vt-mono">{num(player.stats.clutch)}</strong>
              </div>
            </div>
          </div>

          <div className="vt-label" style={{ marginBottom: 8 }}>Historique d'équipes</div>
          {history.length === 0 ? (
            <div className="vt-panel vt-cut-sm" style={{ padding: 20, color: "var(--text-dim)", fontSize: 14 }}>Aucune équipe enregistrée.</div>
          ) : (
            <div className="vt-panel vt-cut" style={{ padding: 4 }}>
              {history.map((e, i) => {
                const eLogo = getLogo(teamLogos, e.team);
                const isCurrent = i === 0 && !e.until;
                const impliedUntil = i > 0 ? history[i - 1].since : "";
                const label = teamPeriodLabel(e, isCurrent, impliedUntil);
                return (
                  <div key={e.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: i < history.length - 1 ? "1px solid var(--line)" : "none" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {eLogo && <img src={eLogo} className="vt-logo" alt="" />}
                      <span className="vt-display" style={{ fontWeight: 600, fontSize: 15 }}>{e.team}</span>
                      {label && <span style={{ color: "var(--text-dim)", fontSize: 13, marginLeft: 4 }}>{label}</span>}
                    </div>
                    {isCurrent && <span className="vt-label" style={{ color: "var(--red)" }}>Actuelle</span>}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {compareOpen && <ComparePlayersModal basePlayer={player} players={players} onClose={() => setCompareOpen(false)} />}
    </div>
  );
}

// ==================== tournaments ====================

function TeamModal({ tournament, team, players, onClose, onSave, onCreatePlayer }) {
  const isEdit = !!team;
  const [name, setName] = useState(team?.name || "");
  const [playerIds, setPlayerIds] = useState(team?.playerIds || []);
  const [search, setSearch] = useState("");
  const [newPlayerName, setNewPlayerName] = useState("");

  const toggle = (id) => setPlayerIds((ids) => ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);

  const createAndAdd = () => {
    if (!newPlayerName.trim()) return;
    const p = onCreatePlayer(newPlayerName.trim());
    setPlayerIds((ids) => [...ids, p.id]);
    setNewPlayerName("");
  };

  const filtered = players.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <ModalShell title={isEdit ? `Modifier l'équipe — ${team.name}` : "Nouvelle équipe"} onClose={onClose} wide>
      <Field label="Nom de l'équipe *">
        <input className="vt-input" style={{ width: "100%" }} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>

      <div className="vt-label" style={{ margin: "14px 0 8px" }}>Créer un nouveau joueur et l'ajouter</div>
      <div style={{ display: "flex", gap: 8 }}>
        <input className="vt-input" style={{ flex: 1 }} placeholder="Nom du joueur" value={newPlayerName} onChange={(e) => setNewPlayerName(e.target.value)} />
        <button className="vt-btn vt-cut-sm" onClick={createAndAdd}><Plus size={14} /> Créer</button>
      </div>

      <div className="vt-label" style={{ margin: "16px 0 8px" }}>Composition ({playerIds.length} joueur{playerIds.length > 1 ? "s" : ""})</div>
      <input className="vt-input" style={{ width: "100%", marginBottom: 8 }} placeholder="Rechercher un joueur…" value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="vt-panel vt-cut-sm vt-scroll" style={{ maxHeight: 220, overflowY: "auto" }}>
        {filtered.length === 0 && <div style={{ padding: 14, color: "var(--text-dim)", fontSize: 13 }}>Aucun joueur.</div>}
        {filtered.map((p) => (
          <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderBottom: "1px solid var(--line)", cursor: "pointer" }}>
            <input type="checkbox" checked={playerIds.includes(p.id)} onChange={() => toggle(p.id)} />
            <span className="vt-display" style={{ fontSize: 14 }}>{p.name}</span>
            {currentTeam(p) && <span style={{ fontSize: 12, color: "var(--text-dim)" }}>({currentTeam(p)})</span>}
          </label>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
        <button className="vt-btn vt-cut-sm" onClick={onClose}>Annuler</button>
        <button
          className="vt-btn vt-btn-primary vt-cut-sm"
          onClick={() => { if (name.trim()) onSave({ id: team?.id || uid(), name: name.trim(), playerIds, eliminated: team?.eliminated || false }); }}
        >
          {isEdit ? "Enregistrer" : "Créer l'équipe"}
        </button>
      </div>
    </ModalShell>
  );
}

function CreateTournamentModal({ onClose, onSave }) {
  const [name, setName] = useState("");
  const [type, setType] = useState(TROPHY_TYPES[0]);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [groups, setGroups] = useState(false);
  const [doubleElim, setDoubleElim] = useState(false);

  return (
    <ModalShell title="Nouveau tournoi" onClose={onClose}>
      <Field label="Nom du tournoi *">
        <input className="vt-input" style={{ width: "100%" }} value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="ex : Champions 2026" />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Type">
          <select className="vt-select" style={{ width: "100%" }} value={type} onChange={(e) => setType(e.target.value)}>
            {TROPHY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Date">
          <input type="date" className="vt-input" style={{ width: "100%" }} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <div className="vt-label" style={{ margin: "14px 0 8px" }}>Format</div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer" }}>
        <input type="checkbox" checked={groups} onChange={(e) => setGroups(e.target.checked)} />
        <span style={{ fontSize: 14 }}>Phase de poules</span>
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
        <input type="checkbox" checked={doubleElim} onChange={(e) => setDoubleElim(e.target.checked)} />
        <span style={{ fontSize: 14 }}>Play-offs à double élimination</span>
      </label>
      <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 8 }}>
        Ces cases sont juste des étiquettes affichées sur le tournoi — tu ajoutes ensuite les matchs
        toi-même, poules comme play-offs, avec l'étiquette de ton choix. La date sert à classer les
        tournois dans la liste, même ajoutés dans le désordre.
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <button className="vt-btn vt-cut-sm" onClick={onClose}>Annuler</button>
        <button
          className="vt-btn vt-btn-primary vt-cut-sm"
          onClick={() => { if (name.trim()) onSave({ id: uid(), name: name.trim(), type, date, format: { groups, doubleElim }, teams: [], matches: [], winnerTeamId: null, finished: false }); }}
        >
          Créer
        </button>
      </div>
    </ModalShell>
  );
}

function EditTournamentModal({ tournament, onClose, onSave }) {
  const [name, setName] = useState(tournament.name);
  const [type, setType] = useState(tournament.type);
  const [date, setDate] = useState(tournament.date || "");
  const [groups, setGroups] = useState(tournament.format.groups);
  const [doubleElim, setDoubleElim] = useState(tournament.format.doubleElim);
  const [winnerTeamId, setWinnerTeamId] = useState(tournament.winnerTeamId || "");

  return (
    <ModalShell title={`Modifier — ${tournament.name}`} onClose={onClose}>
      <Field label="Nom du tournoi *">
        <input className="vt-input" style={{ width: "100%" }} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Type">
          <select className="vt-select" style={{ width: "100%" }} value={type} onChange={(e) => setType(e.target.value)}>
            {TROPHY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Date">
          <input type="date" className="vt-input" style={{ width: "100%" }} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <div className="vt-label" style={{ margin: "14px 0 8px" }}>Format</div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer" }}>
        <input type="checkbox" checked={groups} onChange={(e) => setGroups(e.target.checked)} />
        <span style={{ fontSize: 14 }}>Phase de poules</span>
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
        <input type="checkbox" checked={doubleElim} onChange={(e) => setDoubleElim(e.target.checked)} />
        <span style={{ fontSize: 14 }}>Play-offs à double élimination</span>
      </label>

      {tournament.finished && (
        <Field label="Équipe gagnante">
          <select className="vt-select" style={{ width: "100%" }} value={winnerTeamId} onChange={(e) => setWinnerTeamId(e.target.value)}>
            {tournament.teams.filter((t) => !t.eliminated || t.id === winnerTeamId).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 4 }}>
            Changer le vainqueur met à jour automatiquement les trophées des joueurs concernés.
          </div>
        </Field>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <button className="vt-btn vt-cut-sm" onClick={onClose}>Annuler</button>
        <button
          className="vt-btn vt-btn-primary vt-cut-sm"
          onClick={() => {
            if (!name.trim()) return;
            onSave({ name: name.trim(), type, date, format: { groups, doubleElim }, ...(tournament.finished ? { winnerTeamId: winnerTeamId || null } : {}) });
          }}
        >
          Enregistrer
        </button>
      </div>
    </ModalShell>
  );
}

// stats entered per player, excluding maps/round which are now derived once from the map scores
const TOURNAMENT_PLAYER_FIELDS = MATCH_INPUT_FIELDS.filter((k) => k !== "maps" && k !== "round");

function RosterPicker({ team, players, selected, onToggle }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 6 }}>
        Effectif de {team.playerIds.length} joueurs — sélectionne ceux qui ont joué ce match
        (coche plus de 5 noms s'il y a eu des remplacements).
      </div>
      <div className="vt-panel vt-cut-sm" style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: 8 }}>
        {team.playerIds.map((id) => {
          const p = players.find((x) => x.id === id);
          if (!p) return null;
          const on = selected.includes(id);
          return (
            <button
              type="button"
              key={id}
              onClick={() => onToggle(id)}
              className="vt-cut-sm"
              style={{
                padding: "5px 10px", fontSize: 12, cursor: "pointer",
                border: "1px solid " + (on ? "var(--red)" : "var(--line)"),
                background: on ? "var(--red-dim)" : "var(--panel-raised)",
                color: on ? "var(--text)" : "var(--text-dim)",
              }}
            >
              {p.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AddTournamentMatchModal({ tournament, players, existingMatch, onClose, onSave }) {
  const isEdit = !!existingMatch;
  const wasApplied = existingMatch?.appliedToStats || false;

  const [label, setLabel] = useState(existingMatch?.label || "");
  const [teamAId, setTeamAId] = useState(existingMatch?.teamAId || tournament.teams[0]?.id || "");
  const [teamBId, setTeamBId] = useState(existingMatch?.teamBId || tournament.teams[1]?.id || "");
  const [winnerTeamId, setWinnerTeamId] = useState(existingMatch?.winnerTeamId || "");
  const [mapScores, setMapScores] = useState(existingMatch?.mapScores?.length ? existingMatch.mapScores : [{ a: "", b: "" }]);
  const [applyToStats, setApplyToStats] = useState(isEdit ? wasApplied : true);
  const [saveError, setSaveError] = useState("");

  const teamA = tournament.teams.find((t) => t.id === teamAId);
  const teamB = tournament.teams.find((t) => t.id === teamBId);
  const aExceeds = (teamA?.playerIds.length || 0) > 5;
  const bExceeds = (teamB?.playerIds.length || 0) > 5;

  const existingIdsInTeam = (team) => (existingMatch ? Object.keys(existingMatch.stats).filter((id) => team?.playerIds.includes(id)) : []);
  const [participantsA, setParticipantsA] = useState(() => existingIdsInTeam(teamA));
  const [participantsB, setParticipantsB] = useState(() => existingIdsInTeam(teamB));
  const [rows, setRows] = useState(() => {
    if (!existingMatch) return {};
    const out = {};
    Object.entries(existingMatch.stats).forEach(([pid, vals]) => {
      out[pid] = Object.fromEntries(TOURNAMENT_PLAYER_FIELDS.map((k) => [k, vals[k] ?? ""]));
    });
    return out;
  });

  const rosterA = aExceeds ? participantsA : (teamA?.playerIds || []);
  const rosterB = bExceeds ? participantsB : (teamB?.playerIds || []);
  const rosterIds = Array.from(new Set([...rosterA, ...rosterB]));
  const roster = rosterIds.map((id) => players.find((p) => p.id === id)).filter(Boolean);

  const toggleA = (id) => setParticipantsA((ids) => ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  const toggleB = (id) => setParticipantsB((ids) => ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);

  const setMapScore = (idx, side, value) => setMapScores((rows) => rows.map((r, i) => i === idx ? { ...r, [side]: value } : r));
  const addMapRow = () => setMapScores((rows) => [...rows, { a: "", b: "" }]);
  const removeMapRow = (idx) => setMapScores((rows) => rows.filter((_, i) => i !== idx));

  const totalMaps = mapScores.filter((m) => m.a !== "" || m.b !== "").length;
  const totalRounds = mapScores.reduce((sum, m) => sum + num(m.a) + num(m.b), 0);

  const alreadyApplied = isEdit && wasApplied;

  const setCell = (playerId, field) => (e) => {
    setRows((r) => ({ ...r, [playerId]: { ...(r[playerId] || {}), [field]: e.target.value } }));
  };

  const labels = STAT_LABELS;

  return (
    <ModalShell title={`${isEdit ? "Modifier le match" : "Ajouter un match"} — ${tournament.name}`} onClose={onClose} wide>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12 }}>
        <Field label="Étiquette *">
          <input className="vt-input" style={{ width: "100%" }} placeholder='ex : "Poule A - J1", "Demi-finale"' value={label} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <Field label="Équipe A">
          <select className="vt-select" style={{ width: "100%" }} value={teamAId} onChange={(e) => { setTeamAId(e.target.value); setParticipantsA([]); }}>
            <option value="">—</option>
            {tournament.teams.filter((t) => !t.eliminated || t.id === teamAId).map((t) => <option key={t.id} value={t.id}>{t.name}{t.eliminated ? " (éliminée)" : ""}</option>)}
          </select>
        </Field>
        <Field label="Équipe B">
          <select className="vt-select" style={{ width: "100%" }} value={teamBId} onChange={(e) => { setTeamBId(e.target.value); setParticipantsB([]); }}>
            <option value="">—</option>
            {tournament.teams.filter((t) => !t.eliminated || t.id === teamBId).map((t) => <option key={t.id} value={t.id}>{t.name}{t.eliminated ? " (éliminée)" : ""}</option>)}
          </select>
        </Field>
      </div>

      {teamA && teamB && (
        <>
          {aExceeds && <RosterPicker team={teamA} players={players} selected={participantsA} onToggle={toggleA} />}
          {bExceeds && <RosterPicker team={teamB} players={players} selected={participantsB} onToggle={toggleB} />}

          <Field label="Équipe gagnante de ce match (facultatif)">
            <select className="vt-select" style={{ width: "100%" }} value={winnerTeamId} onChange={(e) => setWinnerTeamId(e.target.value)}>
              <option value="">— Non renseignée —</option>
              <option value={teamA.id}>{teamA.name}</option>
              <option value={teamB.id}>{teamB.name}</option>
            </select>
          </Field>
        </>
      )}

      <div className="vt-label" style={{ margin: "14px 0 8px" }}>Score par map</div>
      <div className="vt-input-flow" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {mapScores.map((m, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, color: "var(--text-dim)", width: 46 }}>Map {i + 1}</span>
            <input
              type="number" className="vt-input vt-mono" style={{ width: 70 }}
              placeholder={teamA?.name || "A"} value={m.a}
              onChange={(e) => setMapScore(i, "a", e.target.value)}
              onKeyDown={focusNextInput}
            />
            <span style={{ color: "var(--text-dim)" }}>—</span>
            <input
              type="number" className="vt-input vt-mono" style={{ width: 70 }}
              placeholder={teamB?.name || "B"} value={m.b}
              onChange={(e) => setMapScore(i, "b", e.target.value)}
              onKeyDown={focusNextInput}
            />
            {mapScores.length > 1 && (
              <button className="vt-btn vt-cut-sm" style={{ padding: "4px 8px" }} onClick={() => removeMapRow(i)}><Trash2 size={12} /></button>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
        <button className="vt-btn vt-cut-sm" onClick={addMapRow}><Plus size={14} /> Ajouter une map</button>
        <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
          {totalMaps} map{totalMaps > 1 ? "s" : ""} · {totalRounds} round{totalRounds > 1 ? "s" : ""} au total
        </span>
      </div>

      {teamA && teamB && roster.length === 0 && (
        <div className="vt-panel vt-cut-sm" style={{ padding: 14, marginTop: 16, color: "var(--red)", fontSize: 13 }}>
          Aucun joueur sélectionné pour l'instant — coche les joueurs qui ont participé dans les
          listes ci-dessus pour pouvoir entrer leurs stats.
        </div>
      )}

      {roster.length > 0 && (
        <>
          <div className="vt-label" style={{ margin: "16px 0 8px" }}>Stats des joueurs pour ce match</div>
          {alreadyApplied && (
            <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 8 }}>
              Ce match est déjà appliqué au classement. Tu peux modifier les stats ici :
              le classement du joueur sera corrigé automatiquement à l'enregistrement.
            </div>
          )}
          <div className="vt-panel vt-cut-sm vt-scroll" style={{ overflowX: "auto" }}>
            <table className="vt-input-flow" style={{ borderCollapse: "collapse", minWidth: 820 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--line)" }}>
                  <th className="vt-th" style={{ padding: "8px 10px", textAlign: "left" }}>Joueur</th>
                  {TOURNAMENT_PLAYER_FIELDS.map((k) => (
                    <th key={k} className="vt-th" style={{ padding: "8px 10px", textAlign: "right" }}>{labels[k]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roster.map((p) => (
                  <tr key={p.id} style={{ borderBottom: "1px solid var(--line)" }}>
                    <td style={{ padding: "6px 10px", fontSize: 13, whiteSpace: "nowrap" }}>{p.name}</td>
                    {TOURNAMENT_PLAYER_FIELDS.map((k) => (
                      <td key={k} style={{ padding: "4px 6px" }}>
                        <input
                          type="number" step="any" className="vt-input vt-mono"
                          style={{ width: 62, padding: "5px 6px", fontSize: 12 }}
                          value={rows[p.id]?.[k] || ""}
                          onChange={setCell(p.id, k)}
                          onKeyDown={focusNextInput}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 6 }}>
            Chaque joueur sélectionné reçoit {totalMaps} map{totalMaps > 1 ? "s" : ""} et {totalRounds} round{totalRounds > 1 ? "s" : ""}
            pour ce match — l'appli ne sait pas combien de maps précises un remplaçant a joué individuellement.
          </div>
          {(() => {
            const missing = roster.filter((p) => {
              const vals = rows[p.id];
              return !vals || !Object.values(vals).some((v) => v !== "" && v !== undefined);
            });
            return missing.length > 0 ? (
              <div className="vt-panel vt-cut-sm" style={{ padding: 12, marginTop: 8, border: "1px solid var(--red)", color: "var(--red)", fontSize: 12 }}>
                Aucune stat saisie pour {missing.length} joueur{missing.length > 1 ? "s" : ""} — {missing.length > 1 ? "ils" : "il"} ne
                {missing.length > 1 ? " seront" : " sera"} pas comptabilisé{missing.length > 1 ? "s" : ""} pour ce match : {missing.map((p) => p.name).join(", ")}.
              </div>
            ) : null;
          })()}
        </>
      )}

      {!alreadyApplied && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, cursor: "pointer" }}>
          <input type="checkbox" checked={applyToStats} onChange={(e) => setApplyToStats(e.target.checked)} />
          <span style={{ fontSize: 13 }}>Ajouter ces stats au classement général</span>
        </label>
      )}
      <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 4 }}>
        {alreadyApplied
          ? "Ce match compte déjà dans le classement. Toute modification des stats sera répercutée automatiquement."
          : "Décoche pour enregistrer un match passé (backfill) sans fausser les stats actuelles — tu pourras l'appliquer plus tard depuis la liste des matchs."}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginTop: 16 }}>
        {saveError && <span style={{ color: "var(--red)", fontSize: 12 }}>{saveError}</span>}
        <button className="vt-btn vt-cut-sm" onClick={onClose}>Annuler</button>
        <button
          className="vt-btn vt-btn-primary vt-cut-sm"
          onClick={() => {
            if (!label.trim()) { setSaveError("Ajoute une étiquette."); return; }
            const stats = {};
            Object.entries(rows).forEach(([playerId, vals]) => {
              const hasValue = Object.values(vals).some((v) => v !== "" && v !== undefined);
              if (!hasValue) return;
              stats[playerId] = computeMatchDerived({ ...vals, maps: totalMaps, round: totalRounds });
            });
            if (Object.keys(stats).length === 0) { setSaveError("Aucune stat saisie."); return; }
            onSave(
              {
                id: existingMatch?.id || uid(),
                label: label.trim(), teamAId, teamBId, winnerTeamId: winnerTeamId || null,
                mapScores, stats,
                appliedToStats: alreadyApplied ? true : applyToStats,
              },
              wasApplied
            );
          }}
        >
          {isEdit ? "Enregistrer les modifications" : "Enregistrer"}
        </button>
      </div>
    </ModalShell>
  );
}

function FinishTournamentModal({ tournament, onClose, onSave }) {
  const [winnerTeamId, setWinnerTeamId] = useState("");
  return (
    <ModalShell title={`Terminer — ${tournament.name}`} onClose={onClose}>
      <Field label="Équipe gagnante *">
        <select className="vt-select" style={{ width: "100%" }} value={winnerTeamId} onChange={(e) => setWinnerTeamId(e.target.value)}>
          <option value="">— Choisir —</option>
          {tournament.teams.filter((t) => !t.eliminated || t.id === winnerTeamId).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </Field>
      <div style={{ fontSize: 13, color: "var(--text-dim)" }}>
        Chaque joueur de l'équipe gagnante recevra automatiquement un trophée
        « {tournament.type} — {tournament.name} » sur son profil.
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <button className="vt-btn vt-cut-sm" onClick={onClose}>Annuler</button>
        <button className="vt-btn vt-btn-primary vt-cut-sm" onClick={() => { if (winnerTeamId) onSave(winnerTeamId); }}>
          <Crown size={14} /> Valider le vainqueur
        </button>
      </div>
    </ModalShell>
  );
}

function TournamentsList({ tournaments, onOpen, teamLogos }) {
  if (tournaments.length === 0) {
    return (
      <div className="vt-panel vt-cut" style={{ padding: 48, textAlign: "center", color: "var(--text-dim)" }}>
        <Trophy size={28} style={{ marginBottom: 10, opacity: 0.6 }} />
        <div className="vt-display" style={{ fontSize: 20, color: "var(--text)", marginBottom: 6 }}>Aucun tournoi pour le moment</div>
        <div style={{ fontSize: 14 }}>Crée un tournoi pour suivre poules, play-offs et stats en direct.</div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {[...tournaments].sort((a, b) => (b.date || "").localeCompare(a.date || "")).map((t) => {
        const winner = t.teams.find((x) => x.id === t.winnerTeamId);
        const logo = winner ? getLogo(teamLogos, winner.name) : null;
        return (
          <div key={t.id} className="vt-panel vt-cut vt-row" style={{ padding: "16px 18px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }} onClick={() => onOpen(t.id)}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Trophy size={20} color={t.finished ? "#E8B95E" : "#7FA1C4"} />
              <div>
                <div className="vt-display" style={{ fontSize: 17, fontWeight: 700 }}>{t.name}</div>
                <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
                  {t.date && <>{t.date} · </>}<span style={{ color: TROPHY_COLOR[t.type] || TROPHY_COLOR.Autre, fontWeight: 600 }}>{t.type}</span> · {t.teams.length} équipe{t.teams.length > 1 ? "s" : ""} · {t.matches.length} match{t.matches.length > 1 ? "s" : ""}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {t.finished && winner ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--gold)" }}>
                  {logo && <img src={logo} className="vt-logo" alt="" />}
                  <Crown size={14} /> {winner.name}
                </span>
              ) : (
                <span className="vt-label" style={{ color: "var(--steel)" }}>En cours</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TournamentDetail({ tournament, players, teamLogos, onBack, onAddTeam, onEditTeam, onAddMatch, onEditMatch, onApplyMatch, onFinish, onEditInfo, onToggleEliminated }) {
  const typeColor = TROPHY_COLOR[tournament.type] || TROPHY_COLOR.Autre;
  return (
    <div>
      <button className="vt-btn vt-cut-sm" style={{ marginBottom: 16 }} onClick={onBack}>
        <ChevronLeft size={15} /> Tournois
      </button>

      <div className="vt-panel vt-cut" style={{ padding: "20px 22px", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 className="vt-display" style={{ fontSize: 30, fontWeight: 700, textTransform: "uppercase" }}>{tournament.name}</h1>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
              {tournament.date && <span className="vt-mono" style={{ color: "var(--text-dim)", fontSize: 13 }}>{tournament.date}</span>}
              <span className="vt-display" style={{ color: typeColor, fontSize: 14, fontWeight: 700 }}>{tournament.type}</span>
              {tournament.format.groups && <span className="vt-label">Poules</span>}
              {tournament.format.doubleElim && <span className="vt-label">Double élim.</span>}
              {tournament.finished ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--gold)", fontSize: 13 }}>
                  <Crown size={13} /> Terminé — {tournament.teams.find((t) => t.id === tournament.winnerTeamId)?.name}
                </span>
              ) : (
                <span className="vt-label" style={{ color: "var(--steel)" }}>En cours</span>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="vt-btn vt-cut-sm" onClick={onEditInfo}><Pencil size={14} /> Modifier</button>
            {!tournament.finished && (
              <button className="vt-btn vt-btn-primary vt-cut-sm" onClick={onFinish} disabled={tournament.teams.length < 2}>
                <Crown size={14} /> Terminer le tournoi
              </button>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div className="vt-label">Équipes</div>
        <button className="vt-btn vt-cut-sm" onClick={onAddTeam}><Users size={14} /> Ajouter une équipe</button>
      </div>
      {tournament.teams.length === 0 ? (
        <div className="vt-panel vt-cut-sm" style={{ padding: 18, color: "var(--text-dim)", fontSize: 14, marginBottom: 22 }}>Aucune équipe pour l'instant.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10, marginBottom: 22 }}>
          {tournament.teams.map((team) => {
            const logo = getLogo(teamLogos, team.name);
            const isWinner = tournament.winnerTeamId === team.id;
            return (
              <div key={team.id} className="vt-panel vt-cut-sm" style={{ padding: 14, opacity: team.eliminated ? 0.55 : 1, border: isWinner ? "1px solid var(--gold)" : team.eliminated ? "1px solid var(--red)" : undefined }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer" }} onClick={() => onEditTeam(team)}>
                  {logo && <img src={logo} className="vt-logo" alt="" />}
                  <span className="vt-display" style={{ fontWeight: 700, fontSize: 15 }}>{team.name}</span>
                  {isWinner && <Crown size={14} color="#E8B95E" />}
                  {team.eliminated && <span className="vt-label" style={{ color: "var(--red)" }}>Éliminée</span>}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.6, cursor: "pointer" }} onClick={() => onEditTeam(team)}>
                  {team.playerIds.map((id) => players.find((p) => p.id === id)?.name).filter(Boolean).join(", ") || "Aucun joueur"}
                </div>
                <button
                  className="vt-btn vt-cut-sm"
                  style={{ marginTop: 10, padding: "4px 8px", fontSize: 11 }}
                  onClick={(e) => { e.stopPropagation(); onToggleEliminated(team.id); }}
                >
                  {team.eliminated ? "Réintégrer" : "Marquer éliminée"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div className="vt-label">Matchs</div>
        <button className="vt-btn vt-btn-primary vt-cut-sm" onClick={onAddMatch} disabled={tournament.teams.length < 2}>
          <ListPlus size={14} /> Ajouter un match
        </button>
      </div>
      {tournament.matches.length === 0 ? (
        <div className="vt-panel vt-cut-sm" style={{ padding: 18, color: "var(--text-dim)", fontSize: 14 }}>Aucun match pour l'instant.</div>
      ) : (
        <div className="vt-panel vt-cut" style={{ padding: 4 }}>
          {[...tournament.matches].reverse().map((m, i, arr) => {
            const teamA = tournament.teams.find((t) => t.id === m.teamAId);
            const teamB = tournament.teams.find((t) => t.id === m.teamBId);
            const winner = tournament.teams.find((t) => t.id === m.winnerTeamId);
            return (
              <div key={m.id} style={{ padding: "12px 16px", borderBottom: i < arr.length - 1 ? "1px solid var(--line)" : "none", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div>
                  <div className="vt-display" style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 2 }}>{m.label}</div>
                  <div style={{ fontSize: 14 }}>
                    {teamA?.name || "?"} <span style={{ color: "var(--text-dim)" }}>vs</span> {teamB?.name || "?"}
                    {winner && <span style={{ marginLeft: 10, color: "var(--gold)", fontSize: 12 }}><Crown size={11} style={{ display: "inline", marginRight: 3 }} />{winner.name}</span>}
                  </div>
                  {m.mapScores && m.mapScores.length > 0 && (
                    <div className="vt-mono" style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 3 }}>
                      {m.mapScores.filter((s) => s.a !== "" || s.b !== "").map((s, si) => `${s.a || 0}-${s.b || 0}`).join(" · ")}
                    </div>
                  )}
                  <div style={{ marginTop: 4 }}>
                    {m.appliedToStats ? (
                      <span style={{ fontSize: 11, color: "var(--green)" }}>✓ Appliqué au classement</span>
                    ) : (
                      <span style={{ fontSize: 11, color: "var(--text-dim)" }}>Pas encore appliqué</span>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {!m.appliedToStats && (
                    <button className="vt-btn vt-cut-sm" style={{ padding: "5px 9px", fontSize: 11 }} onClick={() => onApplyMatch(m.id)}>
                      Appliquer au classement
                    </button>
                  )}
                  <button className="vt-btn vt-cut-sm" style={{ padding: "5px 9px" }} onClick={() => onEditMatch(m)}><Pencil size={12} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RecordCard({ field, entries }) {
  const validEntries = validRecordEntries(entries, field);
  if (validEntries.length === 0) return null;
  const fmt = (v) => round(v, field.decimals) + (field.suffix || "");
  const top = pickBest(validEntries, field);
  const bottom = pickWorst(validEntries, field);
  const showBottom = bottom !== top;

  return (
    <div className="vt-panel vt-cut-sm" style={{ padding: 14 }}>
      <div className="vt-label" style={{ marginBottom: 10 }}>{field.label}</div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Flame size={14} color="#E8B95E" />
        <span className="vt-display" style={{ fontWeight: 700, fontSize: 14 }}>{top.playerName}</span>
        <span className="vt-mono" style={{ color: "var(--gold)", fontWeight: 700, marginLeft: "auto" }}>{fmt(top[field.key])}</span>
      </div>
      <div style={{ fontSize: 11, color: "var(--text-dim)", marginLeft: 22, marginBottom: showBottom ? 10 : 0 }}>
        {top.tournamentName} · {top.matchLabel}{top.opponentName ? ` vs ${top.opponentName}` : ""}
      </div>

      {showBottom && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 14 }} />
            <span className="vt-display" style={{ fontWeight: 600, fontSize: 14, color: "var(--text-dim)" }}>{bottom.playerName}</span>
            <span className="vt-mono" style={{ color: "var(--text-dim)", marginLeft: "auto" }}>{fmt(bottom[field.key])}</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", marginLeft: 22 }}>
            {bottom.tournamentName} · {bottom.matchLabel}{bottom.opponentName ? ` vs ${bottom.opponentName}` : ""}
          </div>
        </>
      )}
    </div>
  );
}

function MatchDurationCard({ title, entries }) {
  return (
    <div className="vt-panel vt-cut-sm" style={{ padding: 14 }}>
      <div className="vt-label" style={{ marginBottom: 10 }}>{title}</div>
      {entries.length === 0 ? (
        <div style={{ color: "var(--text-dim)", fontSize: 13 }}>Aucun match {title} enregistré.</div>
      ) : (() => {
        const longest = [...entries].sort((a, b) => b.totalRounds - a.totalRounds)[0];
        const shortest = [...entries].sort((a, b) => a.totalRounds - b.totalRounds)[0];
        const showShortest = shortest !== longest;
        return (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Flame size={14} color="#E8B95E" />
              <span className="vt-display" style={{ fontWeight: 700, fontSize: 14 }}>Plus long</span>
              <span className="vt-mono" style={{ color: "var(--gold)", fontWeight: 700, marginLeft: "auto" }}>{longest.totalRounds} rounds</span>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginLeft: 22, marginBottom: showShortest ? 10 : 0 }}>
              {longest.tournamentName} · {longest.matchLabel} — {longest.teamAName} vs {longest.teamBName}
            </div>
            {showShortest && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 14 }} />
                  <span className="vt-display" style={{ fontWeight: 600, fontSize: 14, color: "var(--text-dim)" }}>Plus court</span>
                  <span className="vt-mono" style={{ color: "var(--text-dim)", marginLeft: "auto" }}>{shortest.totalRounds} rounds</span>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-dim)", marginLeft: 22 }}>
                  {shortest.tournamentName} · {shortest.matchLabel} — {shortest.teamAName} vs {shortest.teamBName}
                </div>
              </>
            )}
          </>
        );
      })()}
    </div>
  );
}

function RecordsSection({ title, entries, Card = RecordCard, emptyText = "Aucun match de ce format enregistré pour l'instant." }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div className="vt-label" style={{ marginBottom: 10 }}>{title}</div>
      {entries.length === 0 ? (
        <div className="vt-panel vt-cut-sm" style={{ padding: 18, color: "var(--text-dim)", fontSize: 14 }}>
          {emptyText}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 10 }}>
          {RECORD_FIELDS.map((f) => <Card key={f.key} field={f} entries={entries} />)}
        </div>
      )}
    </div>
  );
}

function PersonalRecordCard({ field, entries }) {
  const validEntries = validRecordEntries(entries, field);
  if (validEntries.length === 0) return null;
  const fmt = (v) => round(v, field.decimals) + (field.suffix || "");
  const best = pickBest(validEntries, field);
  const worst = pickWorst(validEntries, field);
  const showWorst = worst !== best;

  return (
    <div className="vt-panel vt-cut-sm" style={{ padding: 14 }}>
      <div className="vt-label" style={{ marginBottom: 10 }}>{field.label}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 12, color: "var(--green)" }}>Meilleur</span>
        <span className="vt-mono" style={{ color: "var(--green)", fontWeight: 700 }}>{fmt(best[field.key])}</span>
      </div>
      <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: showWorst ? 8 : 0 }}>
        {best.tournamentName} · {best.matchLabel}{best.opponentName ? ` vs ${best.opponentName}` : ""}
      </div>
      {showWorst && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: 12, color: "var(--red)" }}>Plus faible</span>
            <span className="vt-mono" style={{ color: "var(--red)", fontWeight: 700 }}>{fmt(worst[field.key])}</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
            {worst.tournamentName} · {worst.matchLabel}{worst.opponentName ? ` vs ${worst.opponentName}` : ""}
          </div>
        </>
      )}
    </div>
  );
}

function PlayerRecordsSection({ player, tournaments, players }) {
  const { BO3, BO5 } = useMemo(() => {
    const all = collectMatchRecords(tournaments, players);
    return {
      BO3: all.BO3.filter((e) => e.playerId === player.id),
      BO5: all.BO5.filter((e) => e.playerId === player.id),
    };
  }, [tournaments, players, player.id]);

  return (
    <div>
      <RecordsSection title="BO3" entries={BO3} Card={PersonalRecordCard} emptyText="Aucun match BO3 enregistré pour ce joueur." />
      <RecordsSection title="BO5" entries={BO5} Card={PersonalRecordCard} emptyText="Aucun match BO5 enregistré pour ce joueur." />
    </div>
  );
}

// green/red for a compared player's cell relative to the base player, for a given stat column
function compareColor(baseVal, otherVal, field) {
  const norm = (v) => {
    let n = num(v);
    if (field.suffix === "%" && n !== 0 && Math.abs(n) <= 1) n *= 100;
    return round(n, field.decimals);
  };
  const b = norm(baseVal), o = norm(otherVal);
  if (o === b) return null;
  const better = RANK_ASCENDING.has(field.key) ? o < b : o > b;
  return better ? "var(--green)" : "var(--red)";
}

function ComparePlayersModal({ basePlayer, players, onClose }) {
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState("");

  const toggle = (id) => setSelected((ids) => ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  const others = players.filter((p) => p.id !== basePlayer.id && p.name.toLowerCase().includes(search.toLowerCase()));
  const compared = [basePlayer, ...selected.map((id) => players.find((p) => p.id === id)).filter(Boolean)];

  return (
    <ModalShell title={`Comparer — ${basePlayer.name}`} onClose={onClose} wide>
      <input className="vt-input" style={{ width: "100%", marginBottom: 8 }} placeholder="Rechercher un joueur à comparer…" value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="vt-panel vt-cut-sm vt-scroll" style={{ maxHeight: 160, overflowY: "auto", marginBottom: 16 }}>
        {others.length === 0 && <div style={{ padding: 14, color: "var(--text-dim)", fontSize: 13 }}>Aucun autre joueur.</div>}
        {others.map((p) => (
          <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderBottom: "1px solid var(--line)", cursor: "pointer" }}>
            <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} />
            <span className="vt-display" style={{ fontSize: 14 }}>{p.name}</span>
            {currentTeam(p) && <span style={{ fontSize: 12, color: "var(--text-dim)" }}>({currentTeam(p)})</span>}
          </label>
        ))}
      </div>

      {selected.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--text-dim)" }}>Sélectionne au moins un joueur pour lancer la comparaison.</div>
      ) : (
        <div className="vt-panel vt-cut-sm vt-scroll" style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", minWidth: 160 + compared.length * 110 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--line)" }}>
                <th className="vt-th" style={{ padding: "8px 10px", textAlign: "left" }}>Stat</th>
                {compared.map((p) => (
                  <th key={p.id} className="vt-th" style={{ padding: "8px 10px", textAlign: "right" }}>{p.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {STAT_FIELDS.map((f) => (
                <tr key={f.key} style={{ borderBottom: "1px solid var(--line)" }}>
                  <td style={{ padding: "7px 10px", fontSize: 13, color: "var(--text-dim)", whiteSpace: "nowrap" }}>{f.label}</td>
                  {compared.map((p, i) => {
                    const color = i === 0 ? "var(--text)" : (compareColor(basePlayer.stats[f.key], p.stats[f.key], f) || "var(--text)");
                    return (
                      <td key={p.id} className="vt-mono" style={{ padding: "7px 10px", textAlign: "right", color }}>
                        {fmtStat(p.stats[f.key], f)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
        <button className="vt-btn vt-cut-sm" onClick={onClose}>Fermer</button>
      </div>
    </ModalShell>
  );
}

function RankedCountList({ title, rows, countKey, unit }) {
  return (
    <div className="vt-panel vt-cut-sm" style={{ padding: 14 }}>
      <div className="vt-label" style={{ marginBottom: 10 }}>{title}</div>
      {rows.length === 0 ? (
        <div style={{ color: "var(--text-dim)", fontSize: 13 }}>Aucune donnée pour l'instant.</div>
      ) : rows.map((p, i) => (
        <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: i < rows.length - 1 ? "1px solid var(--line)" : "none" }}>
          <span className="vt-display" style={{ fontSize: 13 }}>{i + 1}. {p.name}</span>
          <span className="vt-mono" style={{ fontSize: 13, color: "var(--gold)" }}>{p[countKey]} {unit}</span>
        </div>
      ))}
    </div>
  );
}

function RecordsView({ tournaments, players }) {
  const { BO3, BO5 } = useMemo(() => collectMatchRecords(tournaments, players), [tournaments, players]);
  const durations = useMemo(() => collectMatchDurationRecords(tournaments), [tournaments]);
  const mvpMjCounts = useMemo(() => computeMvpMjCounts(tournaments), [tournaments]);

  const topMvp = players.filter((p) => (mvpMjCounts[p.id]?.mvp || 0) > 0)
    .sort((a, b) => (mvpMjCounts[b.id]?.mvp || 0) - (mvpMjCounts[a.id]?.mvp || 0)).slice(0, 10)
    .map((p) => ({ id: p.id, name: p.name, mvp: mvpMjCounts[p.id]?.mvp || 0 }));
  const topMj = players.filter((p) => (mvpMjCounts[p.id]?.mj || 0) > 0)
    .sort((a, b) => (mvpMjCounts[b.id]?.mj || 0) - (mvpMjCounts[a.id]?.mj || 0)).slice(0, 10)
    .map((p) => ({ id: p.id, name: p.name, mj: mvpMjCounts[p.id]?.mj || 0 }));

  return (
    <div>
      <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 20 }}>
        Meilleure et plus faible performance d'un joueur sur un seul match, tous tournois confondus.
        Le format (BO3/BO5) est déterminé par le nombre de maps gagnées par l'équipe qui l'emporte.
      </div>
      <RecordsSection title="BO3" entries={BO3} />
      <RecordsSection title="BO5" entries={BO5} />

      <div className="vt-label" style={{ marginBottom: 10 }}>Durée des matchs</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 10, marginBottom: 28 }}>
        <MatchDurationCard title="BO3" entries={durations.BO3} />
        <MatchDurationCard title="BO5" entries={durations.BO5} />
      </div>

      <div className="vt-label" style={{ marginBottom: 4 }}>MVP & MJ</div>
      <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 10 }}>
        Sur chaque match, le meilleur rating toutes équipes confondues est le MVP ; le meilleur
        rating de l'équipe adverse au MVP est nommé MJ. Comptés sur tous les matchs enregistrés,
        appliqués au classement général ou non.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 10 }}>
        <RankedCountList title="Plus de MVP" rows={topMvp} countKey="mvp" unit="MVP" />
        <RankedCountList title="Plus de MJ" rows={topMj} countKey="mj" unit="MJ" />
      </div>
    </div>
  );
}

function TeamsLeaderboard({ tournaments, teamLogos, hiddenTeams, onToggleHidden, onOpenTeam }) {
  const ranking = useMemo(() => computeTeamElo(tournaments), [tournaments]);
  const hiddenSet = new Set(hiddenTeams);
  const visible = ranking.filter((t) => !hiddenSet.has(t.name.trim().toLowerCase()));
  const hidden = ranking.filter((t) => hiddenSet.has(t.name.trim().toLowerCase()));

  if (ranking.length === 0) {
    return (
      <div className="vt-panel vt-cut" style={{ padding: 48, textAlign: "center", color: "var(--text-dim)" }}>
        <Shield size={28} style={{ marginBottom: 10, opacity: 0.6 }} />
        <div className="vt-display" style={{ fontSize: 20, color: "var(--text)", marginBottom: 6 }}>Aucune équipe classée pour l'instant</div>
        <div style={{ fontSize: 14 }}>Ajoute des matchs dans tes tournois pour faire vivre ce classement.</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 16 }}>
        Score Elo (0-2000, départ à 1000) recalculé sur tous les matchs enregistrés, appliqués au
        classement général ou non, dans l'ordre chronologique des tournois. Une victoire contre un
        favori rapporte gros, une victoire attendue rapporte peu ; gagner un tournoi ajoute un bonus
        selon son prestige (Champions {'>'} Masters {'>'} Split).
      </div>
      <div className="vt-panel vt-cut" style={{ padding: 4, marginBottom: hidden.length > 0 ? 16 : 0 }}>
        {visible.map((team, i) => {
          const rank = i + 1;
          const medal = rank === 1 ? "vt-medal-1" : rank === 2 ? "vt-medal-2" : rank === 3 ? "vt-medal-3" : "";
          const logo = getLogo(teamLogos, team.name);
          const pct = Math.round((team.elo / ELO_MAX) * 100);
          const last = team.history[team.history.length - 1];
          return (
            <div
              key={team.name} className="vt-row"
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: i < visible.length - 1 ? "1px solid var(--line)" : "none", cursor: "pointer" }}
              onClick={() => onOpenTeam(team.name)}
            >
              <div className={"vt-display vt-mono " + medal} style={{ fontSize: 18, fontWeight: 700, width: 26, flexShrink: 0 }}>{rank}</div>
              {logo && <img src={logo} className="vt-logo" alt="" />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="vt-display" style={{ fontWeight: 600, fontSize: 15 }}>{team.name}</div>
                <div style={{ height: 4, background: "var(--panel-raised)", marginTop: 5, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: "var(--red)" }} />
                </div>
              </div>
              {last && (
                <span className="vt-mono" style={{ fontSize: 12, fontWeight: 700, color: last.delta >= 0 ? "var(--green)" : "var(--red)", flexShrink: 0, minWidth: 42, textAlign: "right" }}>
                  {last.delta >= 0 ? "+" : ""}{Math.round(last.delta)}
                </span>
              )}
              <div className="vt-mono vt-display" style={{ fontWeight: 700, fontSize: 18, flexShrink: 0 }}>{Math.round(team.elo)}</div>
              <button
                className="vt-btn vt-cut-sm" style={{ padding: "5px 8px", flexShrink: 0 }}
                title="Retirer du classement (org dissoute)"
                onClick={(e) => { e.stopPropagation(); onToggleHidden(team.name); }}
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>

      {hidden.length > 0 && (
        <>
          <div className="vt-label" style={{ marginBottom: 8 }}>Équipes retirées ({hidden.length})</div>
          <div className="vt-panel vt-cut" style={{ padding: 4 }}>
            {hidden.map((team, i) => (
              <div key={team.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", opacity: 0.6, borderBottom: i < hidden.length - 1 ? "1px solid var(--line)" : "none" }}>
                <div style={{ flex: 1 }} className="vt-display">{team.name}</div>
                <div className="vt-mono">{Math.round(team.elo)}</div>
                <button className="vt-btn vt-cut-sm" style={{ padding: "5px 9px", fontSize: 11 }} onClick={() => onToggleHidden(team.name)}>
                  Réintégrer
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TeamProfile({ nameKey, tournaments, players, teamLogos, hiddenTeams, onToggleHidden, onBack, onOpenPlayer }) {
  const data = useMemo(() => getTeamProfile(nameKey, tournaments, players), [nameKey, tournaments, players]);

  if (!data) {
    return (
      <div>
        <button className="vt-btn vt-cut-sm" style={{ marginBottom: 16 }} onClick={onBack}><ChevronLeft size={15} /> Équipes</button>
        <div className="vt-panel vt-cut-sm" style={{ padding: 20, color: "var(--text-dim)" }}>Équipe introuvable.</div>
      </div>
    );
  }

  const { entry, rank, wins, losses, bestGain, worstLoss, trophies, roster, recent } = data;
  const logo = getLogo(teamLogos, entry.name);
  const isHidden = hiddenTeams.includes(entry.name.trim().toLowerCase());
  const totalGames = wins + losses;
  const winRate = totalGames ? Math.round((wins / totalGames) * 100) : 0;
  const pct = Math.round((entry.elo / ELO_MAX) * 100);

  return (
    <div>
      <button className="vt-btn vt-cut-sm" style={{ marginBottom: 16 }} onClick={onBack}><ChevronLeft size={15} /> Équipes</button>

      <div className="vt-panel vt-cut" style={{ padding: "20px 22px", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {logo && <img src={logo} className="vt-logo-lg" alt="" />}
            <div>
              <h1 className="vt-display" style={{ fontSize: 30, fontWeight: 700, textTransform: "uppercase" }}>{entry.name}</h1>
              <div style={{ fontSize: 13, color: "var(--text-dim)" }}>#{rank} au classement Elo</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ textAlign: "right" }}>
              <div className="vt-mono vt-display" style={{ fontSize: 34, fontWeight: 700 }}>{Math.round(entry.elo)}</div>
              <div style={{ height: 4, width: 120, background: "var(--panel-raised)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: "var(--red)" }} />
              </div>
            </div>
            <button className="vt-btn vt-cut-sm" onClick={() => onToggleHidden(entry.name)}>
              {isHidden ? "Réintégrer" : "Retirer"}
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 22 }}>
        <StatCard label="Matchs" value={totalGames} />
        <StatCard label="Victoires" value={wins} accent="var(--green)" />
        <StatCard label="Défaites" value={losses} accent="var(--red)" />
        <StatCard label="Taux de victoire" value={winRate + "%"} />
      </div>

      <div className="vt-label" style={{ marginBottom: 8 }}>Records</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 10, marginBottom: 22 }}>
        <div className="vt-panel vt-cut-sm" style={{ padding: 14 }}>
          <div className="vt-label" style={{ marginBottom: 8 }}>Plus gros gain Elo</div>
          {bestGain ? (
            <>
              <div className="vt-mono" style={{ color: "var(--green)", fontWeight: 700, fontSize: 20 }}>+{Math.round(bestGain.delta)}</div>
              <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>vs {bestGain.opponentName} — {bestGain.tournamentName} · {bestGain.matchLabel}</div>
            </>
          ) : <div style={{ color: "var(--text-dim)", fontSize: 13 }}>Aucun match enregistré.</div>}
        </div>
        <div className="vt-panel vt-cut-sm" style={{ padding: 14 }}>
          <div className="vt-label" style={{ marginBottom: 8 }}>Plus grosse perte Elo</div>
          {worstLoss ? (
            <>
              <div className="vt-mono" style={{ color: "var(--red)", fontWeight: 700, fontSize: 20 }}>{Math.round(worstLoss.delta)}</div>
              <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>vs {worstLoss.opponentName} — {worstLoss.tournamentName} · {worstLoss.matchLabel}</div>
            </>
          ) : <div style={{ color: "var(--text-dim)", fontSize: 13 }}>Aucun match enregistré.</div>}
        </div>
      </div>

      <div className="vt-label" style={{ marginBottom: 8 }}>Palmarès</div>
      {trophies.length === 0 ? (
        <div className="vt-panel vt-cut-sm" style={{ padding: 16, color: "var(--text-dim)", fontSize: 14, marginBottom: 22 }}>Aucun tournoi remporté pour l'instant.</div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 22 }}>
          {trophies.map((t, i) => {
            const c = TROPHY_COLOR[t.tournamentType] || TROPHY_COLOR.Autre;
            return (
              <div key={i} className="vt-trophy-pill vt-cut-sm" style={{ borderColor: c }}>
                <Trophy size={14} color={c} />
                <span className="vt-display" style={{ fontSize: 13, fontWeight: 600, color: c }}>{t.tournamentType} — {t.tournamentName}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="vt-label" style={{ marginBottom: 8 }}>Historique récent</div>
      {recent.length === 0 ? (
        <div className="vt-panel vt-cut-sm" style={{ padding: 16, color: "var(--text-dim)", fontSize: 14, marginBottom: 22 }}>Aucun événement enregistré.</div>
      ) : (
        <div className="vt-panel vt-cut" style={{ padding: 4, marginBottom: 22 }}>
          {recent.map((h, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: i < recent.length - 1 ? "1px solid var(--line)" : "none" }}>
              <div>
                {h.type === "trophy" ? (
                  <span className="vt-display" style={{ fontSize: 13, color: TROPHY_COLOR[h.tournamentType] || TROPHY_COLOR.Autre }}>
                    <Trophy size={12} style={{ display: "inline", marginRight: 5 }} />{h.tournamentType} — {h.tournamentName}
                  </span>
                ) : (
                  <span style={{ fontSize: 13 }}>
                    <span style={{ color: h.result === "W" ? "var(--green)" : "var(--red)", fontWeight: 700, marginRight: 6 }}>{h.result}</span>
                    vs {h.opponentName} <span style={{ color: "var(--text-dim)" }}>— {h.tournamentName} · {h.matchLabel}</span>
                  </span>
                )}
              </div>
              <span className="vt-mono" style={{ fontSize: 12, fontWeight: 700, color: h.delta >= 0 ? "var(--green)" : "var(--red)" }}>
                {h.delta >= 0 ? "+" : ""}{Math.round(h.delta)}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="vt-label" style={{ marginBottom: 8 }}>Joueurs passés par cette équipe</div>
      {roster.length === 0 ? (
        <div className="vt-panel vt-cut-sm" style={{ padding: 16, color: "var(--text-dim)", fontSize: 14 }}>Aucun joueur enregistré.</div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {roster.map((p) => (
            <button key={p.id} className="vt-btn vt-cut-sm" onClick={() => onOpenPlayer(p.id)}>{p.name}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- app ----------
export default function App() {
  const [players, setPlayers] = useState([]);
  const [teamLogos, setTeamLogos] = useState({});
  const [tournaments, setTournaments] = useState([]);
  const [hiddenTeams, setHiddenTeams] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [view, setView] = useState({ name: "leaderboard" });
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(null); // 'addPlayer' | 'editProfile' | 'correctStats' | 'addMatch' | 'import' | 'createTournament' | 'addTeam' | 'editTeam' | 'addTournamentMatch' | 'finishTournament' | null
  const [editingTeam, setEditingTeam] = useState(null);
  const [editingMatch, setEditingMatch] = useState(null);
  const [sortKey, setSortKey] = useState("rating");
  const [sortDir, setSortDir] = useState("desc");
  const scrollPositions = useRef({ leaderboard: 0, tournaments: 0 });

  // All writes are optimistic: the UI updates immediately, then Supabase is updated in the
  // background. If a write fails, the red banner tells you that a reload may lose that change.
  const persist = (promise, context = "sauvegarde") => {
    Promise.resolve(promise)
      .then(() => setSaveError(""))
      .catch((error) => {
        console.error(`[ValTrack] Échec ${context}:`, error);
        setSaveError(`Échec de ${context} dans Supabase : ${error?.message || String(error)}`);
      });
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (!isSupabaseConfigured) {
          throw new Error("Supabase n'est pas configuré. Ajoute VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env.");
        }

        let data = await loadValtrackData();

        // Migration automatique depuis l'ancien window.storage, uniquement si la base Supabase
        // est encore vide et que l'ancien stockage existe dans l'environnement actuel.
        const dbIsEmpty = data.players.length === 0 && data.tournaments.length === 0;
        if (dbIsEmpty) {
          const legacy = await readLegacyWindowStorage({
            players: STORAGE_KEY,
            tournaments: TOURNAMENTS_KEY,
            teamLogos: "vt_team_logos_v1",
            hiddenTeams: HIDDEN_TEAMS_KEY,
          });

          if (legacy) {
            const legacyData = {
              players: (legacy.players || []).map(migratePlayer),
              tournaments: (legacy.tournaments || []).map(migrateTournament),
              teamLogos: legacy.teamLogos || {},
              hiddenTeams: legacy.hiddenTeams || [],
            };
            await migrateLegacySnapshotDb(legacyData);
            data = legacyData;
          }
        }

        if (cancelled) return;
        setPlayers((data.players || []).map(migratePlayer));
        setTournaments((data.tournaments || []).map(migrateTournament));
        setTeamLogos(data.teamLogos || {});
        setHiddenTeams(data.hiddenTeams || []);
        setSaveError("");
      } catch (error) {
        console.error("[ValTrack] Chargement Supabase impossible:", error);
        if (!cancelled) setSaveError(`Chargement impossible : ${error?.message || String(error)}`);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // list views ("leaderboard", "tournaments") keep their own remembered scroll position;
  // detail views ("player", "tournament") always open at the top
  const LIST_VIEWS = new Set(["leaderboard", "tournaments", "records", "teams"]);
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (LIST_VIEWS.has(view.name)) window.scrollTo(0, scrollPositions.current[view.name] || 0);
      else window.scrollTo(0, 0);
    });
    return () => cancelAnimationFrame(id);
  }, [view]);

  const openPlayer = (id) => {
    scrollPositions.current.leaderboard = window.scrollY;
    setView({ name: "player", id });
  };
  const openTournament = (id) => {
    scrollPositions.current.tournaments = window.scrollY;
    setView({ name: "tournament", id });
  };
  const backToLeaderboard = () => setView({ name: "leaderboard" });
  const backToTournaments = () => setView({ name: "tournaments" });

  const toggleSort = (key) => {
    if (key === "name") {
      if (sortKey === "name" && sortDir === "asc") { setSortDir("desc"); return; }
      if (sortKey === "name" && sortDir === "desc") { setSortKey("nationality"); setSortDir("asc"); return; }
      setSortKey("name"); setSortDir("asc");
      return;
    }
    if (key === sortKey) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const setLogo = (teamName, dataUrl) => {
    const key = teamName.trim().toLowerCase();
    setTeamLogos((prev) => ({ ...prev, [key]: dataUrl }));
    persist(setTeamLogoDb(key, dataUrl), "la sauvegarde du logo");
  };

  const toggleHiddenTeam = (teamName) => {
    const key = teamName.trim().toLowerCase();
    const willBeHidden = !hiddenTeams.includes(key);
    setHiddenTeams((prev) => willBeHidden ? [...prev, key] : prev.filter((x) => x !== key));
    persist(setHiddenTeamDb(key, willBeHidden), "la visibilité de l'équipe");
  };

  const upsertPlayer = (p) => {
    setPlayers((prev) => {
      const idx = prev.findIndex((x) => x.id === p.id);
      if (idx === -1) return [...prev, p];
      const copy = [...prev];
      copy[idx] = p;
      return copy;
    });
    persist(upsertPlayerDb(p), `la sauvegarde de ${p.name}`);
    setModal(null);
  };

  // silent update (no modal to close) — used for trophies, added inline on the profile page
  const updatePlayer = (p) => {
    setPlayers((prev) => prev.map((x) => (x.id === p.id ? p : x)));
    persist(upsertPlayerDb(p), `la sauvegarde de ${p.name}`);
  };

  // Must stay synchronous because TeamModal immediately needs the returned player's id.
  const quickCreatePlayer = (name) => {
    const p = { id: uid(), name, nationality: "", teamHistory: [], trophies: [], stats: emptyStats() };
    setPlayers((prev) => [...prev, p]);
    persist(upsertPlayerDb(p), `la création de ${name}`);
    return p;
  };

  const deletePlayer = (playerId) => {
    setPlayers((prev) => prev.filter((p) => p.id !== playerId));
    persist(deletePlayerDb(playerId), "la suppression du joueur");
    setView({ name: "leaderboard" });
  };

  const importRows = (rows) => {
    const byName = new Map(players.map((p) => [
      p.name.toLowerCase(),
      { ...p, stats: { ...p.stats }, teamHistory: [...(p.teamHistory || [])] },
    ]));

    rows.forEach((row) => {
      const key = row.name.toLowerCase();
      let player = byName.get(key);
      if (!player) player = { id: uid(), name: row.name, nationality: "", teamHistory: [], trophies: [], stats: emptyStats() };

      if (row.team && currentTeam(player) !== row.team) {
        player.teamHistory = [...player.teamHistory, { id: uid(), team: row.team, since: new Date().toISOString().slice(0, 10) }];
      }
      if (row.nationality) {
        const val = String(row.nationality).trim();
        const byCode = COUNTRIES.find((c) => c[0].toLowerCase() === val.toLowerCase());
        const byName2 = COUNTRIES.find((c) => normalizeHeader(c[1]) === normalizeHeader(val));
        player.nationality = byCode ? byCode[0] : byName2 ? byName2[0] : (val.length === 2 ? val.toUpperCase() : val);
      }
      STAT_FIELDS.forEach((f) => {
        if (row[f.key] !== undefined && row[f.key] !== "") player.stats[f.key] = row[f.key];
      });
      player.stats = computeDerived(player.stats);
      byName.set(key, player);
    });

    const nextPlayers = Array.from(byName.values());
    setPlayers(nextPlayers);
    persist(upsertPlayersDb(nextPlayers), "l'import des joueurs");
    setModal(null);
  };

  // ---- tournaments ----
  const upsertTournament = (t) => {
    setTournaments((prev) => {
      const idx = prev.findIndex((x) => x.id === t.id);
      if (idx === -1) return [...prev, t];
      const copy = [...prev];
      copy[idx] = t;
      return copy;
    });
    persist(upsertTournamentDb(t), `la sauvegarde du tournoi ${t.name}`);
  };

  const saveTeam = (tournamentId, team) => {
    setTournaments((prev) => prev.map((t) => {
      if (t.id !== tournamentId) return t;
      const idx = t.teams.findIndex((x) => x.id === team.id);
      const teams = idx === -1 ? [...t.teams, team] : t.teams.map((x) => (x.id === team.id ? team : x));
      return { ...t, teams };
    }));
    persist(upsertTeamDb(tournamentId, team), `la sauvegarde de l'équipe ${team.name}`);
    setModal(null);
    setEditingTeam(null);
  };

  const saveTournamentMatch = (tournamentId, match, wasApplied) => {
    const tournamentBefore = tournaments.find((t) => t.id === tournamentId);
    const previousMatch = tournamentBefore?.matches.find((m) => m.id === match.id) || null;

    setTournaments((prev) => prev.map((t) => {
      if (t.id !== tournamentId) return t;
      const exists = t.matches.some((m) => m.id === match.id);
      const matches = exists ? t.matches.map((m) => (m.id === match.id ? match : m)) : [...t.matches, match];
      return { ...t, matches };
    }));
    persist(upsertMatchDb(tournamentId, match), `la sauvegarde du match ${match.label}`);

    // Nouveau match appliqué : on ajoute ses stats une seule fois.
    // Match déjà appliqué puis modifié : on retire l'ancienne version, puis on ajoute la nouvelle.
    if (match.appliedToStats && !wasApplied) {
      const nextPlayers = players.map((p) => {
        const rowStats = match.stats[p.id];
        if (!rowStats) return p;
        const hasValue = Object.values(rowStats).some((v) => v !== "" && v !== undefined);
        if (!hasValue) return p;
        return { ...p, prevStats: p.stats, stats: applyMatchToStats(p.stats, rowStats) };
      });
      setPlayers(nextPlayers);
      persist(upsertPlayersDb(nextPlayers), "la mise à jour des statistiques joueurs");
    } else if (wasApplied && previousMatch) {
      const nextPlayers = players.map((p) => {
        const oldRow = previousMatch.stats?.[p.id];
        const newRow = match.stats?.[p.id];
        const oldHasValue = oldRow && Object.values(oldRow).some((v) => v !== "" && v !== undefined);
        const newHasValue = newRow && Object.values(newRow).some((v) => v !== "" && v !== undefined);
        if (!oldHasValue && !newHasValue) return p;

        let corrected = p.stats;
        if (oldHasValue) corrected = removeMatchFromStats(corrected, oldRow);
        if (newHasValue && match.appliedToStats) corrected = applyMatchToStats(corrected, newRow);
        return { ...p, prevStats: p.stats, stats: corrected };
      });
      setPlayers(nextPlayers);
      persist(upsertPlayersDb(nextPlayers), "la correction des statistiques joueurs après modification du match");
    }

    setModal(null);
    setEditingMatch(null);
  };

  const applyTournamentMatchNow = (tournamentId, matchId) => {
    const tournament = tournaments.find((t) => t.id === tournamentId);
    const match = tournament?.matches.find((m) => m.id === matchId);
    if (!match || match.appliedToStats) return;

    const nextPlayers = players.map((p) => {
      const rowStats = match.stats[p.id];
      if (!rowStats) return p;
      const hasValue = Object.values(rowStats).some((v) => v !== "" && v !== undefined);
      if (!hasValue) return p;
      return { ...p, prevStats: p.stats, stats: applyMatchToStats(p.stats, rowStats) };
    });
    setPlayers(nextPlayers);
    persist(upsertPlayersDb(nextPlayers), "la mise à jour des statistiques joueurs");

    setTournaments((prev) => prev.map((t) => (
      t.id === tournamentId ? { ...t, matches: t.matches.map((m) => (m.id === matchId ? { ...m, appliedToStats: true } : m)) } : t
    )));
    persist(setMatchAppliedDb(matchId, true), "l'application du match au classement");
  };

  const finishTournament = (tournamentId, winnerTeamId) => {
    const tournament = tournaments.find((t) => t.id === tournamentId);
    if (!tournament) return;
    const winnerTeam = tournament.teams.find((t) => t.id === winnerTeamId);
    const updatedTournament = { ...tournament, winnerTeamId, finished: true };

    setTournaments((prev) => prev.map((t) => (t.id === tournamentId ? updatedTournament : t)));
    persist(upsertTournamentDb(updatedTournament), `la clôture du tournoi ${tournament.name}`);

    if (winnerTeam) {
      const trophy = { id: uid(), type: tournament.type, detail: tournament.name, tournamentId };
      const nextPlayers = players.map((p) => (
        winnerTeam.playerIds.includes(p.id) ? { ...p, trophies: [...(p.trophies || []), trophy] } : p
      ));
      setPlayers(nextPlayers);
      persist(upsertPlayersDb(nextPlayers), "l'attribution des trophées");
    }
    setModal(null);
  };

  const updateTournamentInfo = (tournamentId, updates) => {
    const tournament = tournaments.find((t) => t.id === tournamentId);
    if (!tournament) return;
    const oldWinnerId = tournament.winnerTeamId;
    const newWinnerId = updates.winnerTeamId !== undefined ? updates.winnerTeamId : oldWinnerId;
    const winnerChanged = tournament.finished && newWinnerId !== oldWinnerId;
    const typeOrNameChanged = updates.type !== tournament.type || updates.name !== tournament.name;
    const updatedTournament = { ...tournament, ...updates };

    setTournaments((prev) => prev.map((t) => (t.id === tournamentId ? updatedTournament : t)));
    persist(upsertTournamentDb(updatedTournament), `la modification du tournoi ${tournament.name}`);

    if (tournament.finished) {
      let nextPlayers = players;
      if (winnerChanged) {
        const oldWinnerTeam = tournament.teams.find((x) => x.id === oldWinnerId);
        const newWinnerTeam = tournament.teams.find((x) => x.id === newWinnerId);
        nextPlayers = players.map((p) => {
          let trophies = p.trophies || [];
          if (oldWinnerTeam?.playerIds.includes(p.id)) trophies = trophies.filter((tr) => tr.tournamentId !== tournamentId);
          if (newWinnerTeam?.playerIds.includes(p.id)) trophies = [...trophies, { id: uid(), type: updates.type || tournament.type, detail: updates.name || tournament.name, tournamentId }];
          return { ...p, trophies };
        });
      } else if (typeOrNameChanged) {
        nextPlayers = players.map((p) => ({
          ...p,
          trophies: (p.trophies || []).map((tr) => (tr.tournamentId === tournamentId ? { ...tr, type: updates.type || tournament.type, detail: updates.name || tournament.name } : tr)),
        }));
      }

      if (nextPlayers !== players) {
        setPlayers(nextPlayers);
        persist(upsertPlayersDb(nextPlayers), "la mise à jour des trophées");
      }
    }
    setModal(null);
  };

  const toggleTeamEliminated = (tournamentId, teamId) => {
    const tournament = tournaments.find((t) => t.id === tournamentId);
    const team = tournament?.teams.find((x) => x.id === teamId);
    if (!team) return;
    const updatedTeam = { ...team, eliminated: !team.eliminated };

    setTournaments((prev) => prev.map((t) => (
      t.id !== tournamentId ? t : { ...t, teams: t.teams.map((x) => (x.id === teamId ? updatedTeam : x)) }
    )));
    persist(upsertTeamDb(tournamentId, updatedTeam), `la mise à jour de l'équipe ${team.name}`);
  };

  // MVP/MJ are fully derived from every recorded match (applied or not) — never stored,
  // so there's nothing to keep in sync
  const mvpMjCounts = useMemo(() => computeMvpMjCounts(tournaments), [tournaments]);
  const displayPlayers = useMemo(() => players.map((p) => ({
    ...p,
    stats: { ...p.stats, mvp: mvpMjCounts[p.id]?.mvp || 0, mj: mvpMjCounts[p.id]?.mj || 0 },
  })), [players, mvpMjCounts]);

  const activePlayer = view.name === "player" ? displayPlayers.find((p) => p.id === view.id) : null;
  // the raw (non-overlaid) player — used for anything that can save, so the live MVP/MJ
  // snapshot never gets baked into real storage
  const rawActivePlayer = view.name === "player" ? players.find((p) => p.id === view.id) : null;
  const activeTournament = view.name === "tournament" ? tournaments.find((t) => t.id === view.id) : null;

  return (
    <div className="vt-root" style={{ paddingBottom: 60 }}>
      <Styles />
      <div style={{ maxWidth: 1450, margin: "0 auto", padding: "28px 20px" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="vt-cut-sm" style={{ background: "var(--red)", width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Swords size={18} color="#180508" />
            </div>
            <div>
              <div className="vt-display" style={{ fontSize: 24, fontWeight: 700, letterSpacing: "0.04em", lineHeight: 1 }}>VALTRACK</div>
              <div className="vt-label" style={{ color: "var(--text-dim)" }}>Registre de performances</div>
            </div>
          </div>
          {!loaded && <Loader2 className="vt-mono" size={18} style={{ animation: "spin 1s linear infinite", color: "var(--text-dim)" }} />}
        </header>

        {saveError && (
          <div className="vt-cut-sm" style={{ background: "var(--red-dim)", border: "1px solid var(--red)", color: "var(--red)", padding: "10px 14px", fontSize: 13, marginBottom: 18 }}>
            ⚠ {saveError}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginBottom: 22 }}>
          <button
            className="vt-btn vt-cut-sm"
            style={{ background: (view.name === "leaderboard" || view.name === "player") ? "var(--panel-raised)" : "var(--panel)", borderColor: (view.name === "leaderboard" || view.name === "player") ? "var(--steel)" : "var(--line)" }}
            onClick={backToLeaderboard}
          >
            <Award size={14} /> Classement
          </button>
          <button
            className="vt-btn vt-cut-sm"
            style={{ background: (view.name === "tournaments" || view.name === "tournament") ? "var(--panel-raised)" : "var(--panel)", borderColor: (view.name === "tournaments" || view.name === "tournament") ? "var(--steel)" : "var(--line)" }}
            onClick={backToTournaments}
          >
            <Trophy size={14} /> Tournois
          </button>
          <button
            className="vt-btn vt-cut-sm"
            style={{ background: view.name === "records" ? "var(--panel-raised)" : "var(--panel)", borderColor: view.name === "records" ? "var(--steel)" : "var(--line)" }}
            onClick={() => setView({ name: "records" })}
          >
            <Flame size={14} /> Records
          </button>
          <button
            className="vt-btn vt-cut-sm"
            style={{ background: view.name === "teams" ? "var(--panel-raised)" : "var(--panel)", borderColor: view.name === "teams" ? "var(--steel)" : "var(--line)" }}
            onClick={() => setView({ name: "teams" })}
          >
            <Shield size={14} /> Équipes
          </button>
        </div>

        {view.name === "records" && <RecordsView tournaments={tournaments} players={players} />}
        {view.name === "teams" && <TeamsLeaderboard tournaments={tournaments} teamLogos={teamLogos} hiddenTeams={hiddenTeams} onToggleHidden={toggleHiddenTeam} />}

        {view.name === "leaderboard" && (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 18, alignItems: "center" }}>
              <div className="vt-panel vt-cut-sm" style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", flex: "1 1 220px" }}>
                <Search size={15} color="#8792A0" />
                <input
                  placeholder="Rechercher un joueur…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  style={{ background: "none", border: "none", outline: "none", color: "var(--text)", fontSize: 14, width: "100%" }}
                />
              </div>
              <button className="vt-btn vt-cut-sm" onClick={() => setModal("import")}><Upload size={14} /> Importer</button>
              <button className="vt-btn vt-btn-primary vt-cut-sm" onClick={() => setModal("addPlayer")}><Plus size={14} /> Joueur</button>
            </div>
            <Leaderboard
              players={displayPlayers}
              query={query}
              onOpenPlayer={openPlayer}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
              teamLogos={teamLogos}
            />
          </>
        )}

        {activePlayer && (
          <PlayerDetail
            player={activePlayer}
            players={displayPlayers}
            tournaments={tournaments}
            teamLogos={teamLogos}
            onSetLogo={setLogo}
            onBack={backToLeaderboard}
            onAddMatch={() => setModal("addMatch")}
            onEditProfile={() => setModal("editProfile")}
            onCorrectStats={() => setModal("correctStats")}
            onDeletePlayer={() => deletePlayer(activePlayer.id)}
            onUpdate={updatePlayer}
          />
        )}

        {view.name === "tournaments" && (
          <>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
              <button className="vt-btn vt-btn-primary vt-cut-sm" onClick={() => setModal("createTournament")}><Plus size={14} /> Nouveau tournoi</button>
            </div>
            <TournamentsList tournaments={tournaments} onOpen={openTournament} teamLogos={teamLogos} />
          </>
        )}

        {activeTournament && (
          <TournamentDetail
            tournament={activeTournament}
            players={players}
            teamLogos={teamLogos}
            onBack={backToTournaments}
            onAddTeam={() => { setEditingTeam(null); setModal("addTeam"); }}
            onEditTeam={(team) => { setEditingTeam(team); setModal("editTeam"); }}
            onAddMatch={() => { setEditingMatch(null); setModal("addTournamentMatch"); }}
            onEditMatch={(m) => { setEditingMatch(m); setModal("addTournamentMatch"); }}
            onApplyMatch={(matchId) => applyTournamentMatchNow(activeTournament.id, matchId)}
            onFinish={() => setModal("finishTournament")}
            onEditInfo={() => setModal("editTournament")}
            onToggleEliminated={(teamId) => toggleTeamEliminated(activeTournament.id, teamId)}
          />
        )}
      </div>

      {modal === "addPlayer" && <PlayerFormModal onClose={() => setModal(null)} onSave={upsertPlayer} />}
      {modal === "editProfile" && activePlayer && <ProfileEditModal player={rawActivePlayer} teamLogos={teamLogos} onSetLogo={setLogo} onClose={() => setModal(null)} onSave={upsertPlayer} />}
      {modal === "correctStats" && activePlayer && <StatsCorrectionModal player={rawActivePlayer} onClose={() => setModal(null)} onSave={upsertPlayer} />}
      {modal === "addMatch" && activePlayer && <AddMatchModal player={rawActivePlayer} onClose={() => setModal(null)} onSave={upsertPlayer} />}
      {modal === "import" && <ImportModal onClose={() => setModal(null)} onImport={importRows} />}

      {modal === "createTournament" && <CreateTournamentModal onClose={() => setModal(null)} onSave={(t) => { upsertTournament(t); setModal(null); setView({ name: "tournament", id: t.id }); }} />}
      {modal === "editTournament" && activeTournament && (
        <EditTournamentModal
          tournament={activeTournament}
          onClose={() => setModal(null)}
          onSave={(updates) => updateTournamentInfo(activeTournament.id, updates)}
        />
      )}
      {(modal === "addTeam" || modal === "editTeam") && activeTournament && (
        <TeamModal
          tournament={activeTournament}
          team={editingTeam}
          players={players}
          onCreatePlayer={quickCreatePlayer}
          onClose={() => { setModal(null); setEditingTeam(null); }}
          onSave={(team) => saveTeam(activeTournament.id, team)}
        />
      )}
      {modal === "addTournamentMatch" && activeTournament && (
        <AddTournamentMatchModal
          tournament={activeTournament}
          players={players}
          existingMatch={editingMatch}
          onClose={() => { setModal(null); setEditingMatch(null); }}
          onSave={(match, wasApplied) => saveTournamentMatch(activeTournament.id, match, wasApplied)}
        />
      )}
      {modal === "finishTournament" && activeTournament && (
        <FinishTournamentModal
          tournament={activeTournament}
          onClose={() => setModal(null)}
          onSave={(winnerTeamId) => finishTournament(activeTournament.id, winnerTeamId)}
        />
      )}
    </div>
  );
}