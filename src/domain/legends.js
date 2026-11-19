import { num } from "./stats.js";

// Légendes du club
// ------------------------------------------------------------------
// Trois dimensions, notées chacune de 0 à ~1,5 (1 = niveau "légende" sur cette dimension) :
//   - longévité   : années dans l'équipe, matchs joués, tournois disputés (on garde la meilleure)
//   - palmarès    : points de trophées gagnés AVEC l'équipe (Champions > Masters > Split)
//   - performance : Rating comparé au Rating moyen de l'équipe, seulement avec assez de matchs
//
// Plusieurs chemins mènent au statut de Légende, pour ne jamais pénaliser la fidélité :
//   1. longévité exceptionnelle à elle seule (ex. 4 ans, ou 150 matchs) ;
//   2. gros palmarès + une vraie durée dans l'équipe ;
//   3. un ensemble solide sur les trois dimensions.
// Tous les seuils sont ici pour être ajustés après quelques essais.
export const LEGEND_CONFIG = {
  longevity: { years: 4, matches: 150, tournaments: 12 }, // = score 1 sur cette dimension
  trophyPoints: { Champions: 5, Masters: 3, Split: 1, Autre: 0.5 },
  palmaresForLegend: 6,          // ex. Champions + Split, ou 2 Masters
  minMatchesForPerformance: 15,  // en dessous, la performance ne compte pas
  performance: { neutralRatio: 0.95, fullRatio: 1.15 }, // Rating 15 % au-dessus de l'équipe = 1
  legend: {
    longevityAlone: 1,           // chemin 1
    palmares: 1, palmaresMinLongevity: 0.35, // chemin 2 (≈ 1,4 an ou ~50 matchs)
    combined: 0.9, combinedMinLongevity: 0.35, // chemin 3
  },
  weights: { longevity: 0.45, palmares: 0.35, performance: 0.2 },
  historic: { longevity: 0.4, palmares: 0.4, performance: 1, combined: 0.45 },
  cap: 1.5,
};

export const LEGEND_LEVELS = {
  legend: { label: "Légende", color: "var(--gold)" },
  historic: { label: "Figure historique", color: "var(--steel)" },
  member: { label: "Ancien joueur", color: "var(--text-dim)" },
};

const DAY = 24 * 60 * 60 * 1000;
function yearsBetween(since, until) {
  const a = Date.parse(since);
  const b = Date.parse(until);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return (b - a) / (365.25 * DAY);
}

// Rating moyen de l'équipe sur tous ses joueurs, pondéré par le nombre de matchs avec Rating
export function teamAverageRating(members) {
  let sum = 0, weight = 0;
  members.forEach((m) => {
    const count = num(m.stats?._ratingCount ?? m.stats?.match);
    if (count > 0 && m.stats?.rating !== "" && m.stats?.rating !== undefined) {
      sum += num(m.stats.rating) * count;
      weight += count;
    }
  });
  return weight ? sum / weight : 0;
}

export function scoreMember(member, teamRating, config = LEGEND_CONFIG) {
  const cap = (v) => Math.max(0, Math.min(config.cap, v));
  const years = yearsBetween(member.since, member.until);
  const matches = num(member.stats?.match);
  const tournaments = num(member.tournaments);

  const longevity = cap(Math.max(
    years / config.longevity.years,
    matches / config.longevity.matches,
    tournaments / config.longevity.tournaments,
  ));

  const trophyPoints = (member.trophies || []).reduce((sum, t) => sum + (config.trophyPoints[t.type] ?? 0), 0);
  const palmares = cap(trophyPoints / config.palmaresForLegend);

  const rating = member.stats?.rating === "" || member.stats?.rating === undefined ? null : num(member.stats.rating);
  const ratio = rating !== null && teamRating > 0 ? rating / teamRating : null;
  const { neutralRatio, fullRatio } = config.performance;
  const performance = ratio !== null && matches >= config.minMatchesForPerformance
    ? cap((ratio - neutralRatio) / (fullRatio - neutralRatio))
    : 0;

  const w = config.weights;
  const combined = w.longevity * longevity + w.palmares * palmares + w.performance * performance;
  return { years, matches, tournaments, trophyPoints, rating, ratio, longevity, palmares, performance, combined };
}

// Statut + raisons lisibles, pour afficher POURQUOI un joueur est une légende
export function classifyMember(member, teamRating, config = LEGEND_CONFIG) {
  const s = scoreMember(member, teamRating, config);
  const L = config.legend;
  const paths = [];
  if (s.longevity >= L.longevityAlone) paths.push("longevity");
  if (s.palmares >= L.palmares && s.longevity >= L.palmaresMinLongevity) paths.push("palmares");
  if (s.combined >= L.combined && s.longevity >= L.combinedMinLongevity) paths.push("combined");

  const H = config.historic;
  let level = "member";
  if (paths.length) level = "legend";
  else if (s.longevity >= H.longevity || s.palmares >= H.palmares || s.performance >= H.performance || s.combined >= H.combined) level = "historic";

  const reasons = [];
  if (s.years >= 1 || s.matches >= 30) {
    const parts = [];
    if (s.years >= 1) parts.push(`${s.years.toFixed(1).replace(".", ",")} an${s.years >= 2 ? "s" : ""}`);
    parts.push(`${s.matches} match${s.matches > 1 ? "s" : ""}`);
    reasons.push(`Longévité : ${parts.join(", ")}`);
  }
  if (s.trophyPoints > 0) {
    const counts = {};
    (member.trophies || []).forEach((t) => { counts[t.type] = (counts[t.type] || 0) + 1; });
    reasons.push("Palmarès : " + ["Champions", "Masters", "Split", "Autre"]
      .filter((t) => counts[t]).map((t) => (counts[t] > 1 ? `${counts[t]}× ${t}` : t)).join(", "));
  }
  if (s.performance > 0.5 && s.ratio !== null) {
    const pct = Math.round((s.ratio - 1) * 100);
    reasons.push(`Performance : Rating ${s.rating.toFixed(2)} (${pct >= 0 ? "+" : ""}${pct} % vs l'équipe)`);
  }
  return { level, paths, scores: s, reasons };
}

// Classe tous les joueurs passés par une équipe (actifs compris), meilleurs d'abord.
export function classifyClubMembers(members, config = LEGEND_CONFIG) {
  const teamRating = teamAverageRating(members);
  const order = { legend: 0, historic: 1, member: 2 };
  return members
    .map((m) => ({ ...m, legend: classifyMember(m, teamRating, config) }))
    .sort((a, b) => order[a.legend.level] - order[b.legend.level]
      || b.legend.scores.combined - a.legend.scores.combined);
}
