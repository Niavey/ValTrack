// Données de jeu : maps et agents.
// Les listes ci-dessous sont intégrées à l'appli ; les agents et maps ajoutés depuis l'appli
// (onglets Agents et Maps) s'y ajoutent au chargement, via setCustomGameData.

// Toutes les maps sorties depuis 2021 (ordre alphabétique).
export const BUILTIN_MAPS = [
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

export const BUILTIN_AGENTS = [
  ["Jett", "duelist"], ["Phoenix", "duelist"], ["Reyna", "duelist"], ["Raze", "duelist"],
  ["Yoru", "duelist"], ["Neon", "duelist"], ["Iso", "duelist"], ["Waylay", "duelist"],
  ["Brimstone", "controller"], ["Viper", "controller"], ["Omen", "controller"], ["Astra", "controller"],
  ["Harbor", "controller"], ["Clove", "controller"],
  ["Sova", "initiator"], ["Breach", "initiator"], ["Skye", "initiator"], ["KAY/O", "initiator"],
  ["Fade", "initiator"], ["Gekko", "initiator"], ["Tejo", "initiator"],
  ["Killjoy", "sentinel"], ["Cypher", "sentinel"], ["Sage", "sentinel"], ["Chamber", "sentinel"],
  ["Deadlock", "sentinel"], ["Vyse", "sentinel"], ["Veto", "sentinel"],
].map(([name, role]) => ({ name, role }));

let customAgents = [];
let customMaps = [];
let AGENT_BY_KEY = new Map();

function rebuild() {
  AGENT_BY_KEY = new Map([...BUILTIN_AGENTS, ...customAgents].map((a) => [agentKey(a.name), a]));
}
rebuild();

// Agents / maps ajoutés depuis l'appli (enregistrés dans Supabase, table game_settings)
export function setCustomGameData({ agents = [], maps = [] } = {}) {
  const builtinAgentKeys = new Set(BUILTIN_AGENTS.map((a) => agentKey(a.name)));
  customAgents = agents
    .filter((a) => a?.name && ROLES[a.role] && a.role !== "flex" && !builtinAgentKeys.has(agentKey(a.name)))
    .map((a) => ({ name: String(a.name).trim(), role: a.role, custom: true }));
  const builtinMapKeys = new Set(BUILTIN_MAPS.map((m) => m.toLowerCase()));
  customMaps = [...new Set(maps.map((m) => String(m || "").trim()).filter((m) => m && !builtinMapKeys.has(m.toLowerCase())))];
  rebuild();
}

export function getAgents() {
  return [...BUILTIN_AGENTS, ...customAgents];
}

export function getMaps() {
  return [...BUILTIN_MAPS, ...customMaps].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
}

export function isCustomMap(name) {
  return customMaps.includes(name);
}

// rétrocompatibilité : listes intégrées
export const MAPS = BUILTIN_MAPS;
export const AGENTS = BUILTIN_AGENTS;

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
