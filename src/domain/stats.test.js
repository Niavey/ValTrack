import { describe, it, expect } from "vitest";
import {
  num, normPct, computeDerived, computeMatchDerived, applyMatchToStats, removeMatchFromStats,
  emptyStats, fmtStat, STAT_FIELDS, statCompareAsc, mapRow, currentTeam, resetAverageCounts,
} from "./stats.js";

const field = (key) => STAT_FIELDS.find((f) => f.key === key);

const matchA = {
  maps: 2, round: 45, kill: 40, death: 30, assist: 12, acs: 250, rating: 1.2, kast: 75,
  fk: 6, fd: 4, doubleKill: 5, tripleKill: 2, quadKill: 1, ace: 0,
  clutch1v1: 1, clutch1v2: 1, clutch1v3: "", clutch1v4: "", clutch1v5: "", clutchAttempt: 4,
};
const matchB = {
  maps: 3, round: 60, kill: 50, death: 45, assist: 20, acs: 210, rating: "", kast: 0.7,
  fk: 3, fd: 8, multiKill: 6, clutch: 1, clutchAttempt: 5,
};

describe("num / normPct", () => {
  it("accepte la virgule décimale et renvoie 0 sur une valeur invalide", () => {
    expect(num("1,25")).toBe(1.25);
    expect(num("abc")).toBe(0);
    expect(num(null)).toBe(0);
  });
  it("convertit une fraction de tableur en pourcentage", () => {
    expect(normPct(0.72)).toBeCloseTo(72);
    expect(normPct(72)).toBe(72);
    expect(normPct(0)).toBe(0);
  });
});

describe("computeDerived", () => {
  it("calcule KD, KDA, diffs et clutch %", () => {
    const d = computeDerived({ kill: 20, death: 10, assist: 5, fk: 4, fd: 1, clutch: 1, clutchAttempt: 4 });
    expect(d.kd).toBe(2);
    expect(d.kda).toBe(2.5);
    expect(d.kdDiff).toBe(10);
    expect(d.fkDiff).toBe(3);
    expect(d.clutchPct).toBe(25);
  });
  it("évite la division par zéro quand il n'y a aucune mort", () => {
    const d = computeDerived({ kill: 7, death: 0, assist: 3 });
    expect(d.kd).toBe(7);
    expect(d.kda).toBe(10);
  });
  it("le total multi-kill vient du détail quand il est saisi", () => {
    expect(computeMatchDerived(matchA).multiKill).toBe(8);
    expect(computeMatchDerived(matchA).clutch).toBe(2);
  });
});

describe("applyMatchToStats", () => {
  it("additionne les totaux et fait la moyenne des stats moyennées", () => {
    const s1 = applyMatchToStats(emptyStats(), matchA);
    expect(s1.match).toBe(1);
    expect(s1.kill).toBe(40);
    expect(s1.multiKill).toBe(8);
    expect(s1.clutch).toBe(2);
    expect(s1.rating).toBe(1.2);
    expect(s1._ratingCount).toBe(1);

    const s2 = applyMatchToStats(s1, matchB);
    expect(s2.match).toBe(2);
    expect(s2.kill).toBe(90);
    expect(s2.round).toBe(105);
    // le rating du match B n'est pas saisi : il est ignoré dans la moyenne
    expect(s2.rating).toBe(1.2);
    expect(s2._ratingCount).toBe(1);
    // KAST : 75 et 0.7 (=70%) → 72.5
    expect(s2.kast).toBeCloseTo(72.5);
    expect(s2.acs).toBe(230);
    expect(s2.kd).toBeCloseTo(90 / 75);
    expect(s2.clutchPct).toBeCloseTo((3 / 9) * 100);
  });

  it("retirer un match annule exactement son ajout", () => {
    const base = applyMatchToStats(emptyStats(), matchA);
    const withB = applyMatchToStats(base, matchB);
    const back = removeMatchFromStats(withB, matchB);
    for (const key of ["match", "maps", "round", "kill", "death", "assist", "fk", "fd", "multiKill",
      "doubleKill", "clutch", "clutch1v1", "clutchAttempt", "kd", "kda", "kdDiff", "fkDiff", "clutchPct"]) {
      expect(back[key], key).toBeCloseTo(num(base[key]));
    }
    expect(back.rating).toBeCloseTo(base.rating);
    expect(back.kast).toBeCloseTo(base.kast);
    expect(back.acs).toBeCloseTo(base.acs);
    expect(back._ratingCount).toBe(base._ratingCount);
  });

  it("retirer le dernier match vide les moyennes", () => {
    const one = applyMatchToStats(emptyStats(), matchA);
    const zero = removeMatchFromStats(one, matchA);
    expect(zero.match).toBe(0);
    expect(zero.rating).toBe("");
    expect(zero.acs).toBe("");
  });
});

describe("resetAverageCounts", () => {
  it("après une correction manuelle, la moyenne se base sur le nombre de matchs saisi", () => {
    const played = applyMatchToStats(applyMatchToStats(emptyStats(), matchA), matchA);
    expect(played._ratingCount).toBe(2);
    // l'utilisateur corrige à la main : 20 matchs, rating 1.10
    const corrected = resetAverageCounts({ ...played, match: 20, rating: 1.1 }, played);
    const next = applyMatchToStats(corrected, { ...matchA, rating: 2.1 });
    expect(next.rating).toBeCloseTo((1.1 * 20 + 2.1) / 21);
  });
  it("ne touche à rien si seules d'autres stats changent", () => {
    const played = applyMatchToStats(emptyStats(), { ...matchA, rating: "" });
    const fixed = resetAverageCounts({ ...played, kill: 41 }, played);
    expect(fixed._ratingCount).toBe(0);
  });
});

describe("affichage et tri", () => {
  it("fmtStat arrondit et ajoute le suffixe", () => {
    expect(fmtStat(1.234, field("rating"))).toBe("1.23");
    expect(fmtStat(0.72, field("kast"))).toBe("72%");
    expect(fmtStat("", field("kast"))).toBe("—");
  });
  it("deux valeurs identiques une fois arrondies sont départagées par les rounds", () => {
    const a = { name: "A", stats: { rating: 1.201, round: 100 } };
    const b = { name: "B", stats: { rating: 1.199, round: 200 } };
    expect(statCompareAsc(a, b, "rating")).toBeLessThan(0);
  });
  it("mapRow reconnaît les en-têtes FR/EN avec accents et %", () => {
    expect(mapRow({ "Joueur": "Zeus", "Équipe": "VT", "Clutch %": 40, "Kills": 10 }))
      .toEqual({ name: "Zeus", team: "VT", clutchPct: 40, kill: 10 });
  });
  it("currentTeam ignore une équipe quittée", () => {
    expect(currentTeam({ teamHistory: [{ team: "A" }, { team: "B" }] })).toBe("B");
    expect(currentTeam({ teamHistory: [{ team: "A", until: "2025" }] })).toBe("");
  });
});
