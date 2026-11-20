import { computeRole, ROLE_CONFIG } from "./agents.js";

// "Meilleurs 5" d'une équipe, toutes périodes confondues : un Smoker, un Duelliste, un
// Initiateur, une Sentinelle et un Flex, choisis selon le Rating AVEC cette équipe.
export const BEST_FIVE_CONFIG = {
  minMatches: 10,          // matchs minimum avec l'équipe pour être éligible
  candidatesPerRole: 6,    // on teste les 6 meilleurs de chaque rôle (largement suffisant)
};

export const BEST_FIVE_SLOTS = ["controller", "duelist", "initiator", "sentinel", "flex"];

// members : lignes de buildTeamPage (stats limitées au passage dans l'équipe)
// plays   : collectAgentPlays, toutes équipes ; on garde celles jouées avec CETTE équipe pour
//           que le rôle soit celui qu'avait le joueur ici (un ex-duelliste reste duelliste ici)
export function computeBestFive(teamKey, members, plays, config = BEST_FIVE_CONFIG) {
  const eligible = members
    .filter((m) => Number(m.stats?.match) >= config.minMatches && m.stats?.rating !== "" && m.stats?.rating !== undefined)
    .map((m) => {
      const role = computeRole(plays.filter((p) => p.playerId === m.id && p.orgKey === teamKey));
      return { ...m, rating: Number(m.stats.rating), role: role.role, roleShares: role.shares };
    })
    .sort((a, b) => b.rating - a.rating);

  // Candidats d'un poste : les spécialistes du rôle. S'il n'y en a AUCUN d'éligible, les Flex
  // qui jouent ce rôle au moins 25 % du temps peuvent le prendre (ex. un Flex à 50 % Initiateur
  // comble un poste Initiateur vide ; le poste Flex revient alors au meilleur joueur restant).
  const byRole = (role) => {
    const specialists = eligible.filter((m) => m.role === role);
    const pool = specialists.length
      ? specialists
      : eligible.filter((m) => m.role === "flex" && (m.roleShares?.[role] || 0) >= ROLE_CONFIG.flexShare);
    return pool.slice(0, config.candidatesPerRole);
  };
  const pools = ["controller", "duelist", "initiator", "sentinel"].map((r) => [null, ...byRole(r)]);

  // essai de toutes les combinaisons (petit volume) : on maximise d'abord le nombre de postes
  // remplis, puis la somme des Ratings. Le Flex va à un vrai Flex s'il en reste un, sinon au
  // meilleur joueur restant (y compris un joueur sans rôle connu).
  let best = null;
  const pick = (index, chosen) => {
    if (index === pools.length) {
      const used = new Set(chosen.filter(Boolean).map((m) => m.id));
      const remaining = eligible.filter((m) => !used.has(m.id));
      const flex = remaining.find((m) => m.role === "flex") || remaining[0] || null;
      const lineup = [...chosen, flex];
      const filled = lineup.filter(Boolean).length;
      const total = lineup.reduce((s, m) => s + (m ? m.rating : 0), 0);
      // à égalité, on préfère chaque joueur à SON poste (un duelliste au poste Duelliste)
      const matched = lineup.filter((m, i) => m && m.role === BEST_FIVE_SLOTS[i]).length;
      const better = !best || filled > best.filled
        || (filled === best.filled && total > best.total + 1e-9)
        || (filled === best.filled && Math.abs(total - best.total) <= 1e-9 && matched > best.matched);
      if (better) best = { lineup, filled, total, matched };
      return;
    }
    const used = new Set(chosen.filter(Boolean).map((m) => m.id));
    pools[index].forEach((candidate) => {
      if (candidate && used.has(candidate.id)) return;
      pick(index + 1, [...chosen, candidate]);
    });
  };
  pick(0, []);

  return {
    slots: BEST_FIVE_SLOTS.map((slot, i) => ({ slot, member: best?.lineup[i] || null })),
    eligibleCount: eligible.length,
    withoutRole: eligible.filter((m) => !m.role).length,
  };
}
