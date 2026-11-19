// Données de jeu : maps et agents. Riot en ajoute régulièrement : complète simplement ces listes.

// Toutes les maps sorties depuis 2021 (ordre alphabétique). "Autre…" permet d'en saisir une
// qui manquerait ici.
export const MAPS = [
  "Abyss", "Ascent", "Bind", "Breeze", "Corrode", "Fracture", "Haven", "Icebox",
  "Lotus", "Pearl", "Split", "Sunset",
];

export const ROLES = {
  duelist: { label: "Duelliste", short: "DUE", color: "#FF4655" },
  controller: { label: "Smoker", short: "SMK", color: "#7FA1C4" },
  initiator: { label: "Initiateur", short: "INI", color: "#4ADE80" },
  sentinel: { label: "Sentinelle", short: "SEN", color: "#E8B95E" },
  flex: { label: "Flex", short: "FLX", color: "#B98CF0" },
};

export const AGENTS = [
  ["Jett", "duelist"], ["Phoenix", "duelist"], ["Reyna", "duelist"], ["Raze", "duelist"],
  ["Yoru", "duelist"], ["Neon", "duelist"], ["Iso", "duelist"], ["Waylay", "duelist"],
  ["Brimstone", "controller"], ["Viper", "controller"], ["Omen", "controller"], ["Astra", "controller"],
  ["Harbor", "controller"], ["Clove", "controller"],
  ["Sova", "initiator"], ["Breach", "initiator"], ["Skye", "initiator"], ["KAY/O", "initiator"],
  ["Fade", "initiator"], ["Gekko", "initiator"], ["Tejo", "initiator"],
  ["Killjoy", "sentinel"], ["Cypher", "sentinel"], ["Sage", "sentinel"], ["Chamber", "sentinel"],
  ["Deadlock", "sentinel"], ["Vyse", "sentinel"], ["Veto", "sentinel"],
].map(([name, role]) => ({ name, role }));

const AGENT_BY_KEY = new Map(AGENTS.map((a) => [agentKey(a.name), a]));

// "kay/o", "KAYO", " jett " → même clé
export function agentKey(name) {
  return String(name || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
}

// Nom officiel si l'agent est connu (corrige la casse), sinon la saisie telle quelle
export function canonicalAgent(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return "";
  return AGENT_BY_KEY.get(agentKey(trimmed))?.name || trimmed;
}

export function agentRole(name) {
  return AGENT_BY_KEY.get(agentKey(name))?.role || null;
}

// clé de l'image d'un agent dans le stockage des logos
export function agentLogoKey(name) {
  return "agent:" + agentKey(name);
}
