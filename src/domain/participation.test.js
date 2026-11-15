import { describe, it, expect } from "vitest";
import { computeParticipation, resolveLineups, compactLineups, substitutionSummary } from "./participation.js";

const teamA = { id: "a", playerIds: ["A", "B", "C", "D", "E", "F"] };
const teamB = { id: "b", playerIds: ["V", "W", "X", "Y", "Z"] };
const five = ["A", "B", "C", "D", "E"];
const other = ["V", "W", "X", "Y", "Z"];
const withF = ["A", "B", "C", "D", "F"];

describe("computeParticipation", () => {
  it("attribue à chacun les maps et rounds qu'il a réellement joués", () => {
    const match = {
      mapScores: [
        { a: 13, b: 8, lineupA: five, lineupB: other },
        { a: 10, b: 13, lineupA: withF, lineupB: other },
        { a: 13, b: 6, lineupA: withF, lineupB: other },
      ],
      stats: {},
    };
    const p = computeParticipation(match, teamA, teamB);
    expect(p.get("A")).toMatchObject({ side: "A", maps: 3, rounds: 63 });
    expect(p.get("E")).toMatchObject({ maps: 1, rounds: 21, mapIndexes: [0] });
    expect(p.get("F")).toMatchObject({ maps: 2, rounds: 42, mapIndexes: [1, 2] });
    expect(p.get("V")).toMatchObject({ side: "B", maps: 3, rounds: 63 });
  });

  it("ancien match sans lineup : les joueurs des stats ont joué toutes les maps", () => {
    const match = {
      mapScores: [{ a: 13, b: 8 }, { a: 13, b: 11 }],
      stats: { A: { kill: 30 }, V: { kill: 20 } },
    };
    const p = computeParticipation(match, teamA, teamB);
    expect([...p.keys()].sort()).toEqual(["A", "V"]);
    expect(p.get("A")).toMatchObject({ side: "A", maps: 2, rounds: 45 });
    expect(p.get("V").side).toBe("B");
  });

  it("ignore les maps sans score", () => {
    const match = { mapScores: [{ a: 13, b: 8, lineupA: five, lineupB: other }, { a: "", b: "" }], stats: {} };
    expect(computeParticipation(match, teamA, teamB).get("A").maps).toBe(1);
  });
});

describe("resolveLineups / compactLineups", () => {
  it("une map sans lineup reprend celle de la map précédente", () => {
    const resolved = resolveLineups([{ a: 1, b: 2 }, { a: 1, b: 2, lineupA: withF }, { a: 1, b: 2 }], five, other);
    expect(resolved.map((m) => m.lineupA)).toEqual([five, withF, withF]);
    expect(resolved[2].lineupB).toEqual(other);
  });
  it("compactLineups est l'inverse de resolveLineups", () => {
    const input = [{ a: 1, b: 2 }, { a: 1, b: 2, lineupA: withF }, { a: 1, b: 2 }];
    const resolved = resolveLineups(input, five, other);
    expect(compactLineups(resolved, five, other)).toEqual(input);
  });
});

it("substitutionSummary décrit le changement", () => {
  const name = (id) => id;
  expect(substitutionSummary(five, withF, name)).toBe("F remplace E");
  expect(substitutionSummary(five, five, name)).toBe("");
});
