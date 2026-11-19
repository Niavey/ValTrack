import { describe, it, expect } from "vitest";
import { classifyMember, classifyClubMembers } from "./legends.js";

const member = ({ since, until, matches, rating, trophies = [], tournaments = 4 }) => ({
  id: Math.random().toString(36), since, until, tournaments, trophies,
  stats: { match: matches, rating, _ratingCount: matches },
});
const TEAM_RATING = 1.0;

describe("Légendes du club (exemples du cahier des charges)", () => {
  it("5 ans, énormément de matchs, Rating 0,98, peu de trophées → Légende (fidélité)", () => {
    const r = classifyMember(member({ since: "2020-01-01", until: "2025-01-01", matches: 220, rating: 0.98, trophies: [{ type: "Split" }] }), TEAM_RATING);
    expect(r.level).toBe("legend");
    expect(r.paths).toContain("longevity");
    expect(r.reasons[0]).toMatch(/^Longévité : 5,0 ans, 220 matchs/);
  });

  it("6 mois, Rating 1,30, 0 trophée → énorme passage mais pas Légende", () => {
    const r = classifyMember(member({ since: "2025-01-01", until: "2025-07-01", matches: 30, rating: 1.3, tournaments: 2 }), TEAM_RATING);
    expect(r.level).toBe("historic");
    expect(r.reasons.some((x) => x.startsWith("Performance"))).toBe(true);
  });

  it("3 ans, excellent Rating, Champions + Masters → Légende évidente", () => {
    const r = classifyMember(member({
      since: "2022-01-01", until: "2025-01-01", matches: 90, rating: 1.15,
      trophies: [{ type: "Champions" }, { type: "Masters" }],
    }), TEAM_RATING);
    expect(r.level).toBe("legend");
    expect(r.paths).toEqual(expect.arrayContaining(["palmares", "combined"]));
  });

  it("un passage court et moyen reste « Ancien joueur »", () => {
    const r = classifyMember(member({ since: "2025-01-01", until: "2025-03-01", matches: 8, rating: 0.95, tournaments: 1 }), TEAM_RATING);
    expect(r.level).toBe("member");
  });

  it("un Masters seul suffit à devenir Figure historique", () => {
    const r = classifyMember(member({ since: "2025-01-01", until: "2025-06-01", matches: 20, rating: 1.0, trophies: [{ type: "Masters" }], tournaments: 2 }), TEAM_RATING);
    expect(r.level).toBe("historic");
  });

  it("la performance ne compte pas sur trop peu de matchs", () => {
    const r = classifyMember(member({ since: "2025-01-01", until: "2025-01-01", matches: 5, rating: 2.0, tournaments: 1 }), TEAM_RATING);
    expect(r.scores.performance).toBe(0);
    expect(r.level).toBe("member");
  });

  it("classe les légendes en premier", () => {
    const list = classifyClubMembers([
      member({ since: "2025-01-01", until: "2025-03-01", matches: 8, rating: 0.95, tournaments: 1 }),
      member({ since: "2020-01-01", until: "2025-01-01", matches: 220, rating: 0.98 }),
    ]);
    expect(list.map((m) => m.legend.level)).toEqual(["legend", "member"]);
  });
});
