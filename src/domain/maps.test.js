import { describe, it, expect } from "vitest";
import { computeMapOverview, computeMapDetail, getVeto } from "./maps.js";
import { setCustomGameData, getAgents, getMaps, agentRole, canonicalAgent } from "./valorant.js";

const teams = [{ id: "a", name: "DRX", playerIds: ["p1"] }, { id: "b", name: "T1", playerIds: ["q1"] }];
// BO3 : DRX bannit Bind, T1 bannit Split, DRX choisit Ascent, T1 choisit Lotus, Haven decider
const vetoMatch = {
  id: "m1", teamAId: "a", teamBId: "b",
  mapScores: [
    { a: 13, b: 8, map: "Ascent", pick: "A", veto: { bans: [{ side: "A", map: "Bind" }, { side: "B", map: "Split" }] }, agents: { p1: "Jett", q1: "Omen" } },
    { a: 9, b: 13, map: "Lotus", pick: "B" },
    { a: 13, b: 11, map: "Haven", pick: "decider" },
  ],
};
// ancien match sans veto : compte dans "jouée", pas dans les % de pick/ban
const oldMatch = { id: "m0", teamAId: "a", teamBId: "b", mapScores: [{ a: 13, b: 3, map: "Ascent" }, { a: 13, b: 5, map: "Bind" }] };
const t = { id: "t", name: "Split", date: "2026-01-01", teams, matches: [oldMatch, vetoMatch] };

describe("veto et stats de maps", () => {
  it("lit le veto d'un match", () => {
    const v = getVeto(vetoMatch);
    expect(v.bans).toHaveLength(2);
    expect(v.picks).toEqual([{ map: "Ascent", by: "A", played: true }, { map: "Lotus", by: "B", played: true }, { map: "Haven", by: "decider", played: true }]);
    expect(getVeto(oldMatch).hasData).toBe(false);
  });

  it("pick / ban / decider rapportés aux matchs avec veto", () => {
    const o = computeMapOverview([t]);
    expect(o.vetoMatches).toBe(1);
    const byMap = Object.fromEntries(o.maps.map((m) => [m.map, m]));
    expect(byMap.Ascent).toMatchObject({ played: 2, picks: 1, pickRate: 1, bans: 0 });
    expect(byMap.Bind).toMatchObject({ played: 1, bans: 1, banRate: 1 });
    expect(byMap.Haven).toMatchObject({ deciders: 1, deciderRate: 1, picks: 0 });
    expect(byMap.Ascent.playRate).toBeCloseTo(2 / 5);
  });

  it("decider non jouée (2-0) : compte en decider, pas en map jouée", () => {
    const sweep = {
      id: "m2", teamAId: "a", teamBId: "b",
      mapScores: [
        { a: 13, b: 5, map: "Ascent", pick: "A", veto: { bans: [{ side: "A", map: "Bind" }], decider: "Pearl" } },
        { a: 13, b: 7, map: "Lotus", pick: "B" },
      ],
    };
    expect(getVeto(sweep).picks.at(-1)).toEqual({ map: "Pearl", by: "decider", played: false });
    const pearl = computeMapOverview([{ ...t, matches: [sweep] }]).maps.find((m) => m.map === "Pearl");
    expect(pearl).toMatchObject({ played: 0, deciders: 1, deciderRate: 1 });
  });

  it("une map jamais jouée apparaît quand même si elle est dans la liste", () => {
    const o = computeMapOverview([t], ["Corrode"]);
    expect(o.maps.find((m) => m.map === "Corrode")).toMatchObject({ played: 0, pickRate: 0 });
  });

  it("fiche d'une map : équipes et agents", () => {
    const d = computeMapDetail("Ascent", [t]);
    expect(d.mostPicked.map((e) => [e.name, e.picks])).toEqual([["DRX", 1]]);
    expect(d.teamRecords.find((e) => e.name === "DRX")).toMatchObject({ played: 2, wins: 2, winRate: 1 });
    expect(d.agents.map((a) => a.agent).sort()).toEqual(["Jett", "Omen"]);
    expect(computeMapDetail("Bind", [t]).mostBanned.map((e) => e.name)).toEqual(["DRX"]);
  });
});

describe("agents et maps ajoutés depuis l'appli", () => {
  it("s'ajoutent aux listes intégrées sans doublon", () => {
    setCustomGameData({ agents: [{ name: "Nova", role: "initiator" }, { name: "jett", role: "sentinel" }], maps: ["Drift", "ascent"] });
    expect(getAgents().some((a) => a.name === "Nova" && a.custom)).toBe(true);
    expect(agentRole("nova")).toBe("initiator");
    expect(canonicalAgent("NOVA")).toBe("Nova");
    expect(agentRole("Jett")).toBe("duelist"); // un agent intégré ne peut pas être redéfini
    expect(getMaps()).toContain("Drift");
    expect(getMaps().filter((m) => m.toLowerCase() === "ascent")).toHaveLength(1);
    setCustomGameData({});
    expect(agentRole("Nova")).toBe(null);
  });
});
