import { num } from "./stats.js";

// Composition map par map
// ------------------------------------------------------------------
// Chaque map d'un match peut porter la liste des joueurs qui l'ont jouée :
//   { a: 13, b: 8, lineupA: ["p1", ...], lineupB: ["p6", ...] }
// Ces listes sont stockées dans le champ map_scores existant, donc aucune colonne n'est à
// ajouter dans Supabase. Les anciens matchs n'ont pas de lineup : on considère alors que les
// joueurs présents dans les stats du match ont joué toutes les maps (ancien comportement).

// a map counts as played as soon as one of the two scores has been entered
export function isPlayedMap(map) {
  return map?.a !== "" && map?.a !== undefined && map?.a !== null
    || map?.b !== "" && map?.b !== undefined && map?.b !== null;
}

export function mapRounds(map) {
  return num(map?.a) + num(map?.b);
}

export function playedMaps(mapScores) {
  return (mapScores || []).filter(isPlayedMap);
}

function sideOf(playerId, teamA, teamB) {
  if (teamA?.playerIds?.includes(playerId)) return "A";
  if (teamB?.playerIds?.includes(playerId)) return "B";
  return null;
}

// Pour chaque joueur ayant participé : son camp, le nombre de maps et de rounds joués et
// l'index des maps concernées. Fonctionne pour les nouveaux matchs (lineups) comme pour les
// anciens (déduits des stats).
export function computeParticipation(match, teamA, teamB) {
  const out = new Map();
  const legacyIds = Object.keys(match?.stats || {});
  const add = (playerId, side, map, index) => {
    if (!out.has(playerId)) out.set(playerId, { side, maps: 0, rounds: 0, mapIndexes: [] });
    const entry = out.get(playerId);
    entry.maps += 1;
    entry.rounds += mapRounds(map);
    entry.mapIndexes.push(index);
  };

  (match?.mapScores || []).forEach((map, index) => {
    if (!isPlayedMap(map)) return;
    for (const side of ["A", "B"]) {
      const lineup = map[`lineup${side}`];
      const ids = Array.isArray(lineup)
        ? lineup
        : legacyIds.filter((id) => (sideOf(id, teamA, teamB) || "B") === side);
      ids.forEach((id) => add(id, side, map, index));
    }
  });

  // ancien match sans score de map : les joueurs des stats ont "participé", sans maps comptées
  if (out.size === 0) {
    legacyIds.forEach((id) => out.set(id, { side: sideOf(id, teamA, teamB) || "B", maps: 0, rounds: 0, mapIndexes: [] }));
  }
  return out;
}

// Les lineups effectives d'un match en cours de saisie : une map sans lineup explicite reprend
// celle de la map précédente, et la première reprend la composition de départ.
export function resolveLineups(mapScores, startersA, startersB) {
  let prevA = startersA || [];
  let prevB = startersB || [];
  return (mapScores || []).map((map) => {
    const lineupA = Array.isArray(map.lineupA) ? map.lineupA : prevA;
    const lineupB = Array.isArray(map.lineupB) ? map.lineupB : prevB;
    prevA = lineupA;
    prevB = lineupB;
    return { ...map, lineupA, lineupB };
  });
}

// Inverse de resolveLineups, pour ré-éditer un match : on ne garde une lineup explicite que là
// où elle change par rapport à la map précédente (sinon elle suit la composition de départ).
export function compactLineups(mapScores, startersA, startersB) {
  let prevA = startersA || [];
  let prevB = startersB || [];
  return (mapScores || []).map((map) => {
    const { lineupA, lineupB, ...rest } = map;
    const out = { ...rest };
    if (Array.isArray(lineupA)) {
      if (!sameIds(lineupA, prevA)) out.lineupA = lineupA;
      prevA = lineupA;
    }
    if (Array.isArray(lineupB)) {
      if (!sameIds(lineupB, prevB)) out.lineupB = lineupB;
      prevB = lineupB;
    }
    return out;
  });
}

export function sameIds(a, b) {
  if ((a || []).length !== (b || []).length) return false;
  const set = new Set(a);
  return (b || []).every((id) => set.has(id));
}

// "F remplace E" entre deux lineups successives
export function substitutionSummary(previous, current, nameOf) {
  const prevSet = new Set(previous || []);
  const curSet = new Set(current || []);
  const inIds = (current || []).filter((id) => !prevSet.has(id));
  const outIds = (previous || []).filter((id) => !curSet.has(id));
  if (inIds.length === 0 && outIds.length === 0) return "";
  const names = (ids) => ids.map(nameOf).join(", ");
  if (inIds.length && outIds.length) return `${names(inIds)} remplace ${names(outIds)}`;
  if (inIds.length) return `+ ${names(inIds)}`;
  return `− ${names(outIds)}`;
}
