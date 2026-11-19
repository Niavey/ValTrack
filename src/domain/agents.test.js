import { describe, it, expect } from "vitest";
import { computeRole, collectAgentPlays, topAgents } from "./agents.js";
import { canonicalAgent, agentRole } from "./valorant.js";

const plays = (...agents) => agents.map((agent) => ({ agent, role: agentRole(agent) }));
const repeat = (agent, n) => Array.from({ length: n }, () => agent);

describe("agents", () => {
  it("reconnaît un agent quelle que soit l'écriture", () => {
    expect(canonicalAgent(" kayo ")).toBe("KAY/O");
    expect(canonicalAgent("jett")).toBe("Jett");
    expect(agentRole("Viper")).toBe("controller");
    expect(canonicalAgent("NouvelAgent")).toBe("NouvelAgent");
  });
});

describe("computeRole", () => {
  it("majorité de sentinelles → Sentinelle", () => {
    expect(computeRole(plays(...repeat("Killjoy", 8), "Sova", "Jett")).role).toBe("sentinel");
  });

  it("beaucoup de rôles différents → Flex", () => {
    expect(computeRole(plays("Jett", "Sova", "Omen", "Killjoy", "Raze", "Fade", "Viper", "Cypher")).role).toBe("flex");
  });

  it("ex-duelliste qui ne joue plus que smoker depuis un moment → Smoker", () => {
    const history = plays(...repeat("Jett", 60), ...repeat("Omen", 40));
    expect(computeRole(history).role).toBe("controller");
  });

  it("pas assez de maps → pas de rôle", () => {
    expect(computeRole(plays("Jett", "Jett")).role).toBe(null);
  });
});

describe("collectAgentPlays / topAgents", () => {
  const tournament = {
    id: "t", name: "Split", date: "2026-01-01",
    teams: [{ id: "a", name: "DRX", playerIds: ["p1"] }, { id: "b", name: "T1", playerIds: ["p2"] }],
    matches: [{
      id: "m", teamAId: "a", teamBId: "b",
      mapScores: [
        { a: 13, b: 8, map: "Ascent", lineupA: ["p1"], lineupB: ["p2"], agents: { p1: "jett", p2: "Omen" } },
        { a: 9, b: 13, map: "Bind", lineupA: ["p1"], lineupB: ["p2"], agents: { p1: "Raze", p2: "Omen" } },
        { a: 13, b: 3, map: "Haven", lineupA: ["p1"], lineupB: ["p2"], agents: { p1: "Jett" } },
        { a: "", b: "", agents: { p1: "Sage" } },
      ],
    }],
  };
  const all = collectAgentPlays([tournament]);

  it("une ligne par joueur et par map jouée avec agent", () => {
    expect(all).toHaveLength(5);
    expect(all[0]).toMatchObject({ playerId: "p1", agent: "Jett", role: "duelist", mapName: "Ascent", won: true, teamName: "DRX" });
    expect(all.find((p) => p.playerId === "p2" && p.mapName === "Bind").won).toBe(true);
  });

  it("top agents avec maps, part et taux de victoire", () => {
    const top = topAgents(all.filter((p) => p.playerId === "p1"));
    expect(top[0]).toMatchObject({ agent: "Jett", maps: 2, wins: 2 });
    expect(top[0].share).toBeCloseTo(2 / 3);
    expect(top[1]).toMatchObject({ agent: "Raze", maps: 1, winRate: 0 });
  });
});
