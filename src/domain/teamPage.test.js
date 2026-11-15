import { describe, it, expect } from "vitest";
import { buildTeamPage } from "./teamPage.js";
import { computeTeamElo, orgKeyOf } from "./elo.js";

const P = (id) => ({ id, name: id.toUpperCase() });
const players = ["a", "b", "c", "d", "e", "f", "g", "x"].map(P);
const opp = (id) => ({ id, name: "Opp", playerIds: ["x"] });
const row = (rating, kill) => ({ rating, kill, death: 10, maps: 2, round: 40 });

// "a" joue 2 tournois chez DRX puis part chez T1 ; il garde ses stats DRX séparées
const s1 = {
  id: "s1", name: "Split 1", type: "Split", date: "2025-01-01", finished: true, winnerTeamId: "drx1",
  teams: [{ id: "drx1", name: "DRX", playerIds: ["a", "b", "c", "d", "e"] }, opp("o1")],
  matches: [{ id: "m1", teamAId: "drx1", teamBId: "o1", mapScores: [{ a: 13, b: 5 }, { a: 13, b: 7 }],
    stats: { a: row(1.2, 30), b: row(1.0, 20), x: row(0.8, 15) } }],
};
const s2 = {
  id: "s2", name: "Masters", type: "Masters", date: "2025-06-01",
  teams: [{ id: "drx2", name: "drx ", playerIds: ["a", "b", "c", "d", "f", "g"] }, opp("o2")],
  matches: [{ id: "m2", teamAId: "drx2", teamBId: "o2", mapScores: [{ a: 13, b: 5 }, { a: 13, b: 7 }],
    stats: { a: row(1.0, 20) } }],
};
const s3 = {
  id: "s3", name: "Split 2", type: "Split", date: "2026-01-01",
  teams: [{ id: "drx3", name: "DRX", playerIds: ["b", "c", "d", "f", "g"] }, { id: "t1", name: "T1", playerIds: ["a"] }],
  matches: [{ id: "m3", teamAId: "drx3", teamBId: "t1", mapScores: [{ a: 13, b: 5 }], stats: { a: row(2.0, 40), b: row(1.0, 10) } }],
};
const tournaments = [s1, s2, s3];
const key = orgKeyOf({ name: "DRX" });

describe("page équipe", () => {
  const page = buildTeamPage(key, tournaments, players);

  it("les stats d'un ancien joueur ne comptent que ses matchs avec l'équipe", () => {
    const a = page.former.find((r) => r.id === "a");
    expect(a.stats.match).toBe(2);
    expect(a.stats.kill).toBe(50);
    expect(a.stats.rating).toBeCloseTo(1.1);
    expect(a.since).toBe("2025-01-01");
    expect(a.until).toBe("2025-06-01");
  });

  it("le roster actif vient du dernier tournoi, les autres sont anciens", () => {
    expect(page.active.map((r) => r.id).sort()).toEqual(["b", "c", "d", "f", "g"]);
    expect(page.former.map((r) => r.id).sort()).toEqual(["a", "e"]);
  });

  it("le palmarès garde le roster qui a gagné", () => {
    expect(page.palmares).toHaveLength(1);
    expect(page.palmares[0].playerIds).toContain("e");
    expect(page.former.find((r) => r.id === "e").trophies).toHaveLength(1);
  });

  it("MVP compté seulement dans l'équipe où il a été obtenu", () => {
    expect(page.former.find((r) => r.id === "a").stats.mvp).toBe(2);
  });

  it("une organisation rattachée garde son historique même renommée", () => {
    const withOrg = tournaments.map((t) => ({
      ...t, teams: t.teams.map((team) => (team.id.startsWith("drx") ? { ...team, organizationId: "org_drx", name: t.id === "s3" ? "DRX Academy" : team.name } : team)),
    }));
    const ranking = computeTeamElo(withOrg, undefined, [{ id: "org_drx", name: "DRX" }]);
    const drx = ranking.find((r) => r.key === "org_drx");
    expect(drx.name).toBe("DRX");
    expect(drx.history.filter((h) => h.type === "match")).toHaveLength(3);
  });

  it("un roster corrigé à la main remplace celui du dernier tournoi", () => {
    const ranking = computeTeamElo(tournaments, undefined, [{ id: key, name: "DRX", rosterOverride: ["b", "c", "d", "f", "e"] }]);
    const drx = ranking.find((r) => r.key === key);
    expect(drx.manualRoster).toBe(true);
    expect(drx.roster.map((r) => r.id).sort()).toEqual(["b", "c", "d", "e", "f"]);
  });
});
