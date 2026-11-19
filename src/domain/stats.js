// ---------- helpers ----------
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const num = (v) => {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return isNaN(n) ? 0 : n;
};

export const round = (v, d = 0) => {
  const f = Math.pow(10, d);
  return Math.round((v + Number.EPSILON) * f) / f;
};

// a percentage sometimes arrives as a fraction (0.72) from spreadsheet % formatting
export const normPct = (v) => {
  const n = num(v);
  return n !== 0 && Math.abs(n) <= 1 ? n * 100 : n;
};

export function normalizeHeader(h) {
  return String(h || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/%/g, "pct")
    .replace(/[^a-z0-9]/g, "");
}

export const COUNTRIES = [
  ["FR", "France"], ["BE", "Belgique"], ["CH", "Suisse"], ["GB", "Royaume-Uni"],
  ["DE", "Allemagne"], ["ES", "Espagne"], ["IT", "Italie"], ["PT", "Portugal"],
  ["NL", "Pays-Bas"], ["SE", "Suède"], ["DK", "Danemark"], ["NO", "Norvège"],
  ["FI", "Finlande"], ["PL", "Pologne"], ["TR", "Turquie"], ["RU", "Russie"],
  ["KZ", "Kazakhstan"], ["UA", "Ukraine"], ["AT", "Autriche"], ["CZ", "République tchèque"],
  ["SK", "Slovaquie"], ["HU", "Hongrie"], ["RO", "Roumanie"], ["BG", "Bulgarie"],
  ["GR", "Grèce"], ["HR", "Croatie"], ["RS", "Serbie"], ["IS", "Islande"],
  ["IE", "Irlande"], ["US", "États-Unis"], ["CA", "Canada"], ["BR", "Brésil"],
  ["AR", "Argentine"], ["CL", "Chili"], ["MX", "Mexique"], ["KR", "Corée du Sud"],
  ["JP", "Japon"], ["CN", "Chine"], ["TW", "Taïwan"], ["HK", "Hong Kong"],
  ["SG", "Singapour"], ["TH", "Thaïlande"], ["PH", "Philippines"],
  ["ID", "Indonésie"], ["VN", "Vietnam"], ["IN", "Inde"], ["AU", "Australie"],
  ["NZ", "Nouvelle-Zélande"], ["MA", "Maroc"], ["DZ", "Algérie"],
  ["TN", "Tunisie"], ["EG", "Égypte"], ["SA", "Arabie saoudite"],
  ["AE", "Émirats arabes unis"], ["IL", "Israël"],
];

// canonical stat fields, in the exact order requested
export const STAT_FIELDS = [
  { key: "elo", label: "Elo", decimals: 0 }, // calculé, affiché en premier
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

export const HEADLINE_KEYS = ["elo", "rating", "acs", "kd", "kda", "kast", "clutchPct", "mvp", "mj"];

// single-match performance records — no Match/Maps/Round, those aren't personal records
export const RECORD_FIELDS = [
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

export const MULTI_KILL_DETAIL_FIELDS = [
  { key: "doubleKill", label: "Double" },
  { key: "tripleKill", label: "Triple" },
  { key: "quadKill", label: "Quad" },
  { key: "ace", label: "Ace" },
];

export const CLUTCH_DETAIL_FIELDS = [
  { key: "clutch1v1", label: "Clutch 1v1" },
  { key: "clutch1v2", label: "Clutch 1v2" },
  { key: "clutch1v3", label: "Clutch 1v3" },
  { key: "clutch1v4", label: "Clutch 1v4" },
  { key: "clutch1v5", label: "Clutch 1v5" },
];

export const DETAIL_STAT_FIELDS = [...MULTI_KILL_DETAIL_FIELDS, ...CLUTCH_DETAIL_FIELDS];
export const STAT_LABELS = Object.fromEntries([...STAT_FIELDS, ...DETAIL_STAT_FIELDS].map((f) => [f.key, f.label]));

export const MATCH_INPUT_FIELDS = [
  "maps", "round", "kill", "death", "assist", "acs", "rating", "kast", "fk", "fd",
  "doubleKill", "tripleKill", "quadKill", "ace",
  "clutch1v1", "clutch1v2", "clutch1v3", "clutch1v4", "clutch1v5",
  "clutchAttempt",
];
// volume fields aren't ranked as "performance" — everything else is, lower-is-better only for Death
export const RANK_ASCENDING = new Set(["death"]);

export const RANKABLE_KEYS = new Set(STAT_FIELDS.map((f) => f.key).filter((k) => !["match", "maps", "round"].includes(k)));

export const TROPHY_TYPES = ["Split", "Masters", "Champions", "Autre"];
export const TROPHY_RANK = { Split: 1, Masters: 2, Champions: 3, Autre: 0 };
export const TROPHY_COLOR = { Split: "#8792A0", Masters: "#C77B4B", Champions: "#E8B95E", Autre: "#8792A0" };

// these are never typed by hand — always computed from the raw counts
export const DERIVED_KEYS = new Set(["kd", "kda", "kdDiff", "fkDiff", "clutchPct", "mvp", "mj", "elo"]);
export const FORM_INPUT_FIELDS = STAT_FIELDS.filter((f) => !DERIVED_KEYS.has(f.key));

export function hasEnteredDetail(stats, keys) {
  return keys.some((key) => stats?.[key] !== "" && stats?.[key] !== undefined && stats?.[key] !== null);
}

export function multiKillFromDetails(stats) {
  return num(stats.doubleKill) + num(stats.tripleKill) + num(stats.quadKill) + num(stats.ace);
}

export function clutchFromDetails(stats) {
  return num(stats.clutch1v1) + num(stats.clutch1v2) + num(stats.clutch1v3) + num(stats.clutch1v4) + num(stats.clutch1v5);
}

export function computeMatchDerived(stats) {
  const multiKill = hasEnteredDetail(stats, MULTI_KILL_DETAIL_FIELDS.map((f) => f.key))
    ? multiKillFromDetails(stats)
    : num(stats.multiKill);
  const clutch = hasEnteredDetail(stats, CLUTCH_DETAIL_FIELDS.map((f) => f.key))
    ? clutchFromDetails(stats)
    : num(stats.clutch);
  return computeDerived({ ...stats, multiKill, clutch });
}

export function computeDerived(stats) {
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
export const FIELD_ALIASES = {
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

export function mapRow(raw) {
  const row = {};
  Object.entries(raw).forEach(([h, v]) => {
    const key = FIELD_ALIASES[normalizeHeader(h)];
    if (key) row[key] = v;
  });
  return row;
}

export function emptyStats() {
  const s = {};
  STAT_FIELDS.forEach((f) => { s[f.key] = ""; });
  return s;
}

export function fmtStat(v, field) {
  if (v === "" || v === undefined || v === null) return "—";
  let n = num(v);
  if (field.suffix === "%" && n !== 0 && Math.abs(n) <= 1) n *= 100;
  return round(n, field.decimals) + (field.suffix || "");
}

// fields where "did it go up or down" isn't meaningful — they only ever accumulate
export const NO_EVOLUTION_KEYS = new Set(["match", "maps", "round", "elo"]);

// compares the DISPLAYED (rounded) value against the snapshot taken just before the last
// match was added — green if it rose, red if it fell, null (default color) if unchanged or unknown
export function evolutionColor(player, field) {
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

export function currentTeam(player) {
  const h = player.teamHistory || [];
  if (!h.length) return "";
  const last = h[h.length - 1];
  return last.until ? "" : last.team;
}

// Agent libre : le joueur a déjà eu une équipe, mais sa dernière est terminée (date "jusqu'à").
// Un joueur sans aucun historique n'est PAS agent libre : on ne sait simplement rien de lui.
export function isFreeAgent(player) {
  const h = player?.teamHistory || [];
  return h.length > 0 && Boolean(h[h.length - 1].until);
}

// Transfert : clôt l'équipe en cours (ou les équipes ouvertes) et ajoute la nouvelle.
// newTeam vide = le joueur devient agent libre.
export function transferPlayer(player, newTeam, date = new Date().toISOString().slice(0, 10)) {
  const history = (player.teamHistory || []).map((e) => (e.until ? e : { ...e, until: date }));
  const team = String(newTeam || "").trim();
  if (team) history.push({ id: uid(), team, since: date, until: "" });
  return { ...player, teamHistory: history };
}

// label for a team-history row: "depuis X" only for the still-current spell; a closed spell
// shows its actual span (explicit "until", or inferred from when the next team started)
export function teamPeriodLabel(entry, isCurrent, impliedUntil) {
  const until = entry.until || impliedUntil || "";
  if (isCurrent) return entry.since ? `depuis ${entry.since}` : "";
  if (entry.since && until) return `${entry.since} → ${until}`;
  if (until) return `jusqu'à ${until}`;
  if (entry.since) return `depuis ${entry.since}`;
  return "";
}

// tie-break chains: when the sorted column is equal, fall through these criteria in order
export const TIEBREAKERS = {
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

export function tieValue(player, key, dir) {
  const v = num(player.stats[key]);
  return dir === "asc" ? -v : v;
}

// ascending-style comparator for a stat column, falling through its tie-break chain, then name
export function statCompareAsc(a, b, key) {
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

export function getLogo(teamLogos, teamName) {
  if (!teamName) return null;
  return teamLogos[teamName.trim().toLowerCase()] || null;
}

// rank of a player on a given stat among players who have entered a value for it
export function getRank(players, key, playerId) {
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

export function countryLabel(code) {
  const c = COUNTRIES.find((x) => x[0] === code);
  return c ? c[1] : code || "";
}

export function migratePlayer(p) {
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

export function migrateTournament(t) {
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
export function hasStatValue(v) {
  return v !== "" && v !== undefined && v !== null && !Number.isNaN(Number(String(v).replace(",", ".")));
}

export function averageCount(stats, key) {
  const stored = stats?.[`_${key}Count`];
  if (stored !== undefined && stored !== null && stored !== "") return Math.max(0, num(stored));
  return hasStatValue(stats?.[key]) && num(stats?.match) > 0 ? num(stats.match) : 0;
}

// raw counters that simply add up from one match to the next
const SUMMED_KEYS = [
  "maps", "round", "kill", "death", "assist", "fk", "fd",
  ...MULTI_KILL_DETAIL_FIELDS.map((f) => f.key),
  ...CLUTCH_DETAIL_FIELDS.map((f) => f.key),
  "clutchAttempt",
];

// a match's multi-kill / clutch total: the detailed breakdown wins when it was entered
function matchMultiKill(m) {
  return hasEnteredDetail(m, MULTI_KILL_DETAIL_FIELDS.map((f) => f.key)) ? multiKillFromDetails(m) : num(m.multiKill);
}
function matchClutch(m) {
  return hasEnteredDetail(m, CLUTCH_DETAIL_FIELDS.map((f) => f.key)) ? clutchFromDetails(m) : num(m.clutch);
}

// Rating et KAST ignorent complètement les matchs où la valeur n'a pas été saisie.
function combineAverage(stats, m, key, sign, normalize = num) {
  const oldCount = averageCount(stats, key);
  const has = hasStatValue(m[key]);
  const count = Math.max(0, oldCount + (has ? sign : 0));
  const value = count > 0
    ? (normalize(stats[key]) * oldCount + (has ? sign * normalize(m[key]) : 0)) / count
    : "";
  return { value, count };
}

// sign = +1 adds a match to the running totals, -1 takes it back out
function combineMatch(stats, m, sign) {
  const oldMatch = num(stats.match);
  const totMatch = Math.max(0, oldMatch + sign);
  const total = (base, delta) => (sign > 0 ? base + delta : Math.max(0, base - delta));

  const totals = {};
  SUMMED_KEYS.forEach((key) => { totals[key] = total(num(stats[key]), num(m[key])); });
  const multiKill = total(num(stats.multiKill), matchMultiKill(m));
  const clutch = total(num(stats.clutch), matchClutch(m));

  const rating = combineAverage(stats, m, "rating", sign);
  const kast = combineAverage(stats, m, "kast", sign, normPct);

  // ACS conserve le comportement historique (moyenne par match).
  const acs = totMatch > 0 ? (num(stats.acs) * oldMatch + sign * num(m.acs)) / totMatch : "";

  const { kill, death, assist, fk, fd, clutchAttempt } = totals;
  return {
    ...stats,
    ...totals,
    match: totMatch,
    rating: rating.value,
    _ratingCount: rating.count,
    acs,
    kast: kast.value,
    _kastCount: kast.count,
    multiKill,
    clutch,
    kd: death > 0 ? kill / death : kill,
    kda: death > 0 ? (kill + assist) / death : kill + assist,
    kdDiff: kill - death,
    fkDiff: fk - fd,
    clutchPct: clutchAttempt > 0 ? (clutch / clutchAttempt) * 100 : 0,
  };
}

export function applyMatchToStats(stats, m) {
  return combineMatch(stats, m, +1);
}

export function removeMatchFromStats(stats, m) {
  if (num(stats.match) <= 0) return stats;
  return combineMatch(stats, m, -1);
}

// After a manual overwrite (import, "Corriger"), the hidden per-average counters no longer
// match what was typed: if Match, Rating or KAST changed, drop them so the next match is
// weighted by the visible Match count again.
export function resetAverageCounts(nextStats, prevStats) {
  const changed = ["match", "rating", "kast"].some((key) => String(nextStats[key] ?? "") !== String(prevStats?.[key] ?? ""));
  if (!changed) return nextStats;
  const { _ratingCount, _kastCount, ...rest } = nextStats;
  return rest;
}
