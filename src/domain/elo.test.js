import { describe, it, expect } from "vitest";
import { computeTeamElo, computePlayerElo, matchWinnerTeamId, getStompMultiplier, participationCoefficient, ratingAdjustment, ELO_START } from "./elo.js";
import { classifyMatchFormat, computeMvpMj, computeMvpMjCounts } from "./records.js";

const teams = [
  { id: "a", name: "Alpha", playerIds: ["p1", "p2"] },
  { id: "b", name: "Bravo", playerIds: ["p3", "p4"] },
];
const tournament = (overrides = {}) => ({
  id: "t1", name: "Split 1", type: "Split", date: "2026-01-01", teams, matches: [], ...overrides,
});

describe("matchWinnerTeamId / classifyMatchFormat", () => {
  it("déduit le vainqueur du score des maps", () => {
    expect(matchWinnerTeamId({ teamAId: "a", teamBId: "b", mapScores: [{ a: 13, b: 5 }, { a: 9, b: 13 }, { a: 13, b: 11 }] })).toBe("a");
  });
  it("le vainqueur explicite est prioritaire", () => {
    expect(matchWinnerTeamId({ teamAId: "a", teamBId: "b", winnerTeamId: "b", mapScores: [{ a: 13, b: 0 }] })).toBe("b");
  });
  it("classe BO3 / BO5 selon les maps gagnées", () => {
    expect(classifyMatchFormat([{ a: 13, b: 5 }, { a: 13, b: 7 }])).toBe("BO3");
    expect(classifyMatchFormat([{ a: 13, b: 5 }, { a: 13, b: 7 }, { a: 13, b: 2 }])).toBe("BO5");
    expect(classifyMatchFormat([{ a: 13, b: 5 }])).toBe(null);
  });
  it("un score écrasant multiplie le gain", () => {
    expect(getStompMultiplier([{ a: 13, b: 13 }])).toBe(1);
    expect(getStompMultiplier([{ a: 13, b: 0 }])).toBeCloseTo(1.65);
  });
});

describe("Elo individuel", () => {
  const five = (prefix) => [1, 2, 3, 4, 5].map((n) => prefix + n);
  const drx = { id: "drx", name: "DRX", playerIds: [...five("d"), "d6"] };
  const t1 = { id: "t1", name: "T1", playerIds: five("t") };
  const bo3 = (lineupA) => ([
    { a: 13, b: 8, lineupA: five("d"), lineupB: five("t") },
    { a: 10, b: 13, lineupA, lineupB: five("t") },
    { a: 13, b: 6, lineupA, lineupB: five("t") },
  ]);

  it("à force égale, ce que gagnent les vainqueurs = ce que perdent les perdants", () => {
    const t = tournament({ teams: [drx, t1], matches: [{ id: "m", teamAId: "drx", teamBId: "t1", mapScores: bo3(five("d")) }] });
    const elo = computePlayerElo([t]);
    const gain = elo.get("d1").elo - ELO_START;
    expect(gain).toBeGreaterThan(0);
    expect(elo.get("t1").elo).toBeCloseTo(ELO_START - gain);
  });

  it("un remplaçant gagne aussi, avec un coefficient selon ses maps (0,6 / 0,8 / 1)", () => {
    const lineup = ["d1", "d2", "d3", "d4", "d6"];
    const t = tournament({ teams: [drx, t1], matches: [{ id: "m", teamAId: "drx", teamBId: "t1", mapScores: bo3(lineup) }] });
    const elo = computePlayerElo([t]);
    const full = elo.get("d1").elo - ELO_START;
    expect((elo.get("d5").elo - ELO_START) / full).toBeCloseTo(0.6);
    expect((elo.get("d6").elo - ELO_START) / full).toBeCloseTo(0.8);
    expect(participationCoefficient(1, 3)).toBeCloseTo(0.6);
  });

  it("le Rating module légèrement le gain, plafonné à ±10 %", () => {
    const stats = { d1: { rating: 1.6 }, d2: { rating: 1.0 }, d3: { rating: 1.0 }, d4: { rating: 1.0 }, d5: { rating: 0.4 } };
    const t = tournament({ teams: [drx, t1], matches: [{ id: "m", teamAId: "drx", teamBId: "t1", mapScores: bo3(five("d")), stats }] });
    const elo = computePlayerElo([t]);
    const avg = elo.get("d2").elo - ELO_START;
    expect((elo.get("d1").elo - ELO_START) / avg).toBeCloseTo(1.1 / (1 + ratingAdjustment(1.0, 1.0)), 5);
    expect((elo.get("d5").elo - ELO_START) / avg).toBeCloseTo(0.9, 5);
    expect(ratingAdjustment(1.2, 1.0)).toBeCloseTo(0.1);
    expect(ratingAdjustment(null, 1.0)).toBe(0);
  });

  it("battre un favori rapporte plus que battre un outsider", () => {
    const win = { id: "m1", teamAId: "drx", teamBId: "t1", mapScores: bo3(five("d")) };
    const first = tournament({ teams: [drx, t1], matches: [win] });
    // revanche : T1, désormais outsider, gagne
    const rematch = tournament({ id: "t2", date: "2026-02-01", teams: [drx, t1], matches: [{ id: "m2", teamAId: "drx", teamBId: "t1", winnerTeamId: "t1", mapScores: [{ a: 11, b: 13 }, { a: 8, b: 13 }] }] });
    const afterFirst = computePlayerElo([first]).get("t1").elo;
    const afterBoth = computePlayerElo([first, rematch]).get("t1").elo;
    expect(afterBoth - afterFirst).toBeGreaterThan(ELO_START - afterFirst);
  });

  it("un joueur garde son Elo en changeant d'équipe", () => {
    const first = tournament({ teams: [drx, t1], matches: [{ id: "m", teamAId: "drx", teamBId: "t1", mapScores: bo3(five("d")) }] });
    const vs = { id: "vs", name: "Vision", playerIds: five("d") };
    const later = tournament({ id: "t2", date: "2026-02-01", teams: [vs, { ...t1, id: "t1b" }], matches: [] });
    const ranking = computeTeamElo([first, later]);
    const dElo = computePlayerElo([first]).get("d1").elo;
    // Vision n'a encore joué aucun match mais récupère le niveau de ses joueurs
    expect(ranking.find((r) => r.name === "Vision").elo).toBeCloseTo(dElo);
    expect(ranking.find((r) => r.name === "DRX").elo).toBeCloseTo(dElo);
  });

  it("bonus de tournoi pour chaque joueur du roster vainqueur", () => {
    const t = tournament({ teams: [drx, t1], finished: true, winnerTeamId: "drx" });
    const elo = computePlayerElo([t]);
    expect(elo.get("d6").elo).toBe(ELO_START + 30);
  });

  it("l'Elo d'équipe = moyenne des 5 joueurs qui ont le plus joué", () => {
    const lineup = ["d1", "d2", "d3", "d4", "d6"];
    const t = tournament({ teams: [drx, t1], matches: [{ id: "m", teamAId: "drx", teamBId: "t1", mapScores: bo3(lineup) }] });
    const row = computeTeamElo([t]).find((r) => r.name === "DRX");
    expect(row.roster.map((p) => p.id).sort()).toEqual(["d1", "d2", "d3", "d4", "d6"]);
    expect(row.substitutes).toEqual(["d5"]);
    const elo = computePlayerElo([t]);
    const avg = row.roster.reduce((s, p) => s + elo.get(p.id).elo, 0) / 5;
    expect(row.elo).toBeCloseTo(avg);
  });
});

describe("MVP / MJ", () => {
  it("MVP = meilleur rating, MJ = meilleur rating de l'équipe adverse", () => {
    const stats = { p1: { rating: 1.5 }, p2: { rating: 1.3 }, p3: { rating: 1.1 }, p4: { rating: 0.9 } };
    expect(computeMvpMj(stats, teams[0])).toEqual({ mvpId: "p1", mjId: "p3" });
  });
  it("compte les MVP/MJ sur tous les matchs", () => {
    const stats = { p1: { rating: 1.5 }, p3: { rating: 1.1 } };
    const t = tournament({ matches: [{ id: "m1", teamAId: "a", teamBId: "b", stats }, { id: "m2", teamAId: "a", teamBId: "b", stats }] });
    expect(computeMvpMjCounts([t])).toEqual({ p1: { mvp: 2, mj: 0 }, p3: { mvp: 0, mj: 2 } });
  });
});
