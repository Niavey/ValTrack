import { describe, it, expect } from "vitest";
import { computeTeamElo, matchWinnerTeamId, getStompMultiplier, ELO_START } from "./elo.js";
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

describe("computeTeamElo", () => {
  it("le gain du vainqueur est égal à la perte du perdant (à départ égal)", () => {
    const t = tournament({ matches: [{ id: "m1", teamAId: "a", teamBId: "b", mapScores: [{ a: 13, b: 11 }, { a: 13, b: 11 }] }] });
    const [first, second] = computeTeamElo([t]);
    expect(first.name).toBe("Alpha");
    expect(first.elo - ELO_START).toBeCloseTo(ELO_START - second.elo);
    expect(first.history[0].result).toBe("W");
  });
  it("ajoute le bonus de tournoi au vainqueur", () => {
    const t = tournament({ finished: true, winnerTeamId: "b" });
    const ranking = computeTeamElo([t]);
    expect(ranking[0].name).toBe("Bravo");
    expect(ranking[0].elo).toBe(ELO_START + 30);
  });
  it("regroupe une même équipe entre tournois, sans tenir compte de la casse", () => {
    const t1 = tournament({ id: "t1", matches: [{ id: "m1", teamAId: "a", teamBId: "b", winnerTeamId: "a" }] });
    const t2 = tournament({
      id: "t2", date: "2026-02-01",
      teams: [{ id: "x", name: "ALPHA ", playerIds: [] }, { id: "y", name: "Bravo", playerIds: [] }],
      matches: [{ id: "m2", teamAId: "x", teamBId: "y", winnerTeamId: "x" }],
    });
    const ranking = computeTeamElo([t2, t1]);
    expect(ranking).toHaveLength(2);
    expect(ranking[0].history).toHaveLength(2);
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
