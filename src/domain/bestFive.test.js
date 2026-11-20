import { describe, it, expect } from "vitest";
import { computeBestFive } from "./bestFive.js";
import { agentRole } from "./valorant.js";
import { computeAgentDetail, computeAgentOverview } from "./agents.js";

const member = (id, rating, matches = 20) => ({ id, stats: { match: matches, rating } });
const plays = (id, agent, n, orgKey = "org") => Array.from({ length: n }, () => ({ playerId: id, agent, role: agentRole(agent), orgKey }));

describe("Meilleurs 5", () => {
  const members = [
    member("smk", 1.0), member("due1", 1.3), member("due2", 1.25), member("ini", 1.1),
    member("sen", 1.05), member("flex", 1.0), member("rookie", 2.0, 4),
  ];
  const all = [
    ...plays("smk", "Omen", 10), ...plays("due1", "Jett", 10), ...plays("due2", "Raze", 10),
    ...plays("ini", "Sova", 10), ...plays("sen", "Killjoy", 10), ...plays("rookie", "Jett", 10),
    ...["Jett", "Sova", "Omen", "Killjoy", "Raze", "Fade", "Viper", "Cypher"].flatMap((a) => plays("flex", a, 1)),
  ];

  it("un joueur par poste, Flex en priorité à un vrai Flex", () => {
    const { slots } = computeBestFive("org", members, all);
    expect(Object.fromEntries(slots.map((s) => [s.slot, s.member?.id]))).toEqual({
      controller: "smk", duelist: "due1", initiator: "ini", sentinel: "sen", flex: "flex",
    });
  });

  it("sans vrai Flex, le meilleur joueur restant prend le poste Flex", () => {
    const { slots } = computeBestFive("org", members.filter((m) => m.id !== "flex"), all);
    expect(slots.find((s) => s.slot === "flex").member.id).toBe("due2");
  });

  it("moins de 10 matchs avec l'équipe → pas éligible", () => {
    const { slots } = computeBestFive("org", members, all);
    expect(slots.map((s) => s.member?.id)).not.toContain("rookie");
  });

  it("le rôle compté est celui joué dans CETTE équipe", () => {
    const moved = [...plays("due1", "Jett", 10), ...plays("due1", "Omen", 30, "other-org")];
    const { slots } = computeBestFive("org", [member("due1", 1.3)], moved);
    expect(slots.find((s) => s.slot === "duelist").member.id).toBe("due1");
  });

  it("un Flex qui joue surtout un rôle vide prend ce poste, le Flex revient au meilleur restant", () => {
    // cas PRX : Tommy Flex (50 % Initiateur), aucun initiateur ; Forsaken duelliste derrière d4v41
    const prx = [member("mindfreak", 0.99), member("d4v41", 1.21), member("forsaken", 1.2), member("benkai", 1.05), member("tommy", 0.89)];
    const prxPlays = [
      ...plays("mindfreak", "Omen", 10), ...plays("d4v41", "Jett", 10), ...plays("forsaken", "Raze", 10),
      ...plays("benkai", "Killjoy", 10),
      ...plays("tommy", "Sova", 6), ...plays("tommy", "Killjoy", 3), ...plays("tommy", "Reyna", 3),
    ];
    const { slots } = computeBestFive("org", prx, prxPlays);
    expect(Object.fromEntries(slots.map((s) => [s.slot, s.member?.id]))).toEqual({
      controller: "mindfreak", duelist: "d4v41", initiator: "tommy", sentinel: "benkai", flex: "forsaken",
    });
  });

  it("deux Flex permutables : chacun va au poste qu'il joue le plus", () => {
    // cas Team Liquid : Kryptix surtout Killjoy, L1NK surtout Omen, aucun spécialiste smoker/sentinelle
    const liquid = [member("kryptix", 1.08), member("scream", 1.32), member("soulcas", 1.0), member("l1nk", 1.04), member("jamppi", 1.03)];
    const liquidPlays = [
      // les deux jouent smoker ET sentinelle (≥ 25 %) : ils sont candidats aux deux postes
      ...plays("kryptix", "Breach", 2), ...plays("kryptix", "Viper", 4), ...plays("kryptix", "Killjoy", 5),
      ...plays("l1nk", "Breach", 2), ...plays("l1nk", "Killjoy", 4), ...plays("l1nk", "Omen", 5),
      ...plays("scream", "Phoenix", 10), ...plays("soulcas", "Skye", 10), ...plays("jamppi", "Jett", 10),
    ];
    const { slots } = computeBestFive("org", liquid, liquidPlays);
    expect(Object.fromEntries(slots.map((s) => [s.slot, s.member?.id]))).toEqual({
      controller: "l1nk", duelist: "scream", initiator: "soulcas", sentinel: "kryptix", flex: "jamppi",
    });
  });

  it("deux duellistes : le plus polyvalent prend le Flex, le pur duelliste le poste Duelliste", () => {
    // ScreaM : 8 maps de duelliste + 1 Sage ; Jamppi : uniquement Jett
    const liquid = [member("kryptix", 1.08), member("scream", 1.32), member("soulcas", 1.0), member("l1nk", 1.04), member("jamppi", 1.03)];
    const liquidPlays = [
      ...plays("kryptix", "Breach", 2), ...plays("kryptix", "Viper", 4), ...plays("kryptix", "Killjoy", 5),
      ...plays("l1nk", "Breach", 2), ...plays("l1nk", "Killjoy", 4), ...plays("l1nk", "Omen", 5),
      ...plays("scream", "Phoenix", 7), ...plays("scream", "Sage", 1), ...plays("scream", "Reyna", 1),
      ...plays("soulcas", "Skye", 10), ...plays("jamppi", "Jett", 9),
    ];
    const { slots } = computeBestFive("org", liquid, liquidPlays);
    expect(slots.find((s) => s.slot === "duelist").member.id).toBe("jamppi");
    expect(slots.find((s) => s.slot === "flex").member.id).toBe("scream");
  });

  it("poste vide plutôt qu'un faux rôle", () => {
    const { slots } = computeBestFive("org", [member("due1", 1.3), member("due2", 1.2)], all);
    expect(slots.find((s) => s.slot === "controller").member).toBe(null);
  });
});

describe("stats d'un agent", () => {
  const t = {
    id: "t", name: "Split", date: "2026-01-01",
    teams: [{ id: "a", name: "DRX", playerIds: ["p1", "p2"] }, { id: "b", name: "T1", playerIds: ["q1"] }],
    matches: [{
      id: "m", teamAId: "a", teamBId: "b",
      stats: { p1: { rating: 1.4 }, q1: { rating: 0.9 } },
      mapScores: [
        { a: 13, b: 8, map: "Ascent", lineupA: ["p1", "p2"], lineupB: ["q1"], agents: { p1: "Jett", p2: "Omen", q1: "Jett" } },
        { a: 13, b: 9, map: "Bind", lineupA: ["p1", "p2"], lineupB: ["q1"], agents: { p1: "Raze", p2: "Omen", q1: "Jett" } },
        { a: 13, b: 5, map: "Ascent", lineupA: ["p1", "p2"], lineupB: ["q1"] },
      ],
    }],
  };

  it("pick rate par map : une map compte une fois même si les deux équipes le jouent", () => {
    const jett = computeAgentDetail("jett", [t]);
    expect(jett.totalMaps).toBe(2); // la 3e map n'a pas d'agents saisis
    expect(jett.pickRate).toBe(1);
    expect(jett.byMap.find((r) => r.mapName === "Ascent")).toMatchObject({ played: 1, picked: 1 });
    expect(jett.teams.map((x) => [x.name, x.picks])).toEqual([["T1", 2], ["DRX", 1]]);
  });

  it("meilleurs joueurs : Rating du match attribué aux maps jouées sur l'agent", () => {
    const jett = computeAgentDetail("Jett", [t], { minMapsForBestPlayers: 1 });
    expect(jett.players[0]).toMatchObject({ playerId: "p1", maps: 1, rating: 1.4 });
  });

  it("vue d'ensemble triée par pick rate", () => {
    const { agents } = computeAgentOverview([t]);
    expect(agents.slice(0, 2).map((a) => a.agent).sort()).toEqual(["Jett", "Omen"]);
    expect(agents.find((a) => a.agent === "Raze").pickRate).toBe(0.5);
  });
});
