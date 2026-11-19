import { useState, useEffect, useMemo, useRef, useDeferredValue } from "react";
import {
  Search, Plus, Upload, X, ChevronLeft, Crosshair,
  Trash2, ArrowUp, ArrowDown, Swords, Loader2, Pencil, UserCog, ListPlus,
  Trophy, Award, Image as ImageIcon, Globe, Users, Crown, Flame, GitCompare, Shield, UserX, Map as MapIcon,
} from "lucide-react";
import "flag-icons/css/flag-icons.min.css";
import { isSupabaseConfigured, supabase } from "./supabaseClient";
import {
  loadValtrackData, upsertPlayerDb, upsertPlayersDb, deletePlayerDb,
  upsertTournamentDb, upsertTeamDb, upsertMatchDb, setMatchAppliedDb,
  setTeamLogoDb, setHiddenTeamDb, upsertOrganizationDb, saveGameSettingDb, migrateLegacySnapshotDb, readLegacyWindowStorage, loadTeamLogosDb,
} from "./valtrackDb";
import { computeMvpMjCounts, collectMatchRecords, collectMatchDurationRecords, validRecordEntries, pickBest, pickWorst } from "./domain/records.js";
import { ELO_MAX, ELO_START, computeTeamElo, computePlayerElo, orgKeyOf, orgNames } from "./domain/elo.js";
import { buildTeamPage, clubStatusesForPlayer } from "./domain/teamPage.js";
import { LEGEND_LEVELS } from "./domain/legends.js";
import { ROLES, canonicalAgent, agentRole, agentLogoKey, getAgents, getMaps, setCustomGameData, isCustomMap } from "./domain/valorant.js";
import { computeMapOverview, computeMapDetail } from "./domain/maps.js";
import { collectAgentPlays, playerAgentProfile, roleLabel, topAgents as topAgentsOf, computeAgentOverview, computeAgentDetail, AGENT_STATS_CONFIG } from "./domain/agents.js";
import { computeBestFive, BEST_FIVE_CONFIG } from "./domain/bestFive.js";
import { computeParticipation, resolveLineups, compactLineups, isPlayedMap, substitutionSummary } from "./domain/participation.js";
import { DEFAULT_DATA_FILTERS, tournamentYear, normalizedTeamName, filterTournamentScope, eligiblePlayerIdsForFilters, trimTournamentStatsForFilters, buildFilteredLeaderboardPlayers } from "./domain/filters.js";
import { uid, num, round, normalizeHeader, COUNTRIES, STAT_FIELDS, HEADLINE_KEYS, RECORD_FIELDS, DETAIL_STAT_FIELDS, STAT_LABELS, MATCH_INPUT_FIELDS, RANK_ASCENDING, TROPHY_TYPES, TROPHY_RANK, TROPHY_COLOR, FORM_INPUT_FIELDS, computeMatchDerived, computeDerived, mapRow, emptyStats, fmtStat, evolutionColor, currentTeam, isFreeAgent, transferPlayer, teamPeriodLabel, statCompareAsc, getLogo, getRank, countryLabel, migratePlayer, migrateTournament, applyMatchToStats, removeMatchFromStats, resetAverageCounts } from "./domain/stats.js";

const STORAGE_KEY = "vt_players_v2";
const TOURNAMENTS_KEY = "vt_tournaments_v1";
const HIDDEN_TEAMS_KEY = "vt_hidden_teams_v1";

function CountryFlag({ code, style = {} }) {
  if (!code || code.length !== 2) return null;
  return (
    <span
      className={`fi fi-${code.toLowerCase()}`}
      style={{
        display: "inline-block",
        width: "1.35em",
        height: "1em",
        borderRadius: 2,
        flexShrink: 0,
        ...style,
      }}
    />
  );
}

// pressing Enter moves to the next input in the same table/group instead of submitting or doing nothing
function focusNextInput(e) {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const container = e.currentTarget.closest("table") || e.currentTarget.closest(".vt-input-flow");
  if (!container) return;
  const inputs = Array.from(container.querySelectorAll("input"));
  const idx = inputs.indexOf(e.currentTarget);
  if (idx > -1 && idx < inputs.length - 1) inputs[idx + 1].focus();
}

// ---------- style block (design system) ----------
const Styles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap');

    .vt-root {
      --void: #0A0E13;
      --panel: #10161E;
      --panel-raised: #171F29;
      --line: rgba(255,255,255,0.08);
      --red: #FF4655;
      --red-dim: rgba(255,70,85,0.14);
      --gold: #E8B95E;
      --silver: #B9C4CE;
      --bronze: #C77B4B;
      --steel: #7FA1C4;
      --text: #ECEFF3;
      --text-dim: #8792A0;
      --green: #4ADE80;
      font-family: 'Inter', sans-serif;
      background: var(--void);
      color: var(--text);
      min-height: 100vh;
      background-image:
        linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
      background-size: 32px 32px;
    }
    .vt-display { font-family: 'Rajdhani', sans-serif; letter-spacing: 0.01em; }
    .vt-mono { font-family: 'JetBrains Mono', monospace; }

    .vt-cut {
      clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
    }
    .vt-cut-sm {
      clip-path: polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px);
    }
    .vt-panel {
      background: var(--panel);
      border: 1px solid var(--line);
    }
    .vt-btn {
      font-family: 'Rajdhani', sans-serif;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      font-size: 13px;
      padding: 9px 16px;
      background: var(--panel-raised);
      border: 1px solid var(--line);
      color: var(--text);
      cursor: pointer;
      transition: border-color .15s ease, color .15s ease;
      display: inline-flex; align-items: center; gap: 8px;
    }
    .vt-btn:hover { border-color: var(--steel); color: #fff; }
    .vt-btn-primary {
      background: var(--red);
      border-color: var(--red);
      color: #180508;
    }
    .vt-btn-primary:hover { border-color: var(--red); color: #180508; filter: brightness(1.08); }
    .vt-input, .vt-select {
      background: var(--void);
      border: 1px solid var(--line);
      color: var(--text);
      padding: 8px 12px;
      font-family: 'Inter', sans-serif;
      font-size: 14px;
      outline: none;
    }
    .vt-input:focus, .vt-select:focus { border-color: var(--steel); }
    .vt-label {
      font-family: 'Rajdhani', sans-serif;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-size: 11px;
      color: var(--text-dim);
    }
    .vt-th {
      font-family: 'Rajdhani', sans-serif;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      font-size: 12px;
      color: var(--text-dim);
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
    }
    .vt-th:hover { color: var(--text); }
    .vt-row:hover { background: rgba(255,255,255,0.03); }
    .vt-ping {
      width: 7px; height: 7px; border-radius: 50%;
      background: var(--red);
      box-shadow: 0 0 0 0 rgba(255,70,85,0.6);
      animation: vt-pulse 1.8s infinite;
    }
    @keyframes vt-pulse {
      0% { box-shadow: 0 0 0 0 rgba(255,70,85,0.55); }
      70% { box-shadow: 0 0 0 8px rgba(255,70,85,0); }
      100% { box-shadow: 0 0 0 0 rgba(255,70,85,0); }
    }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .vt-medal-1 { color: var(--gold); }
    .vt-medal-2 { color: var(--silver); }
    .vt-medal-3 { color: var(--bronze); }
    .vt-scroll::-webkit-scrollbar { height: 6px; width: 6px; }
    .vt-scroll::-webkit-scrollbar-thumb { background: var(--line); }
    .vt-overlay {
      position: fixed; inset: 0; background: rgba(6,8,11,0.75);
      display: flex; align-items: center; justify-content: center;
      z-index: 50; padding: 16px;
      backdrop-filter: blur(2px);
    }
    .vt-flag-row {
      position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
      font-size: 40px; line-height: 1; opacity: 0.16; pointer-events: none;
      -webkit-mask-image: radial-gradient(circle, black 0%, transparent 72%);
      mask-image: radial-gradient(circle, black 0%, transparent 72%);
    }
    .vt-flag-header {
      position: absolute; right: -6px; top: 50%; transform: translateY(-50%);
      font-size: 128px; line-height: 1; opacity: 0.14; pointer-events: none;
      -webkit-mask-image: radial-gradient(circle, black 0%, transparent 70%);
      mask-image: radial-gradient(circle, black 0%, transparent 70%);
    }
    .vt-logo { width: 20px; height: 20px; object-fit: contain; border-radius: 3px; flex-shrink: 0; }
    .vt-logo-lg { width: 40px; height: 40px; object-fit: contain; border-radius: 5px; flex-shrink: 0; background: var(--panel-raised); border: 1px solid var(--line); }
    .vt-logo-upload {
      display: inline-flex; align-items: center; justify-content: center;
      width: 28px; height: 28px; cursor: pointer; color: var(--text-dim);
      background: var(--panel-raised); border: 1px solid var(--line); flex-shrink: 0;
    }
    .vt-logo-upload:hover { color: var(--text); border-color: var(--steel); }
    .vt-trophy-pill {
      display: inline-flex; align-items: center; gap: 6px;
      background: var(--red-dim); border: 1px solid var(--gold); padding: 6px 10px;
    }
  `}</style>
);

// ---------- small UI atoms ----------
function RankBadge({ rank }) {
  if (!rank || rank > 3) return null;
  const cls = rank === 1 ? "vt-medal-1" : rank === 2 ? "vt-medal-2" : "vt-medal-3";
  return (
    <span className={cls + " vt-display"} style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 11, fontWeight: 700, marginLeft: 6 }}>
      <Award size={11} /> #{rank}
    </span>
  );
}

function StatCard({ label, value, accent, rank }) {
  return (
    <div className="vt-panel vt-cut-sm" style={{ padding: "14px 16px", minWidth: 110 }}>
      <div className="vt-label" style={{ display: "flex", alignItems: "center" }}>{label}<RankBadge rank={rank} /></div>
      <div className="vt-mono vt-display" style={{ fontSize: 26, fontWeight: 600, color: accent || "var(--text)" }}>
        {value}
      </div>
    </div>
  );
}

function TeamLogoUpload({ team, teamLogos, onSetLogo, size = "sm" }) {
  const ref = useRef(null);
  const logo = getLogo(teamLogos, team);
  const handleChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !team) return;
    onSetLogo(team, file);
    e.target.value = "";
  };
  return (
    <>
      <button
        type="button"
        className="vt-logo-upload"
        title={logo ? "Changer le logo" : "Ajouter un logo"}
        onClick={() => ref.current?.click()}
        disabled={!team}
        style={{ opacity: team ? 1 : 0.4, cursor: team ? "pointer" : "not-allowed" }}
      >
        {logo ? <img src={logo} className={size === "lg" ? "vt-logo-lg" : "vt-logo"} alt="" /> : <ImageIcon size={14} />}
      </button>
      <input ref={ref} type="file" accept="image/*" style={{ display: "none" }} onChange={handleChange} />
    </>
  );
}

function TrophySection({ player, onUpdate }) {
  const [type, setType] = useState(TROPHY_TYPES[0]);
  const [detail, setDetail] = useState("");
  const trophies = [...(player.trophies || [])].sort((a, b) => (TROPHY_RANK[b.type] ?? 0) - (TROPHY_RANK[a.type] ?? 0));

  const add = () => {
    onUpdate({ ...player, trophies: [...(player.trophies || []), { id: uid(), type, detail: detail.trim() }] });
    setDetail("");
  };
  const remove = (id) => onUpdate({ ...player, trophies: (player.trophies || []).filter((t) => t.id !== id) });

  return (
    <div style={{ marginBottom: 22 }}>
      <div className="vt-label" style={{ marginBottom: 8 }}>Trophées</div>
      {trophies.length === 0 ? (
        <div className="vt-panel vt-cut-sm" style={{ padding: 16, color: "var(--text-dim)", fontSize: 14, marginBottom: 10 }}>Aucun trophée pour le moment.</div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          {trophies.map((t) => {
            const c = TROPHY_COLOR[t.type] || TROPHY_COLOR.Autre;
            return (
              <div key={t.id} className="vt-trophy-pill vt-cut-sm" style={{ borderColor: c }}>
                <Trophy size={14} color={c} />
                <span className="vt-display" style={{ fontSize: 13, fontWeight: 600, color: c }}>{t.type}{t.detail ? " — " + t.detail : ""}</span>
                <button onClick={() => remove(t.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: 0, display: "flex" }}><X size={12} /></button>
              </div>
            );
          })}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select className="vt-select" value={type} onChange={(e) => setType(e.target.value)}>
          {TROPHY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input className="vt-input" style={{ flex: "1 1 160px" }} placeholder="Détail (ex : Madrid 2024, EMEA)" value={detail} onChange={(e) => setDetail(e.target.value)} />
        <button className="vt-btn vt-cut-sm" onClick={add}><Plus size={14} /> Ajouter</button>
      </div>
    </div>
  );
}

function SortHeader({ field, sortKey, sortDir, onClick, align = "right" }) {
  const active = sortKey === field.key;
  return (
    <th className="vt-th" style={{ padding: "10px 14px", textAlign: align }} onClick={() => onClick(field.key)}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {field.label}
        {active && (sortDir === "desc" ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
      </span>
    </th>
  );
}

function ModalShell({ title, onClose, children, wide }) {
  return (
    <div className="vt-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="vt-panel vt-cut vt-scroll" style={{ width: "100%", maxWidth: wide ? 680 : 460, maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--line)" }}>
          <h2 className="vt-display" style={{ fontSize: 20, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em" }}>{title}</h2>
          <button className="vt-btn vt-cut-sm" style={{ padding: 6 }} onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="vt-label" style={{ marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}

function NationalitySelect({ value, onChange }) {
  const isKnown = !value || COUNTRIES.some((c) => c[0] === value);
  const [custom, setCustom] = useState(!isKnown);
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      {!custom ? (
        <select className="vt-select" style={{ width: "100%" }} value={value} onChange={(e) => {
          if (e.target.value === "__custom") { setCustom(true); return; }
          onChange(e.target.value);
        }}>
          <option value="">— Non renseignée —</option>
          {COUNTRIES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          <option value="__custom">Autre (code ISO personnalisé)…</option>
        </select>
      ) : (
        <input
          className="vt-input vt-mono"
          style={{ width: "100%", textTransform: "uppercase" }}
          maxLength={2}
          placeholder="Code ISO, ex : FR"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
        />
      )}
      {value && <CountryFlag code={value} style={{ width: 30, height: 20 }} />}
    </div>
  );
}

// Statut "agent libre" : volontairement différent d'un logo (pointillés, icône barrée)
function FreeAgentIcon({ size = 20 }) {
  return (
    <span title="Agent libre" style={{
      width: size, height: size, flexShrink: 0, borderRadius: "50%", border: "1px dashed var(--gold)",
      color: "var(--gold)", display: "inline-flex", alignItems: "center", justifyContent: "center",
    }}>
      <UserX size={Math.round(size * 0.6)} />
    </span>
  );
}

function FreeAgentBadge() {
  return (
    <span className="vt-label" style={{ color: "var(--gold)", border: "1px dashed var(--gold)", padding: "1px 6px", display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
      <UserX size={10} /> Agent libre
    </span>
  );
}

// ---------- player creation ----------
function PlayerFormModal({ onClose, onSave }) {
  const [name, setName] = useState("");
  const [nationality, setNationality] = useState("");
  const [team, setTeam] = useState("");
  const [stats, setStats] = useState(emptyStats());
  const setField = (k) => (e) => setStats((s) => ({ ...s, [k]: e.target.value }));

  return (
    <ModalShell title="Nouveau joueur" onClose={onClose} wide>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Nom du joueur *">
          <input className="vt-input" style={{ width: "100%" }} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Équipe actuelle">
          <input className="vt-input" style={{ width: "100%" }} value={team} onChange={(e) => setTeam(e.target.value)} />
        </Field>
      </div>
      <Field label="Nationalité">
        <NationalitySelect value={nationality} onChange={setNationality} />
      </Field>

      <div className="vt-label" style={{ margin: "14px 0 8px" }}>Stats (facultatif à la création)</div>
      <div className="vt-input-flow" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {FORM_INPUT_FIELDS.map((f) => (
          <Field key={f.key} label={f.label}>
            <input type="number" step="any" className="vt-input vt-mono" style={{ width: "100%" }} value={stats[f.key]} onChange={setField(f.key)} onKeyDown={focusNextInput} />
          </Field>
        ))}
      </div>
      <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 4 }}>
        KD, KDA, KD Diff, FK Diff et Clutch % sont calculés automatiquement.
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <button className="vt-btn vt-cut-sm" onClick={onClose}>Annuler</button>
        <button
          className="vt-btn vt-btn-primary vt-cut-sm"
          onClick={() => {
            if (!name.trim()) return;
            onSave({
              id: uid(), name: name.trim(), nationality,
              teamHistory: team.trim() ? [{ id: uid(), team: team.trim(), since: "" }] : [],
              trophies: [],
              stats: computeDerived(stats),
            });
          }}
        >
          Créer
        </button>
      </div>
    </ModalShell>
  );
}

// ---------- profile edit: name, nationality, team history ----------
function ProfileEditModal({ player, teamLogos, onSetLogo, onClose, onSave }) {
  const [name, setName] = useState(player.name);
  const [nationality, setNationality] = useState(player.nationality || "");
  const [history, setHistory] = useState(player.teamHistory || []);
  const [newTeam, setNewTeam] = useState("");
  const [newSince, setNewSince] = useState("");

  const today = () => new Date().toISOString().slice(0, 10);
  // Transfert : l'équipe en cours est automatiquement clôturée, un joueur n'a qu'un club à la fois
  const withTransfer = (h, team, since) => [
    ...h.map((e) => (e.until ? e : { ...e, until: since || today() })),
    { id: uid(), team, since: since || today(), until: "" },
  ];
  const addEntry = () => {
    if (!newTeam.trim()) return;
    setHistory((h) => withTransfer(h, newTeam.trim(), newSince.trim()));
    setNewTeam(""); setNewSince("");
  };
  const releasePlayer = () => setHistory((h) => h.map((e) => (e.until ? e : { ...e, until: today() })));
  const freeAgent = history.length > 0 && Boolean(history[history.length - 1].until);
  const removeEntry = (id) => setHistory((h) => h.filter((e) => e.id !== id));
  const updateEntry = (id, field, value) => setHistory((h) => h.map((e) => (e.id === id ? { ...e, [field]: value } : e)));

  return (
    <ModalShell title={`Modifier le profil — ${player.name}`} onClose={onClose} wide>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Nom du joueur *">
          <input className="vt-input" style={{ width: "100%" }} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Nationalité">
          <NationalitySelect value={nationality} onChange={setNationality} />
        </Field>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, margin: "16px 0 8px", flexWrap: "wrap" }}>
        <div className="vt-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          Historique d'équipes {freeAgent && <FreeAgentBadge />}
        </div>
        {history.some((e) => !e.until) && (
          <button type="button" className="vt-btn vt-cut-sm" style={{ padding: "4px 9px", fontSize: 11 }} onClick={releasePlayer} title="Clôture son équipe actuelle aujourd'hui">
            <UserX size={12} /> Rendre agent libre
          </button>
        )}
      </div>
      {history.length === 0 && <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 10 }}>Aucune équipe enregistrée.</div>}
      {history.map((e, i) => {
        const isCurrent = i === history.length - 1 && !e.until;
        return (
          <div key={e.id} className="vt-panel vt-cut-sm" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", marginBottom: 6, gap: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <TeamLogoUpload team={e.team} teamLogos={teamLogos} onSetLogo={onSetLogo} />
              <span className="vt-display" style={{ fontWeight: 600 }}>{e.team}</span>
              {isCurrent && <span className="vt-label" style={{ color: "var(--red)" }}>Actuelle</span>}
              <input
                className="vt-input" style={{ width: 100, fontSize: 12, padding: "5px 8px" }}
                placeholder="Depuis" value={e.since} onChange={(ev) => updateEntry(e.id, "since", ev.target.value)}
              />
              <span style={{ color: "var(--text-dim)", fontSize: 12 }}>→</span>
              <input
                className="vt-input" style={{ width: 100, fontSize: 12, padding: "5px 8px" }}
                placeholder="Jusqu'à" value={e.until || ""} onChange={(ev) => updateEntry(e.id, "until", ev.target.value)}
              />
            </div>
            <button className="vt-btn vt-cut-sm" style={{ padding: "4px 8px" }} onClick={() => removeEntry(e.id)}><Trash2 size={12} /></button>
          </div>
        );
      })}

      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
        <TeamLogoUpload team={newTeam} teamLogos={teamLogos} onSetLogo={onSetLogo} />
        <input className="vt-input" style={{ flex: "2 1 160px" }} placeholder="Nom de l'équipe" value={newTeam} onChange={(e) => setNewTeam(e.target.value)} />
        <input className="vt-input" style={{ flex: "1 1 120px" }} placeholder="Depuis (ex : 2024, Jan. 2024)" value={newSince} onChange={(e) => setNewSince(e.target.value)} />
        <button className="vt-btn vt-cut-sm" onClick={addEntry}><Plus size={14} /> Transférer</button>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 6 }}>
        Ajouter une équipe = transfert : l'équipe actuelle est clôturée à la même date et le joueur
        quitte automatiquement le roster actif de son ancien club. « Rendre agent libre » clôture son
        équipe sans lui en donner une nouvelle. Les tournois déjà joués ne changent pas.
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
        <button className="vt-btn vt-cut-sm" onClick={onClose}>Annuler</button>
        <button
          className="vt-btn vt-btn-primary vt-cut-sm"
          onClick={() => {
            if (!name.trim()) return;
            // if the user typed a team but never clicked "Ajouter", include it anyway
            const finalHistory = newTeam.trim() ? withTransfer(history, newTeam.trim(), newSince.trim()) : history;
            onSave({ ...player, name: name.trim(), nationality, teamHistory: finalHistory });
          }}
        >
          Enregistrer
        </button>
      </div>
    </ModalShell>
  );
}

// ---------- raw stats correction (overwrite every field) ----------
function StatsCorrectionModal({ player, onClose, onSave }) {
  const [stats, setStats] = useState(player.stats);
  const setField = (k) => (e) => setStats((s) => ({ ...s, [k]: e.target.value }));
  return (
    <ModalShell title={`Corriger les valeurs — ${player.name}`} onClose={onClose} wide>
      <p style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 12 }}>
        Écrase directement chaque valeur — utile après un import ou pour corriger une erreur.
        KD, KDA, KD Diff, FK Diff et Clutch % sont recalculés automatiquement, pas besoin de les saisir.
      </p>
      <div className="vt-input-flow" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {FORM_INPUT_FIELDS.map((f) => (
          <Field key={f.key} label={f.label}>
            <input type="number" step="any" className="vt-input vt-mono" style={{ width: "100%" }} value={stats[f.key]} onChange={setField(f.key)} onKeyDown={focusNextInput} />
          </Field>
        ))}
      </div>
      <div className="vt-label" style={{ margin: "16px 0 8px" }}>Détail multi-kills & clutches</div>
      <div className="vt-input-flow" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {DETAIL_STAT_FIELDS.map((f) => (
          <Field key={f.key} label={f.label}>
            <input type="number" step="1" min="0" className="vt-input vt-mono" style={{ width: "100%" }} value={stats[f.key] ?? ""} onChange={setField(f.key)} onKeyDown={focusNextInput} />
          </Field>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <button className="vt-btn vt-cut-sm" onClick={onClose}>Annuler</button>
        <button className="vt-btn vt-btn-primary vt-cut-sm" onClick={() => onSave({ ...player, stats: computeDerived(resetAverageCounts(stats, player.stats)) })}>Enregistrer</button>
      </div>
    </ModalShell>
  );
}

// ---------- add a match: enter raw numbers, totals/averages recomputed ----------
function AddMatchModal({ player, onClose, onSave }) {
  const [form, setForm] = useState(Object.fromEntries(MATCH_INPUT_FIELDS.map((k) => [k, ""])));
  const setField = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const labels = STAT_LABELS;

  return (
    <ModalShell title={`Ajouter un match — ${player.name}`} onClose={onClose} wide>
      <p style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 12 }}>
        Entre les chiffres de ce match : les totaux (Kill, Death, Round…) s'additionnent, et
        ACS / Rating / KAST deviennent une moyenne pondérée par le nombre de matchs joués. KD, KDA,
        KD Diff, FK Diff et Clutch % sont recalculés automatiquement.
      </p>
      <div className="vt-input-flow" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {MATCH_INPUT_FIELDS.map((k) => (
          <Field key={k} label={labels[k]}>
            <input type="number" step="any" className="vt-input vt-mono" style={{ width: "100%" }} value={form[k]} onChange={setField(k)} onKeyDown={focusNextInput} />
          </Field>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <button className="vt-btn vt-cut-sm" onClick={onClose}>Annuler</button>
        <button
          className="vt-btn vt-btn-primary vt-cut-sm"
          onClick={() => onSave({ ...player, prevStats: player.stats, stats: applyMatchToStats(player.stats, form) })}
        >
          Ajouter et recalculer
        </button>
      </div>
    </ModalShell>
  );
}

// ---------- connexion (Supabase Auth) ----------
function LoginModal({ onClose }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (authError) setError(authError.message);
    else onClose();
  };

  return (
    <ModalShell title="Connexion" onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Email">
          <input type="email" className="vt-input" style={{ width: "100%" }} value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
        </Field>
        <Field label="Mot de passe">
          <input type="password" className="vt-input" style={{ width: "100%" }} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 10 }}>
          Le compte se crée dans Supabase (Authentication → Users). Une fois les règles de
          sécurité activées, seul un compte connecté peut modifier les données.
        </div>
        {error && <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 10 }}>{error}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="vt-btn vt-cut-sm" onClick={onClose}>Annuler</button>
          <button type="submit" className="vt-btn vt-btn-primary vt-cut-sm" disabled={busy}>{busy ? "Connexion…" : "Se connecter"}</button>
        </div>
      </form>
    </ModalShell>
  );
}

function ImportModal({ onClose, onImport }) {
  const [status, setStatus] = useState(null);
  const fileRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    setStatus("parsing");
    const ext = file.name.split(".").pop().toLowerCase();

    if (ext === "csv") {
      // chargé seulement quand on importe : allège le premier affichage de l'appli
      const { default: Papa } = await import("papaparse");
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const rows = results.data.map(mapRow).filter((r) => r.name);
          onImport(rows);
          setStatus({ ok: true, count: rows.length });
        },
        error: () => setStatus({ ok: false }),
      });
      return;
    }

    if (["ods", "xlsx", "xls"].includes(ext)) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const XLSX = await import("xlsx");
          const wb = XLSX.read(e.target.result, { type: "array" });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const raw = XLSX.utils.sheet_to_json(sheet, { defval: "" });
          const rows = raw.map(mapRow).filter((r) => r.name);
          onImport(rows);
          setStatus({ ok: true, count: rows.length });
        } catch {
          setStatus({ ok: false });
        }
      };
      reader.onerror = () => setStatus({ ok: false });
      reader.readAsArrayBuffer(file);
      return;
    }

    setStatus({ ok: false, unsupported: true });
  };

  return (
    <ModalShell title="Importer un tableur" onClose={onClose} wide>
      <p style={{ color: "var(--text-dim)", fontSize: 14, marginBottom: 14, lineHeight: 1.5 }}>
        Fichier .ods, .xlsx ou .csv avec <strong>une ligne par joueur</strong>. Colonnes reconnues,
        dans n'importe quel ordre : Joueur, Équipe, Nationalité, Match, Maps, Round, Rating, ACS,
        KDA, KD, Kill, Death, Assist, KAST, FK, FD, KD Diff, FK Diff, Clutch, Clutch Attempt,
        Clutch %. Si un joueur existe déjà (même nom), ses valeurs sont écrasées par celles du
        fichier, et un changement d'équipe est ajouté à son historique.
      </p>
      <div
        className="vt-cut-sm"
        style={{ border: "1px dashed var(--line)", padding: 28, textAlign: "center", cursor: "pointer" }}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]); }}
      >
        <Upload size={22} style={{ marginBottom: 8, color: "var(--steel)" }} />
        <div className="vt-label">Glisse ton fichier .ods, .xlsx ou .csv ici, ou clique pour parcourir</div>
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.ods" style={{ display: "none" }} onChange={(e) => handleFile(e.target.files?.[0])} />
      </div>
      {status === "parsing" && <div style={{ marginTop: 12, color: "var(--text-dim)", fontSize: 13 }}>Lecture du fichier…</div>}
      {status?.ok && <div style={{ marginTop: 12, color: "var(--steel)", fontSize: 13 }}>{status.count} joueur(s) importé(s)/mis à jour.</div>}
      {status?.ok === false && !status.unsupported && <div style={{ marginTop: 12, color: "var(--red)", fontSize: 13 }}>Le fichier n'a pas pu être lu.</div>}
      {status?.unsupported && <div style={{ marginTop: 12, color: "var(--red)", fontSize: 13 }}>Format non reconnu — utilise un .ods, .xlsx ou .csv.</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
        <button className="vt-btn vt-cut-sm" onClick={onClose}>Fermer</button>
      </div>
    </ModalShell>
  );
}

function PlayerSortHeader({ sortKey, sortDir, onClick }) {
  let icon = null;
  if (sortKey === "name") icon = sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
  else if (sortKey === "nationality") icon = <Globe size={12} />;
  return (
    <th className="vt-th" style={{ padding: "10px 14px", textAlign: "left" }} onClick={() => onClick("name")} title="Clique pour changer le tri : A→Z, puis Z→A, puis par nationalité">
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>Joueur {icon}</span>
    </th>
  );
}



function DataFiltersPanel({ filters, onChange, tournaments }) {
  const years = useMemo(() => [...new Set((tournaments || []).map(tournamentYear).filter(Boolean))].sort((a, b) => b.localeCompare(a)), [tournaments]);
  const tournamentOptions = useMemo(() => [...(tournaments || [])].sort((a, b) => {
    const dateCmp = String(b.date || "").localeCompare(String(a.date || ""));
    return dateCmp || a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
  }), [tournaments]);
  const teams = useMemo(() => {
    const names = new Map();
    (tournaments || []).forEach((t) => (t.teams || []).forEach((team) => {
      const key = normalizedTeamName(team.name);
      if (key && !names.has(key)) names.set(key, team.name);
    }));
    return [...names.values()].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
  }, [tournaments]);

  const update = (patch) => onChange({ ...filters, ...patch });
  const toggleType = (type) => update({ types: { ...filters.types, [type]: !filters.types?.[type] } });

  return (
    <div className="vt-panel vt-cut" style={{ padding: 14, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div className="vt-label">Filtres</div>
        <button className="vt-btn vt-cut-sm" style={{ padding: "5px 9px", fontSize: 11 }} onClick={() => onChange({ ...DEFAULT_DATA_FILTERS, types: { ...DEFAULT_DATA_FILTERS.types } })}>
          Réinitialiser
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, alignItems: "end" }}>
        <Field label="Rounds minimum">
          <input
            type="number"
            min="0"
            step="1"
            className="vt-input vt-mono"
            style={{ width: "100%" }}
            placeholder="0"
            value={filters.minRounds}
            onChange={(e) => update({ minRounds: e.target.value })}
          />
        </Field>

        <Field label="Type de tournoi">
          <div className="vt-panel vt-cut-sm" style={{ display: "flex", gap: 10, minHeight: 38, alignItems: "center", padding: "7px 10px", flexWrap: "wrap" }}>
            {["Split", "Masters", "Champions"].map((type) => (
              <label key={type} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>
                <input type="checkbox" checked={filters.types?.[type] !== false} onChange={() => toggleType(type)} />
                {type}
              </label>
            ))}
          </div>
        </Field>

        <Field label="Année">
          <select className="vt-select" style={{ width: "100%" }} value={filters.year} onChange={(e) => update({ year: e.target.value })}>
            <option value="all">Toutes</option>
            {years.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </Field>

        <Field label="Tournoi précis">
          <select className="vt-select" style={{ width: "100%" }} value={filters.tournamentId} onChange={(e) => update({ tournamentId: e.target.value })}>
            <option value="all">Tous les tournois</option>
            {tournamentOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>

        <Field label="Équipe">
          <select className="vt-select" style={{ width: "100%" }} value={filters.team} onChange={(e) => update({ team: e.target.value })}>
            <option value="all">Toutes les équipes</option>
            {teams.map((team) => <option key={team} value={team}>{team}</option>)}
          </select>
        </Field>
      </div>
    </div>
  );
}

// ---------- leaderboard ----------
function Leaderboard({ players, onOpenPlayer, query, sortKey, sortDir, onSort, teamLogos }) {
  const deferredQuery = useDeferredValue(query);
  const rows = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();
    const filtered = normalizedQuery
      ? players.filter((p) => p.name.toLowerCase().includes(normalizedQuery))
      : players;
    return [...filtered].sort((a, b) => {
      let compareAsc;
      if (sortKey === "name") {
        compareAsc = a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
      } else if (sortKey === "nationality") {
        const an = countryLabel(a.nationality) || "\uffff";
        const bn = countryLabel(b.nationality) || "\uffff";
        compareAsc = an.localeCompare(bn, "fr", { sensitivity: "base" });
        if (compareAsc === 0) compareAsc = num(b.stats.rating) - num(a.stats.rating);
      } else {
        compareAsc = statCompareAsc(a, b, sortKey);
      }
      return sortDir === "asc" ? compareAsc : -compareAsc;
    });
  }, [players, sortKey, sortDir, deferredQuery]);

  if (players.length === 0) {
    return (
      <div className="vt-panel vt-cut" style={{ padding: 48, textAlign: "center", color: "var(--text-dim)" }}>
        <Crosshair size={28} style={{ marginBottom: 10, opacity: 0.6 }} />
        <div className="vt-display" style={{ fontSize: 20, color: "var(--text)", marginBottom: 6 }}>Aucun joueur pour le moment</div>
        <div style={{ fontSize: 14 }}>Ajoute un joueur ou importe ton tableur pour démarrer le suivi.</div>
      </div>
    );
  }

  return (
    <div className="vt-panel vt-cut vt-scroll" style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1550 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--line)" }}>
            <th className="vt-th" style={{ padding: "10px 14px", textAlign: "left" }}>#</th>
            <PlayerSortHeader sortKey={sortKey} sortDir={sortDir} onClick={onSort} />
            {STAT_FIELDS.map((f) => (
              <SortHeader key={f.key} field={f} sortKey={sortKey} sortDir={sortDir} onClick={onSort} />
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((player, i) => {
            const rank = i + 1;
            const medal = rank === 1 ? "vt-medal-1" : rank === 2 ? "vt-medal-2" : rank === 3 ? "vt-medal-3" : "";
            const logo = getLogo(teamLogos, currentTeam(player));
            return (
              <tr key={player.id} className="vt-row" style={{ borderBottom: "1px solid var(--line)", cursor: "pointer", contentVisibility: "auto", containIntrinsicSize: "48px" }} onClick={() => onOpenPlayer(player.id)}>
                <td className={"vt-display vt-mono " + medal} style={{ padding: "12px 14px", fontSize: 18, fontWeight: 700 }}>{rank}</td>
                <td style={{ padding: "12px 14px", position: "relative", overflow: "hidden" }}>
                  {player.nationality && <span className="vt-flag-row"><CountryFlag code={player.nationality} style={{ width: 46, height: 32 }} /></span>}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, position: "relative" }}>
                    {rank === 1 && <span className="vt-ping" title="Meilleur sur cette colonne" />}
                    {logo ? <img src={logo} className="vt-logo" alt="" /> : isFreeAgent(player) && <FreeAgentIcon />}
                    <div>
                      <div className="vt-display" style={{ fontWeight: 600, fontSize: 15 }}>{player.name}</div>
                      {currentTeam(player) ? <div style={{ fontSize: 12, color: "var(--text-dim)" }}>{currentTeam(player)}</div> : isFreeAgent(player) && <div style={{ fontSize: 12, color: "var(--gold)", whiteSpace: "nowrap" }}>Agent libre</div>}
                    </div>
                  </div>
                </td>
                {STAT_FIELDS.map((f) => (
                  <td key={f.key} className="vt-mono" style={{ padding: "12px 14px", textAlign: "right", color: evolutionColor(player, f) || "var(--text)" }}>
                    {fmtStat(player.stats[f.key], f)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Image d'un agent : téléversée par toi (même stockage que les logos), sinon case vide en
// pointillés à la couleur du rôle. Cliquer dessus permet d'ajouter / changer l'image.
function AgentIcon({ agent, teamLogos, onSetLogo, size = 36 }) {
  const ref = useRef(null);
  const key = agentLogoKey(agent);
  const image = teamLogos[key];
  return (
    <>
      <button
        type="button" title={onSetLogo ? (image ? `${agent} — changer l'image` : `${agent} — ajouter une image`) : agent}
        onClick={(e) => { e.stopPropagation(); if (onSetLogo) ref.current?.click(); }}
        style={{
          width: size, height: size, flexShrink: 0, padding: 0, cursor: onSetLogo ? "pointer" : "default",
          background: image ? "var(--panel-raised)" : "transparent", border: image ? "1px solid var(--line)" : "1px dashed var(--line)",
          display: "inline-flex", alignItems: "center", justifyContent: "center", overflow: "hidden", color: "var(--text-dim)",
        }}
      >
        {image ? <img src={image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <ImageIcon size={Math.round(size * 0.4)} />}
      </button>
      {onSetLogo && (
        <input ref={ref} type="file" accept="image/*" style={{ display: "none" }}
          onChange={(e) => { const file = e.target.files?.[0]; if (file) onSetLogo(key, file); e.target.value = ""; }} />
      )}
    </>
  );
}

// Tête de l'agent si une image a été ajoutée, sinon son nom (pour rester lisible)
function AgentFace({ agent, teamLogos, size = 28 }) {
  const image = teamLogos[agentLogoKey(agent)];
  if (!image) return <span className="vt-display" style={{ fontWeight: 600, fontSize: 13 }}>{agent}</span>;
  return <img src={image} alt={agent} title={agent} style={{ width: size, height: size, objectFit: "cover", border: "1px solid var(--line)", flexShrink: 0 }} />;
}

function RoleBadge({ role }) {
  if (!role) return null;
  const info = ROLES[role];
  return (
    <span className="vt-label" style={{ color: info.color, whiteSpace: "nowrap" }}>{info.label}</span>
  );
}

function PlayerAgents({ profile, teamLogos, onSetLogo }) {
  const { top, role, plays } = profile;
  return (
    <div style={{ marginBottom: 22 }}>
      <div className="vt-label" style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
        Agents {role.role && <RoleBadge role={role.role} />}
        <span style={{ textTransform: "none", letterSpacing: 0 }}>· {plays.length} map{plays.length > 1 ? "s" : ""} avec agent</span>
      </div>
      {top.length === 0 ? (
        <div className="vt-panel vt-cut-sm" style={{ padding: 16, color: "var(--text-dim)", fontSize: 14 }}>
          Aucun agent saisi pour l'instant (bouton « Compo & agents » sur chaque map d'un match).
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
          {top.map((a, i) => (
            <div key={a.agent} className="vt-panel vt-cut-sm" style={{ padding: 12, display: "flex", alignItems: "center", gap: 12 }}>
              <AgentIcon agent={a.agent} teamLogos={teamLogos} onSetLogo={onSetLogo} size={44} />
              <div style={{ minWidth: 0 }}>
                <div className="vt-display" style={{ fontWeight: 700, fontSize: 16 }}>
                  <span style={{ color: "var(--text-dim)", marginRight: 6 }}>#{i + 1}</span>
                  {teamLogos[agentLogoKey(a.agent)] ? null : a.agent}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
                  {a.maps} map{a.maps > 1 ? "s" : ""} · {Math.round(a.share * 100)} % · {Math.round(a.winRate * 100)} % de victoires
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {role.role && (
        <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 6 }}>
          Rôle déduit de ses agents, les maps récentes comptant davantage :{" "}
          {Object.entries(role.shares).sort((x, y) => y[1] - x[1]).map(([r, share]) => `${roleLabel(r)} ${Math.round(share * 100)} %`).join(" · ")}
        </div>
      )}
    </div>
  );
}

// ---------- Elo individuel : derniers changements ----------
function EloHistory({ history }) {
  if (!history.length) return null;
  const recent = [...history].reverse().slice(0, 10);
  return (
    <div style={{ marginBottom: 22 }}>
      <div className="vt-label" style={{ marginBottom: 8 }}>Historique Elo</div>
      <div className="vt-panel vt-cut" style={{ padding: 4 }}>
        {recent.map((h, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 16px", borderBottom: i < recent.length - 1 ? "1px solid var(--line)" : "none" }}>
            <div style={{ fontSize: 13 }}>
              {h.type === "trophy" ? (
                <span style={{ color: TROPHY_COLOR[h.tournamentType] || TROPHY_COLOR.Autre }}>
                  <Trophy size={12} style={{ display: "inline", marginRight: 5 }} />{h.tournamentType} — {h.tournamentName} ({h.teamName})
                </span>
              ) : (
                <>
                  <span style={{ color: h.result === "W" ? "var(--green)" : "var(--red)", fontWeight: 700, marginRight: 6 }}>{h.result}</span>
                  {h.teamName} vs {h.opponentName}
                  <span style={{ color: "var(--text-dim)" }}> — {h.tournamentName} · {h.matchLabel}</span>
                  {h.participation < 1 && <span style={{ color: "var(--text-dim)", fontSize: 11 }}> · participation ×{h.participation.toFixed(2)}</span>}
                </>
              )}
            </div>
            <div className="vt-mono" style={{ display: "flex", gap: 12, flexShrink: 0, fontSize: 12 }}>
              <span style={{ fontWeight: 700, color: h.delta >= 0 ? "var(--green)" : "var(--red)" }}>{h.delta >= 0 ? "+" : ""}{Math.round(h.delta)}</span>
              <span style={{ color: "var(--text-dim)", width: 40, textAlign: "right" }}>{Math.round(h.eloAfter)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- player detail ----------
function PlayerDetail({ player, players, tournaments, teamLogos, onSetLogo, agentProfile, eloHistory = [], clubStatuses = [], onOpenTeam, onAddMatch, onEditProfile, onCorrectStats, onDeletePlayer, onUpdate, onBack }) {
  const [tab, setTab] = useState("profile");
  const [compareOpen, setCompareOpen] = useState(false);
  const history = [...(player.teamHistory || [])].reverse();
  const logo = getLogo(teamLogos, currentTeam(player));
  return (
    <div>
      <button className="vt-btn vt-cut-sm" style={{ marginBottom: 16 }} onClick={onBack}>
        <ChevronLeft size={15} /> Classement
      </button>

      <div className="vt-panel vt-cut" style={{ position: "relative", overflow: "hidden", padding: "20px 22px", marginBottom: 18 }}>
        {player.nationality && <span className="vt-flag-header"><CountryFlag code={player.nationality} style={{ width: 120, height: 80 }} /></span>}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12, position: "relative" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
            {logo ? <img src={logo} className="vt-logo-lg" alt="" style={{ marginTop: 4 }} /> : isFreeAgent(player) && <span style={{ marginTop: 4 }}><FreeAgentIcon size={40} /></span>}
            <div>
              <h1 className="vt-display" style={{ fontSize: 32, fontWeight: 700, textTransform: "uppercase" }}>{player.name}</h1>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                {currentTeam(player) ? <span style={{ color: "var(--steel)", fontSize: 14 }}>{currentTeam(player)}</span> : isFreeAgent(player) && <FreeAgentBadge />}
                {player.nationality && <span style={{ fontSize: 13, color: "var(--text-dim)", display: "inline-flex", alignItems: "center", gap: 6 }}><CountryFlag code={player.nationality} /> {countryLabel(player.nationality)}</span>}
              </div>
              {clubStatuses.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                  {clubStatuses.map((c) => {
                    const info = LEGEND_LEVELS[c.level];
                    return (
                      <button key={c.teamKey} type="button" title={c.reasons.join(" · ")} onClick={() => onOpenTeam?.(c.teamKey)} className="vt-cut-sm"
                        style={{ background: "var(--panel-raised)", border: `1px solid ${info.color}`, color: info.color, padding: "3px 8px", fontSize: 11, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "'Rajdhani', sans-serif", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                        {c.level === "legend" && <Crown size={11} />}{info.label} — {c.teamName}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="vt-btn vt-btn-primary vt-cut-sm" onClick={onAddMatch}><ListPlus size={14} /> Ajouter un match</button>
            <button className="vt-btn vt-cut-sm" onClick={() => setCompareOpen(true)}><GitCompare size={14} /> Comparer</button>
            <button className="vt-btn vt-cut-sm" onClick={onEditProfile}><UserCog size={14} /> Profil</button>
            <button className="vt-btn vt-cut-sm" onClick={onCorrectStats}><Pencil size={14} /> Corriger</button>
            <button className="vt-btn vt-cut-sm" onClick={onDeletePlayer} title="Supprimer le joueur"><Trash2 size={14} /></button>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        <button
          className="vt-btn vt-cut-sm"
          style={{ background: tab === "profile" ? "var(--panel-raised)" : "var(--panel)", borderColor: tab === "profile" ? "var(--steel)" : "var(--line)" }}
          onClick={() => setTab("profile")}
        >
          Profil
        </button>
        <button
          className="vt-btn vt-cut-sm"
          style={{ background: tab === "records" ? "var(--panel-raised)" : "var(--panel)", borderColor: tab === "records" ? "var(--steel)" : "var(--line)" }}
          onClick={() => setTab("records")}
        >
          <Flame size={14} /> Records
        </button>
      </div>

      {tab === "records" ? (
        <PlayerRecordsSection player={player} tournaments={tournaments} players={players} />
      ) : (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 22 }}>
            {HEADLINE_KEYS.map((k) => {
              const f = STAT_FIELDS.find((x) => x.key === k);
              return (
                <StatCard
                  key={k}
                  label={f.label}
                  value={fmtStat(player.stats[k], f)}
                  accent={k === "rating" ? "var(--red)" : k === "clutchPct" ? "var(--gold)" : k === "mvp" ? "var(--gold)" : k === "mj" ? "var(--steel)" : undefined}
                  rank={getRank(players, k, player.id)}
                />
              );
            })}
          </div>

          {agentProfile && <PlayerAgents profile={agentProfile} teamLogos={teamLogos} onSetLogo={onSetLogo} />}

          <TrophySection player={player} onUpdate={onUpdate} />

          <EloHistory history={eloHistory} />

          <div className="vt-label" style={{ marginBottom: 8 }}>Autres stats</div>
          <div className="vt-panel vt-cut" style={{ padding: 4, marginBottom: 22 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
              {STAT_FIELDS.filter((f) => !HEADLINE_KEYS.includes(f.key)).map((f) => (
                <div key={f.key} style={{ padding: "14px 16px", borderBottom: "1px solid var(--line)" }}>
                  <div className="vt-label" style={{ display: "flex", alignItems: "center" }}>{f.label}<RankBadge rank={getRank(players, f.key, player.id)} /></div>
                  <div className="vt-mono" style={{ fontSize: 17, marginTop: 3 }}>{fmtStat(player.stats[f.key], f)}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginBottom: 22 }}>
            <div className="vt-panel vt-cut-sm" style={{ padding: 16 }}>
              <div className="vt-label" style={{ marginBottom: 12 }}>Détail des multi-kills</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 14 }}>
                <div>Double <strong className="vt-mono" style={{ float: "right" }}>{num(player.stats.doubleKill)}</strong></div>
                <div>Triple <strong className="vt-mono" style={{ float: "right" }}>{num(player.stats.tripleKill)}</strong></div>
                <div>Quad <strong className="vt-mono" style={{ float: "right" }}>{num(player.stats.quadKill)}</strong></div>
                <div>Ace <strong className="vt-mono" style={{ float: "right" }}>{num(player.stats.ace)}</strong></div>
              </div>
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--line)", display: "flex", justifyContent: "space-between" }}>
                <span className="vt-label">Total Multi Kill</span>
                <strong className="vt-mono">{num(player.stats.multiKill)}</strong>
              </div>
            </div>

            <div className="vt-panel vt-cut-sm" style={{ padding: 16 }}>
              <div className="vt-label" style={{ marginBottom: 12 }}>Détail des clutches gagnés</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 14 }}>
                <div>1v1 <strong className="vt-mono" style={{ float: "right" }}>{num(player.stats.clutch1v1)}</strong></div>
                <div>1v2 <strong className="vt-mono" style={{ float: "right" }}>{num(player.stats.clutch1v2)}</strong></div>
                <div>1v3 <strong className="vt-mono" style={{ float: "right" }}>{num(player.stats.clutch1v3)}</strong></div>
                <div>1v4 <strong className="vt-mono" style={{ float: "right" }}>{num(player.stats.clutch1v4)}</strong></div>
                <div>1v5 <strong className="vt-mono" style={{ float: "right" }}>{num(player.stats.clutch1v5)}</strong></div>
              </div>
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--line)", display: "flex", justifyContent: "space-between" }}>
                <span className="vt-label">Total Clutch</span>
                <strong className="vt-mono">{num(player.stats.clutch)}</strong>
              </div>
            </div>
          </div>

          <div className="vt-label" style={{ marginBottom: 8 }}>Historique d'équipes</div>
          {history.length === 0 ? (
            <div className="vt-panel vt-cut-sm" style={{ padding: 20, color: "var(--text-dim)", fontSize: 14 }}>Aucune équipe enregistrée.</div>
          ) : (
            <div className="vt-panel vt-cut" style={{ padding: 4 }}>
              {history.map((e, i) => {
                const eLogo = getLogo(teamLogos, e.team);
                const isCurrent = i === 0 && !e.until;
                const impliedUntil = i > 0 ? history[i - 1].since : "";
                const label = teamPeriodLabel(e, isCurrent, impliedUntil);
                return (
                  <div key={e.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: i < history.length - 1 ? "1px solid var(--line)" : "none" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {eLogo && <img src={eLogo} className="vt-logo" alt="" />}
                      <span className="vt-display" style={{ fontWeight: 600, fontSize: 15 }}>{e.team}</span>
                      {label && <span style={{ color: "var(--text-dim)", fontSize: 13, marginLeft: 4 }}>{label}</span>}
                    </div>
                    {isCurrent && <span className="vt-label" style={{ color: "var(--red)" }}>Actuelle</span>}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {compareOpen && <ComparePlayersModal basePlayer={player} players={players} onClose={() => setCompareOpen(false)} />}
    </div>
  );
}

// ==================== tournaments ====================

function TeamModal({ team, players, organizations = [], organizationsEnabled = false, suggestRoster, isCurrentTournament = false, onClose, onSave, onCreatePlayer }) {
  const isEdit = !!team;
  const [name, setName] = useState(team?.name || "");
  // "auto" = l'organisation qui porte ce nom (créée si elle n'existe pas encore)
  const [orgChoice, setOrgChoice] = useState(team?.organizationId || "auto");
  const sortedOrgs = [...organizations].sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));
  const autoOrg = organizations.find((o) => normalizedTeamName(o.name) === normalizedTeamName(name));

  const save = () => {
    if (!name.trim()) return;
    const base = { id: team?.id || uid(), name: name.trim(), playerIds: selectedIds, eliminated: team?.eliminated || false };
    if (!organizationsEnabled) { onSave({ ...base, organizationId: team?.organizationId || null }); return; }
    if (orgChoice !== "auto") { onSave({ ...base, organizationId: orgChoice }); return; }
    if (autoOrg) { onSave({ ...base, organizationId: autoOrg.id }); return; }
    const created = { id: "org_" + uid(), name: name.trim(), rosterOverride: null };
    onSave({ ...base, organizationId: created.id }, created);
  };
  const [playerIds, setPlayerIds] = useState(team?.playerIds || []);
  // Nouvelle équipe : tant que la sélection n'a pas été touchée, on reprend le roster actif de
  // l'équipe existante (même organisation ou même nom).
  const [touched, setTouched] = useState(Boolean(team));
  const suggestion = !touched && suggestRoster && name.trim()
    ? suggestRoster(name.trim(), orgChoice !== "auto" ? orgChoice : null)
    : null;
  const selectedIds = touched ? playerIds : (suggestion?.ids || []);
  const [search, setSearch] = useState("");
  const [newPlayerName, setNewPlayerName] = useState("");

  const toggle = (id) => {
    setPlayerIds(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
    setTouched(true);
  };

  const createAndAdd = () => {
    if (!newPlayerName.trim()) return;
    const p = onCreatePlayer(newPlayerName.trim());
    setPlayerIds([...selectedIds, p.id]);
    setTouched(true);
    setNewPlayerName("");
  };

  const filtered = players.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <ModalShell title={isEdit ? `Modifier l'équipe — ${team.name}` : "Nouvelle équipe"} onClose={onClose} wide>
      <Field label="Nom de l'équipe *">
        <input className="vt-input" style={{ width: "100%" }} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      {organizationsEnabled && (
        <Field label="Organisation">
          <select className="vt-select" style={{ width: "100%" }} value={orgChoice} onChange={(e) => setOrgChoice(e.target.value)}>
            <option value="auto">{autoOrg ? `Automatique : ${autoOrg.name}` : "Automatique : nouvelle organisation avec ce nom"}</option>
            {sortedOrgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 4 }}>
            Choisis une organisation existante si l'équipe a changé de nom : elle garde alors son historique.
          </div>
        </Field>
      )}

      <div className="vt-label" style={{ margin: "14px 0 8px" }}>Créer un nouveau joueur et l'ajouter</div>
      <div style={{ display: "flex", gap: 8 }}>
        <input className="vt-input" style={{ flex: 1 }} placeholder="Nom du joueur" value={newPlayerName} onChange={(e) => setNewPlayerName(e.target.value)} />
        <button className="vt-btn vt-cut-sm" onClick={createAndAdd}><Plus size={14} /> Créer</button>
      </div>

      <div className="vt-label" style={{ margin: "16px 0 8px" }}>Composition ({selectedIds.length} joueur{selectedIds.length > 1 ? "s" : ""})</div>
      {suggestion?.ids.length > 0 && (
        <div style={{ fontSize: 12, color: "var(--steel)", marginBottom: 8 }}>
          Roster actif de {suggestion.teamName} repris automatiquement — coche ou décoche pour l'ajuster.
        </div>
      )}
      {isCurrentTournament && (
        <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 8 }}>
          Tournoi le plus récent : les joueurs cochés seront rattachés à cette équipe sur leur profil
          (transfert automatique s'ils étaient ailleurs ou agents libres).
        </div>
      )}
      <input className="vt-input" style={{ width: "100%", marginBottom: 8 }} placeholder="Rechercher un joueur…" value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="vt-panel vt-cut-sm vt-scroll" style={{ maxHeight: 220, overflowY: "auto" }}>
        {filtered.length === 0 && <div style={{ padding: 14, color: "var(--text-dim)", fontSize: 13 }}>Aucun joueur.</div>}
        {filtered.map((p) => (
          <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderBottom: "1px solid var(--line)", cursor: "pointer" }}>
            <input type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => toggle(p.id)} />
            <span className="vt-display" style={{ fontSize: 14 }}>{p.name}</span>
            {currentTeam(p) ? <span style={{ fontSize: 12, color: "var(--text-dim)" }}>({currentTeam(p)})</span> : isFreeAgent(p) && <span style={{ fontSize: 12, color: "var(--gold)" }}>(agent libre)</span>}
          </label>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
        <button className="vt-btn vt-cut-sm" onClick={onClose}>Annuler</button>
        <button
          className="vt-btn vt-btn-primary vt-cut-sm"
          onClick={save}
        >
          {isEdit ? "Enregistrer" : "Créer l'équipe"}
        </button>
      </div>
    </ModalShell>
  );
}

function CreateTournamentModal({ onClose, onSave }) {
  const [name, setName] = useState("");
  const [type, setType] = useState(TROPHY_TYPES[0]);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [groups, setGroups] = useState(false);
  const [doubleElim, setDoubleElim] = useState(false);

  return (
    <ModalShell title="Nouveau tournoi" onClose={onClose}>
      <Field label="Nom du tournoi *">
        <input className="vt-input" style={{ width: "100%" }} value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="ex : Champions 2026" />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Type">
          <select className="vt-select" style={{ width: "100%" }} value={type} onChange={(e) => setType(e.target.value)}>
            {TROPHY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Date">
          <input type="date" className="vt-input" style={{ width: "100%" }} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <div className="vt-label" style={{ margin: "14px 0 8px" }}>Format</div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer" }}>
        <input type="checkbox" checked={groups} onChange={(e) => setGroups(e.target.checked)} />
        <span style={{ fontSize: 14 }}>Phase de poules</span>
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
        <input type="checkbox" checked={doubleElim} onChange={(e) => setDoubleElim(e.target.checked)} />
        <span style={{ fontSize: 14 }}>Play-offs à double élimination</span>
      </label>
      <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 8 }}>
        Ces cases sont juste des étiquettes affichées sur le tournoi — tu ajoutes ensuite les matchs
        toi-même, poules comme play-offs, avec l'étiquette de ton choix. La date sert à classer les
        tournois dans la liste, même ajoutés dans le désordre.
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <button className="vt-btn vt-cut-sm" onClick={onClose}>Annuler</button>
        <button
          className="vt-btn vt-btn-primary vt-cut-sm"
          onClick={() => { if (name.trim()) onSave({ id: uid(), name: name.trim(), type, date, format: { groups, doubleElim }, teams: [], matches: [], winnerTeamId: null, finished: false }); }}
        >
          Créer
        </button>
      </div>
    </ModalShell>
  );
}

function EditTournamentModal({ tournament, onClose, onSave }) {
  const [name, setName] = useState(tournament.name);
  const [type, setType] = useState(tournament.type);
  const [date, setDate] = useState(tournament.date || "");
  const [groups, setGroups] = useState(tournament.format.groups);
  const [doubleElim, setDoubleElim] = useState(tournament.format.doubleElim);
  const [winnerTeamId, setWinnerTeamId] = useState(tournament.winnerTeamId || "");

  return (
    <ModalShell title={`Modifier — ${tournament.name}`} onClose={onClose}>
      <Field label="Nom du tournoi *">
        <input className="vt-input" style={{ width: "100%" }} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Type">
          <select className="vt-select" style={{ width: "100%" }} value={type} onChange={(e) => setType(e.target.value)}>
            {TROPHY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Date">
          <input type="date" className="vt-input" style={{ width: "100%" }} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <div className="vt-label" style={{ margin: "14px 0 8px" }}>Format</div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer" }}>
        <input type="checkbox" checked={groups} onChange={(e) => setGroups(e.target.checked)} />
        <span style={{ fontSize: 14 }}>Phase de poules</span>
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
        <input type="checkbox" checked={doubleElim} onChange={(e) => setDoubleElim(e.target.checked)} />
        <span style={{ fontSize: 14 }}>Play-offs à double élimination</span>
      </label>

      {tournament.finished && (
        <Field label="Équipe gagnante">
          <select className="vt-select" style={{ width: "100%" }} value={winnerTeamId} onChange={(e) => setWinnerTeamId(e.target.value)}>
            {tournament.teams.filter((t) => !t.eliminated || t.id === winnerTeamId).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 4 }}>
            Changer le vainqueur met à jour automatiquement les trophées des joueurs concernés.
          </div>
        </Field>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <button className="vt-btn vt-cut-sm" onClick={onClose}>Annuler</button>
        <button
          className="vt-btn vt-btn-primary vt-cut-sm"
          onClick={() => {
            if (!name.trim()) return;
            onSave({ name: name.trim(), type, date, format: { groups, doubleElim }, ...(tournament.finished ? { winnerTeamId: winnerTeamId || null } : {}) });
          }}
        >
          Enregistrer
        </button>
      </div>
    </ModalShell>
  );
}

// stats entered per player, excluding maps/round which are now derived once from the map scores
const TOURNAMENT_PLAYER_FIELDS = MATCH_INPUT_FIELDS.filter((k) => k !== "maps" && k !== "round");

// nom de la map : liste des maps connues + saisie libre ("Autre…")
function MapNameInput({ value, onChange }) {
  const known = !value || getMaps().includes(value);
  const [custom, setCustom] = useState(!known);
  if (custom) {
    return (
      <input className="vt-input" style={{ width: 110, padding: "7px 8px" }} placeholder="Nom de la map" value={value}
        onChange={(e) => onChange(e.target.value)} onBlur={() => { if (!value) setCustom(false); }} autoFocus={!value} />
    );
  }
  return (
    <select className="vt-select" style={{ width: 110, padding: "7px 8px", color: value ? undefined : "var(--text-dim)" }} value={value}
      onChange={(e) => { if (e.target.value === "__other") { setCustom(true); onChange(""); } else onChange(e.target.value); }}>
      <option value="">Map ?</option>
      {getMaps().map((name) => <option key={name} value={name}>{name}</option>)}
      <option value="__other">Autre…</option>
    </select>
  );
}

function RosterPicker({ team, players, selected, onToggle, hint }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 6 }}>
        {hint ?? <>Effectif de {team.playerIds.length} joueurs — sélectionne les 5 qui commencent le match.
        Les remplacements se règlent ensuite map par map (bouton « Compo »).</>}
      </div>
      <div className="vt-panel vt-cut-sm" style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: 8 }}>
        {team.playerIds.map((id) => {
          const p = players.find((x) => x.id === id);
          if (!p) return null;
          const on = selected.includes(id);
          return (
            <button
              type="button"
              key={id}
              onClick={() => onToggle(id)}
              className="vt-cut-sm"
              style={{
                padding: "5px 10px", fontSize: 12, cursor: "pointer",
                border: "1px solid " + (on ? "var(--red)" : "var(--line)"),
                background: on ? "var(--red-dim)" : "var(--panel-raised)",
                color: on ? "var(--text)" : "var(--text-dim)",
              }}
            >
              {p.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AddTournamentMatchModal({ tournament, players, existingMatch, usualAgents = new Map(), teamLogos = {}, onClose, onSave }) {
  const isEdit = !!existingMatch;
  const wasApplied = existingMatch?.appliedToStats || false;

  const [label, setLabel] = useState(existingMatch?.label || "");
  const [teamAId, setTeamAId] = useState(existingMatch?.teamAId || tournament.teams[0]?.id || "");
  const [teamBId, setTeamBId] = useState(existingMatch?.teamBId || tournament.teams[1]?.id || "");
  const [winnerTeamId, setWinnerTeamId] = useState(existingMatch?.winnerTeamId || "");
  const [applyToStats, setApplyToStats] = useState(isEdit ? wasApplied : true);
  const [saveError, setSaveError] = useState("");

  const teamA = tournament.teams.find((t) => t.id === teamAId);
  const teamB = tournament.teams.find((t) => t.id === teamBId);
  const aExceeds = (teamA?.playerIds.length || 0) > 5;
  const bExceeds = (teamB?.playerIds.length || 0) > 5;

  // Composition de départ : les 5 qui commencent. Les maps suivantes la reprennent, sauf
  // remplacement saisi sur une map (qui vaut alors aussi pour les maps d'après).
  const defaultStarters = (team) => ((team?.playerIds.length || 0) <= 5 ? (team?.playerIds || []) : []);
  const initialStarters = (team, side) => {
    if (!existingMatch) return defaultStarters(team);
    const first = (existingMatch.mapScores || []).find((m) => Array.isArray(m[`lineup${side}`]));
    if (first) return first[`lineup${side}`];
    // ancien match : les joueurs ayant des stats
    return Object.keys(existingMatch.stats || {}).filter((id) => team?.playerIds.includes(id));
  };
  const [startersA, setStartersA] = useState(() => initialStarters(teamA, "A"));
  const [startersB, setStartersB] = useState(() => initialStarters(teamB, "B"));
  const [mapScores, setMapScores] = useState(() => (existingMatch?.mapScores?.length
    ? compactLineups(existingMatch.mapScores, initialStarters(teamA, "A"), initialStarters(teamB, "B"))
    : [{ a: "", b: "" }]));
  const [openLineup, setOpenLineup] = useState(null);
  // veto : bans des deux équipes (rangés sur la 1re map à l'enregistrement) + pick de chaque map
  const [bans, setBans] = useState(() => existingMatch?.mapScores?.[0]?.veto?.bans || []);
  const setBan = (idx, field, value) => setBans((list) => list.map((b, i) => (i === idx ? { ...b, [field]: value } : b)));
  const [rows, setRows] = useState(() => {
    if (!existingMatch) return {};
    const out = {};
    Object.entries(existingMatch.stats).forEach(([pid, vals]) => {
      out[pid] = Object.fromEntries(TOURNAMENT_PLAYER_FIELDS.map((k) => [k, vals[k] ?? ""]));
    });
    return out;
  });

  const toggleId = (ids, id) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  const toggleA = (id) => setStartersA((ids) => toggleId(ids, id));
  const toggleB = (id) => setStartersB((ids) => toggleId(ids, id));

  // changer d'équipe remet à zéro la compo de ce camp (départ + remplacements par map)
  const changeTeam = (side, id) => {
    const team = tournament.teams.find((t) => t.id === id);
    if (side === "A") { setTeamAId(id); setStartersA(defaultStarters(team)); }
    else { setTeamBId(id); setStartersB(defaultStarters(team)); }
    setMapScores((rows) => rows.map(({ [`lineup${side}`]: _drop, ...rest }) => rest));
  };

  const resolvedMaps = resolveLineups(mapScores, startersA, startersB);
  const toggleMapLineup = (idx, side, id) => setMapScores((rows) => rows.map((r, i) => (
    i === idx ? { ...r, [`lineup${side}`]: toggleId(resolvedMaps[idx][`lineup${side}`], id) } : r
  )));
  const resetMapLineup = (idx) => setMapScores((rows) => rows.map((r, i) => {
    if (i !== idx) return r;
    const { lineupA: _a, lineupB: _b, ...rest } = r;
    return rest;
  }));

  // joueurs ayant joué au moins une map (ou la compo de départ tant qu'aucun score n'est saisi)
  const playedResolved = resolvedMaps.filter(isPlayedMap);
  const lineupMaps = playedResolved.length ? playedResolved : [{ lineupA: startersA, lineupB: startersB }];
  const rosterIds = Array.from(new Set([...lineupMaps.flatMap((m) => m.lineupA), ...lineupMaps.flatMap((m) => m.lineupB)]));
  const roster = rosterIds.map((id) => players.find((p) => p.id === id)).filter(Boolean);
  const participation = computeParticipation({ mapScores: resolvedMaps, stats: {} }, teamA, teamB);
  const nameOf = (id) => players.find((p) => p.id === id)?.name || "?";

  const setMapScore = (idx, side, value) => setMapScores((rows) => rows.map((r, i) => i === idx ? { ...r, [side]: value } : r));
  const setMapAgent = (idx, playerId, value) => setMapScores((rows) => rows.map((r, i) => (
    i === idx ? { ...r, agents: { ...(r.agents || {}), [playerId]: value } } : r
  )));
  const fillMapAgents = (idx, pick) => setMapScores((rows) => rows.map((r, i) => {
    if (i !== idx) return r;
    const ids = [...resolvedMaps[idx].lineupA, ...resolvedMaps[idx].lineupB];
    const agents = { ...(r.agents || {}) };
    ids.forEach((id) => { if (!agents[id]) { const a = pick(id); if (a) agents[id] = a; } });
    return { ...r, agents };
  }));
  const copyPreviousAgents = (idx) => fillMapAgents(idx, (id) => mapScores[idx - 1]?.agents?.[id] || "");
  const openMapPanel = (idx) => {
    if (openLineup === idx) { setOpenLineup(null); return; }
    // ouverture d'une map sans agents : on reprend ceux de la map précédente (visibles, modifiables)
    const hasAgents = Object.values(mapScores[idx].agents || {}).some(Boolean);
    if (idx > 0 && !hasAgents && Object.values(mapScores[idx - 1].agents || {}).some(Boolean)) copyPreviousAgents(idx);
    setOpenLineup(idx);
  };
  const addMapRow = () => setMapScores((rows) => [...rows, { a: "", b: "" }]);
  const removeMapRow = (idx) => setMapScores((rows) => rows.filter((_, i) => i !== idx));

  const totalMaps = mapScores.filter((m) => m.a !== "" || m.b !== "").length;
  const totalRounds = mapScores.reduce((sum, m) => sum + num(m.a) + num(m.b), 0);

  const alreadyApplied = isEdit && wasApplied;

  const setCell = (playerId, field) => (e) => {
    setRows((r) => ({ ...r, [playerId]: { ...(r[playerId] || {}), [field]: e.target.value } }));
  };

  const labels = STAT_LABELS;

  return (
    <ModalShell title={`${isEdit ? "Modifier le match" : "Ajouter un match"} — ${tournament.name}`} onClose={onClose} wide>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12 }}>
        <Field label="Étiquette *">
          <input className="vt-input" style={{ width: "100%" }} placeholder='ex : "Poule A - J1", "Demi-finale"' value={label} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <Field label="Équipe A">
          <select className="vt-select" style={{ width: "100%" }} value={teamAId} onChange={(e) => changeTeam("A", e.target.value)}>
            <option value="">—</option>
            {tournament.teams.filter((t) => !t.eliminated || t.id === teamAId).map((t) => <option key={t.id} value={t.id}>{t.name}{t.eliminated ? " (éliminée)" : ""}</option>)}
          </select>
        </Field>
        <Field label="Équipe B">
          <select className="vt-select" style={{ width: "100%" }} value={teamBId} onChange={(e) => changeTeam("B", e.target.value)}>
            <option value="">—</option>
            {tournament.teams.filter((t) => !t.eliminated || t.id === teamBId).map((t) => <option key={t.id} value={t.id}>{t.name}{t.eliminated ? " (éliminée)" : ""}</option>)}
          </select>
        </Field>
      </div>

      {teamA && teamB && (
        <>
          {aExceeds && <RosterPicker team={teamA} players={players} selected={startersA} onToggle={toggleA} />}
          {bExceeds && <RosterPicker team={teamB} players={players} selected={startersB} onToggle={toggleB} />}

          <Field label="Équipe gagnante de ce match (facultatif)">
            <select className="vt-select" style={{ width: "100%" }} value={winnerTeamId} onChange={(e) => setWinnerTeamId(e.target.value)}>
              <option value="">— Non renseignée —</option>
              <option value={teamA.id}>{teamA.name}</option>
              <option value={teamB.id}>{teamB.name}</option>
            </select>
          </Field>
        </>
      )}

      <div className="vt-label" style={{ margin: "14px 0 8px" }}>Score par map</div>
      <div className="vt-input-flow" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {mapScores.map((m, i) => {
          const resolved = resolvedMaps[i];
          const prev = i === 0 ? { lineupA: startersA, lineupB: startersB } : resolvedMaps[i - 1];
          const changes = [
            substitutionSummary(prev.lineupA, resolved.lineupA, nameOf),
            substitutionSummary(prev.lineupB, resolved.lineupB, nameOf),
          ].filter(Boolean).join(" · ");
          const sizeWarning = isPlayedMap(m) && teamA && teamB && (resolved.lineupA.length !== 5 || resolved.lineupB.length !== 5)
            ? `${resolved.lineupA.length} v ${resolved.lineupB.length} joueurs` : "";
          const hasOverride = Array.isArray(m.lineupA) || Array.isArray(m.lineupB);
          return (
          <div key={i}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "var(--text-dim)", width: 46 }}>Map {i + 1}</span>
            <MapNameInput value={m.map || ""} onChange={(v) => setMapScore(i, "map", v)} />
            <select className="vt-select" title="Qui a choisi cette map (veto)" style={{ width: 120, padding: "7px 8px", color: m.pick ? undefined : "var(--text-dim)" }}
              value={m.pick || ""} onChange={(e) => setMapScore(i, "pick", e.target.value)}>
              <option value="">Pick ?</option>
              <option value="A">Pick {teamA?.name || "A"}</option>
              <option value="B">Pick {teamB?.name || "B"}</option>
              <option value="decider">Decider</option>
            </select>
            <input
              type="number" className="vt-input vt-mono" style={{ width: 70 }}
              placeholder={teamA?.name || "A"} value={m.a}
              onChange={(e) => setMapScore(i, "a", e.target.value)}
              onKeyDown={focusNextInput}
            />
            <span style={{ color: "var(--text-dim)" }}>—</span>
            <input
              type="number" className="vt-input vt-mono" style={{ width: 70 }}
              placeholder={teamB?.name || "B"} value={m.b}
              onChange={(e) => setMapScore(i, "b", e.target.value)}
              onKeyDown={focusNextInput}
            />
            {teamA && teamB && (
              <button type="button" className="vt-btn vt-cut-sm" style={{ padding: "4px 8px", fontSize: 11, borderColor: openLineup === i ? "var(--steel)" : undefined }} onClick={() => openMapPanel(i)} title="Qui a joué cette map, avec quel agent">
                <Users size={12} /> Compo & agents
              </button>
            )}
            {mapScores.length > 1 && (
              <button className="vt-btn vt-cut-sm" style={{ padding: "4px 8px" }} onClick={() => removeMapRow(i)}><Trash2 size={12} /></button>
            )}
            {changes && <span style={{ fontSize: 11, color: "var(--gold)" }}>↺ {changes}</span>}
            {sizeWarning && <span style={{ fontSize: 11, color: "var(--red)" }}>{sizeWarning}</span>}
            {isPlayedMap(m) && teamA && teamB && (() => {
              const ids = [...resolved.lineupA, ...resolved.lineupB];
              const filled = ids.filter((id) => m.agents?.[id]).length;
              return <span style={{ fontSize: 11, color: filled === ids.length && ids.length ? "var(--green)" : "var(--text-dim)" }}>agents {filled}/{ids.length}</span>;
            })()}
          </div>
          {openLineup === i && teamA && teamB && (
            <div className="vt-panel vt-cut-sm" style={{ padding: "4px 10px 10px", margin: "6px 0 4px 54px" }}>
              <RosterPicker team={teamA} players={players} selected={resolved.lineupA} onToggle={(id) => toggleMapLineup(i, "A", id)} hint={`${teamA.name} — joueurs sur la map ${i + 1}`} />
              <RosterPicker team={teamB} players={players} selected={resolved.lineupB} onToggle={(id) => toggleMapLineup(i, "B", id)} hint={`${teamB.name} — joueurs sur la map ${i + 1}`} />
              <div className="vt-label" style={{ margin: "12px 0 6px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                Agents sur la map {i + 1}
                {i > 0 && <button type="button" className="vt-btn vt-cut-sm" style={{ padding: "3px 7px", fontSize: 10 }} onClick={() => copyPreviousAgents(i)}>Copier la map {i}</button>}
                <button type="button" className="vt-btn vt-cut-sm" style={{ padding: "3px 7px", fontSize: 10 }} onClick={() => fillMapAgents(i, (id) => usualAgents.get(id) || "")} title="Remplit les cases vides avec l'agent le plus joué de chaque joueur">Agents habituels</button>
              </div>
              <div className="vt-input-flow" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px" }}>
                {[["A", resolved.lineupA], ["B", resolved.lineupB]].map(([side, ids]) => (
                  <div key={side} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {ids.map((id) => {
                      const value = m.agents?.[id] || "";
                      const role = agentRole(value);
                      return (
                        <label key={id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                          <span style={{ width: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameOf(id)}</span>
                          <input
                            className="vt-input" list="vt-agent-list" placeholder={usualAgents.get(id) || "Agent"}
                            style={{ flex: 1, minWidth: 0, padding: "4px 8px", fontSize: 12 }}
                            value={value}
                            onChange={(e) => setMapAgent(i, id, e.target.value)}
                            onBlur={(e) => setMapAgent(i, id, canonicalAgent(e.target.value))}
                            onKeyDown={focusNextInput}
                          />
                          <span style={{ width: 26, height: 26, flexShrink: 0, display: "inline-flex" }}>
                            {role && teamLogos[agentLogoKey(value)] && <AgentFace agent={canonicalAgent(value)} teamLogos={teamLogos} size={26} />}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 6, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                Un changement de compo s'applique aussi aux maps suivantes, sauf si elles ont leur propre compo.
                {hasOverride && <button type="button" className="vt-btn vt-cut-sm" style={{ padding: "3px 7px", fontSize: 10 }} onClick={() => resetMapLineup(i)}>Reprendre la compo précédente</button>}
              </div>
            </div>
          )}
          </div>
          );
        })}
      </div>
      <datalist id="vt-agent-list">{getAgents().map((a) => <option key={a.name} value={a.name}>{ROLES[a.role].label}</option>)}</datalist>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
        <button className="vt-btn vt-cut-sm" onClick={addMapRow}><Plus size={14} /> Ajouter une map</button>
        <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
          {totalMaps} map{totalMaps > 1 ? "s" : ""} · {totalRounds} round{totalRounds > 1 ? "s" : ""} au total
        </span>
      </div>

      <div className="vt-label" style={{ margin: "14px 0 6px" }}>Bans (facultatif)</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {bans.map((b, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, color: "var(--text-dim)", width: 46 }}>Ban {i + 1}</span>
            <select className="vt-select" style={{ width: 150, padding: "7px 8px" }} value={b.side} onChange={(e) => setBan(i, "side", e.target.value)}>
              <option value="A">{teamA?.name || "Équipe A"}</option>
              <option value="B">{teamB?.name || "Équipe B"}</option>
            </select>
            <MapNameInput value={b.map || ""} onChange={(v) => setBan(i, "map", v)} />
            <button className="vt-btn vt-cut-sm" style={{ padding: "4px 8px" }} onClick={() => setBans((list) => list.filter((_, j) => j !== i))}><Trash2 size={12} /></button>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6 }}>
        <button className="vt-btn vt-cut-sm" onClick={() => setBans((list) => [...list, { side: list.length % 2 === 0 ? "A" : "B", map: "" }])}>
          <Plus size={14} /> Ajouter un ban
        </button>
        <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
          Avec le pick de chaque map, ça alimente les % de pick et de ban de l'onglet Maps.
        </span>
      </div>

      {teamA && teamB && roster.length === 0 && (
        <div className="vt-panel vt-cut-sm" style={{ padding: 14, marginTop: 16, color: "var(--red)", fontSize: 13 }}>
          Aucun joueur sélectionné pour l'instant — coche les joueurs qui ont participé dans les
          listes ci-dessus pour pouvoir entrer leurs stats.
        </div>
      )}

      {roster.length > 0 && (
        <>
          <div className="vt-label" style={{ margin: "16px 0 8px" }}>Stats des joueurs pour ce match</div>
          {alreadyApplied && (
            <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 8 }}>
              Ce match est déjà appliqué au classement. Tu peux modifier les stats ici :
              le classement du joueur sera corrigé automatiquement à l'enregistrement.
            </div>
          )}
          <div className="vt-panel vt-cut-sm vt-scroll" style={{ overflowX: "auto" }}>
            <table className="vt-input-flow" style={{ borderCollapse: "collapse", minWidth: 820 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--line)" }}>
                  <th className="vt-th" style={{ padding: "8px 10px", textAlign: "left" }}>Joueur</th>
                  <th className="vt-th" style={{ padding: "8px 6px", textAlign: "left" }}>Agent</th>
                  <th className="vt-th" style={{ padding: "8px 10px", textAlign: "right" }} title="Calculé depuis la compo de chaque map">Maps</th>
                  <th className="vt-th" style={{ padding: "8px 10px", textAlign: "right" }} title="Calculé depuis la compo de chaque map">Rounds</th>
                  {TOURNAMENT_PLAYER_FIELDS.map((k) => (
                    <th key={k} className="vt-th" style={{ padding: "8px 10px", textAlign: "right" }}>{labels[k]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roster.map((p) => (
                  <tr key={p.id} style={{ borderBottom: "1px solid var(--line)" }}>
                    <td style={{ padding: "6px 10px", fontSize: 13, whiteSpace: "nowrap" }}>{p.name}</td>
                    <td style={{ padding: "4px 6px" }}>
                      <div style={{ display: "flex", gap: 3 }}>
                        {[...new Set(mapScores.filter(isPlayedMap).map((mm) => canonicalAgent(mm.agents?.[p.id])).filter(Boolean))].map((a) => (
                          <AgentFace key={a} agent={a} teamLogos={teamLogos} size={30} />
                        ))}
                      </div>
                    </td>
                    <td className="vt-mono" style={{ padding: "6px 10px", fontSize: 12, textAlign: "right", color: "var(--text-dim)" }}>{participation.get(p.id)?.maps ?? 0}</td>
                    <td className="vt-mono" style={{ padding: "6px 10px", fontSize: 12, textAlign: "right", color: "var(--text-dim)" }}>{participation.get(p.id)?.rounds ?? 0}</td>
                    {TOURNAMENT_PLAYER_FIELDS.map((k) => (
                      <td key={k} style={{ padding: "4px 6px" }}>
                        <input
                          type="number" step="any" className="vt-input vt-mono"
                          style={{ width: 62, padding: "5px 6px", fontSize: 12 }}
                          value={rows[p.id]?.[k] || ""}
                          onChange={setCell(p.id, k)}
                          onKeyDown={focusNextInput}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 6 }}>
            Maps et rounds sont calculés pour chaque joueur à partir de la compo de chaque map :
            un remplaçant ne reçoit que les maps qu'il a jouées. Saisis ses stats sur ses maps à lui.
          </div>
          {(() => {
            const missing = roster.filter((p) => {
              const vals = rows[p.id];
              return !vals || !Object.values(vals).some((v) => v !== "" && v !== undefined);
            });
            return missing.length > 0 ? (
              <div className="vt-panel vt-cut-sm" style={{ padding: 12, marginTop: 8, border: "1px solid var(--red)", color: "var(--red)", fontSize: 12 }}>
                Aucune stat saisie pour {missing.length} joueur{missing.length > 1 ? "s" : ""} — {missing.length > 1 ? "ils" : "il"} ne
                {missing.length > 1 ? " seront" : " sera"} pas comptabilisé{missing.length > 1 ? "s" : ""} pour ce match : {missing.map((p) => p.name).join(", ")}.
              </div>
            ) : null;
          })()}
        </>
      )}

      {!alreadyApplied && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, cursor: "pointer" }}>
          <input type="checkbox" checked={applyToStats} onChange={(e) => setApplyToStats(e.target.checked)} />
          <span style={{ fontSize: 13 }}>Ajouter ces stats au classement général</span>
        </label>
      )}
      <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 4 }}>
        {alreadyApplied
          ? "Ce match compte déjà dans le classement. Toute modification des stats sera répercutée automatiquement."
          : "Décoche pour enregistrer un match passé (backfill) sans fausser les stats actuelles — tu pourras l'appliquer plus tard depuis la liste des matchs."}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginTop: 16 }}>
        {saveError && <span style={{ color: "var(--red)", fontSize: 12 }}>{saveError}</span>}
        <button className="vt-btn vt-cut-sm" onClick={onClose}>Annuler</button>
        <button
          className="vt-btn vt-btn-primary vt-cut-sm"
          onClick={() => {
            if (!label.trim()) { setSaveError("Ajoute une étiquette."); return; }
            const stats = {};
            Object.entries(rows).forEach(([playerId, vals]) => {
              // un joueur retiré de toutes les compos ne garde pas de stats sur ce match
              if (!rosterIds.includes(playerId)) return;
              const hasValue = Object.values(vals).some((v) => v !== "" && v !== undefined);
              if (!hasValue) return;
              const played = participation.get(playerId);
              stats[playerId] = computeMatchDerived({
                ...vals,
                maps: played ? played.maps : totalMaps,
                round: played ? played.rounds : totalRounds,
              });
            });
            if (Object.keys(stats).length === 0) { setSaveError("Aucune stat saisie."); return; }
            // chaque map jouée enregistre sa compo exacte ; une map sans score n'en a pas
            const savedMapScores = resolvedMaps.map((m) => {
              if (!isPlayedMap(m)) {
                const { lineupA: _a, lineupB: _b, agents: _ag, pick: _p, ...rest } = m;
                return rest;
              }
              // agents : nom officiel, et seulement pour les joueurs présents sur la map
              const present = new Set([...m.lineupA, ...m.lineupB]);
              const agents = Object.fromEntries(Object.entries(m.agents || {})
                .map(([id, a]) => [id, canonicalAgent(a)])
                .filter(([id, a]) => a && present.has(id)));
              const { agents: _old, ...rest } = m;
              return Object.keys(agents).length ? { ...rest, agents } : rest;
            }).map((m, i) => {
              const { veto: _v, ...rest } = m;
              const cleanBans = bans.filter((b) => b.map).map((b) => ({ side: b.side === "B" ? "B" : "A", map: b.map }));
              return i === 0 && cleanBans.length ? { ...rest, veto: { bans: cleanBans } } : rest;
            });
            onSave(
              {
                id: existingMatch?.id || uid(),
                label: label.trim(), teamAId, teamBId, winnerTeamId: winnerTeamId || null,
                mapScores: savedMapScores, stats,
                appliedToStats: alreadyApplied ? true : applyToStats,
              },
              wasApplied
            );
          }}
        >
          {isEdit ? "Enregistrer les modifications" : "Enregistrer"}
        </button>
      </div>
    </ModalShell>
  );
}

function FinishTournamentModal({ tournament, onClose, onSave }) {
  const [winnerTeamId, setWinnerTeamId] = useState("");
  return (
    <ModalShell title={`Terminer — ${tournament.name}`} onClose={onClose}>
      <Field label="Équipe gagnante *">
        <select className="vt-select" style={{ width: "100%" }} value={winnerTeamId} onChange={(e) => setWinnerTeamId(e.target.value)}>
          <option value="">— Choisir —</option>
          {tournament.teams.filter((t) => !t.eliminated || t.id === winnerTeamId).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </Field>
      <div style={{ fontSize: 13, color: "var(--text-dim)" }}>
        Chaque joueur de l'équipe gagnante recevra automatiquement un trophée
        « {tournament.type} — {tournament.name} » sur son profil.
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <button className="vt-btn vt-cut-sm" onClick={onClose}>Annuler</button>
        <button className="vt-btn vt-btn-primary vt-cut-sm" onClick={() => { if (winnerTeamId) onSave(winnerTeamId); }}>
          <Crown size={14} /> Valider le vainqueur
        </button>
      </div>
    </ModalShell>
  );
}

function TournamentsList({ tournaments, onOpen, teamLogos }) {
  if (tournaments.length === 0) {
    return (
      <div className="vt-panel vt-cut" style={{ padding: 48, textAlign: "center", color: "var(--text-dim)" }}>
        <Trophy size={28} style={{ marginBottom: 10, opacity: 0.6 }} />
        <div className="vt-display" style={{ fontSize: 20, color: "var(--text)", marginBottom: 6 }}>Aucun tournoi pour le moment</div>
        <div style={{ fontSize: 14 }}>Crée un tournoi pour suivre poules, play-offs et stats en direct.</div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {[...tournaments].sort((a, b) => (b.date || "").localeCompare(a.date || "")).map((t) => {
        const winner = t.teams.find((x) => x.id === t.winnerTeamId);
        const logo = winner ? getLogo(teamLogos, winner.name) : null;
        return (
          <div key={t.id} className="vt-panel vt-cut vt-row" style={{ padding: "16px 18px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }} onClick={() => onOpen(t.id)}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Trophy size={20} color={t.finished ? "#E8B95E" : "#7FA1C4"} />
              <div>
                <div className="vt-display" style={{ fontSize: 17, fontWeight: 700 }}>{t.name}</div>
                <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
                  {t.date && <>{t.date} · </>}<span style={{ color: TROPHY_COLOR[t.type] || TROPHY_COLOR.Autre, fontWeight: 600 }}>{t.type}</span> · {t.teams.length} équipe{t.teams.length > 1 ? "s" : ""} · {t.matches.length} match{t.matches.length > 1 ? "s" : ""}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {t.finished && winner ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--gold)" }}>
                  {logo && <img src={logo} className="vt-logo" alt="" />}
                  <Crown size={14} /> {winner.name}
                </span>
              ) : (
                <span className="vt-label" style={{ color: "var(--steel)" }}>En cours</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TournamentDetail({ tournament, players, teamLogos, onBack, onAddTeam, onEditTeam, onAddMatch, onEditMatch, onApplyMatch, onFinish, onEditInfo, onToggleEliminated }) {
  const typeColor = TROPHY_COLOR[tournament.type] || TROPHY_COLOR.Autre;
  return (
    <div>
      <button className="vt-btn vt-cut-sm" style={{ marginBottom: 16 }} onClick={onBack}>
        <ChevronLeft size={15} /> Tournois
      </button>

      <div className="vt-panel vt-cut" style={{ padding: "20px 22px", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 className="vt-display" style={{ fontSize: 30, fontWeight: 700, textTransform: "uppercase" }}>{tournament.name}</h1>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
              {tournament.date && <span className="vt-mono" style={{ color: "var(--text-dim)", fontSize: 13 }}>{tournament.date}</span>}
              <span className="vt-display" style={{ color: typeColor, fontSize: 14, fontWeight: 700 }}>{tournament.type}</span>
              {tournament.format.groups && <span className="vt-label">Poules</span>}
              {tournament.format.doubleElim && <span className="vt-label">Double élim.</span>}
              {tournament.finished ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--gold)", fontSize: 13 }}>
                  <Crown size={13} /> Terminé — {tournament.teams.find((t) => t.id === tournament.winnerTeamId)?.name}
                </span>
              ) : (
                <span className="vt-label" style={{ color: "var(--steel)" }}>En cours</span>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="vt-btn vt-cut-sm" onClick={onEditInfo}><Pencil size={14} /> Modifier</button>
            {!tournament.finished && (
              <button className="vt-btn vt-btn-primary vt-cut-sm" onClick={onFinish} disabled={tournament.teams.length < 2}>
                <Crown size={14} /> Terminer le tournoi
              </button>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div className="vt-label">Équipes</div>
        <button className="vt-btn vt-cut-sm" onClick={onAddTeam}><Users size={14} /> Ajouter une équipe</button>
      </div>
      {tournament.teams.length === 0 ? (
        <div className="vt-panel vt-cut-sm" style={{ padding: 18, color: "var(--text-dim)", fontSize: 14, marginBottom: 22 }}>Aucune équipe pour l'instant.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10, marginBottom: 22 }}>
          {tournament.teams.map((team) => {
            const logo = getLogo(teamLogos, team.name);
            const isWinner = tournament.winnerTeamId === team.id;
            return (
              <div key={team.id} className="vt-panel vt-cut-sm" style={{ padding: 14, opacity: team.eliminated ? 0.55 : 1, border: isWinner ? "1px solid var(--gold)" : team.eliminated ? "1px solid var(--red)" : undefined }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer" }} onClick={() => onEditTeam(team)}>
                  {logo && <img src={logo} className="vt-logo" alt="" />}
                  <span className="vt-display" style={{ fontWeight: 700, fontSize: 15 }}>{team.name}</span>
                  {isWinner && <Crown size={14} color="#E8B95E" />}
                  {team.eliminated && <span className="vt-label" style={{ color: "var(--red)" }}>Éliminée</span>}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.6, cursor: "pointer" }} onClick={() => onEditTeam(team)}>
                  {team.playerIds.map((id) => players.find((p) => p.id === id)?.name).filter(Boolean).join(", ") || "Aucun joueur"}
                </div>
                <button
                  className="vt-btn vt-cut-sm"
                  style={{ marginTop: 10, padding: "4px 8px", fontSize: 11 }}
                  onClick={(e) => { e.stopPropagation(); onToggleEliminated(team.id); }}
                >
                  {team.eliminated ? "Réintégrer" : "Marquer éliminée"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div className="vt-label">Matchs</div>
        <button className="vt-btn vt-btn-primary vt-cut-sm" onClick={onAddMatch} disabled={tournament.teams.length < 2}>
          <ListPlus size={14} /> Ajouter un match
        </button>
      </div>
      {tournament.matches.length === 0 ? (
        <div className="vt-panel vt-cut-sm" style={{ padding: 18, color: "var(--text-dim)", fontSize: 14 }}>Aucun match pour l'instant.</div>
      ) : (
        <div className="vt-panel vt-cut" style={{ padding: 4 }}>
          {[...tournament.matches].reverse().map((m, i, arr) => {
            const teamA = tournament.teams.find((t) => t.id === m.teamAId);
            const teamB = tournament.teams.find((t) => t.id === m.teamBId);
            const winner = tournament.teams.find((t) => t.id === m.winnerTeamId);
            return (
              <div key={m.id} style={{ padding: "12px 16px", borderBottom: i < arr.length - 1 ? "1px solid var(--line)" : "none", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div>
                  <div className="vt-display" style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 2 }}>{m.label}</div>
                  <div style={{ fontSize: 14 }}>
                    {teamA?.name || "?"} <span style={{ color: "var(--text-dim)" }}>vs</span> {teamB?.name || "?"}
                    {winner && <span style={{ marginLeft: 10, color: "var(--gold)", fontSize: 12 }}><Crown size={11} style={{ display: "inline", marginRight: 3 }} />{winner.name}</span>}
                  </div>
                  {m.mapScores && m.mapScores.length > 0 && (
                    <div className="vt-mono" style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 3 }}>
                      {m.mapScores.filter((s) => s.a !== "" || s.b !== "").map((s) => `${s.map ? s.map + " " : ""}${s.a || 0}-${s.b || 0}`).join(" · ")}
                    </div>
                  )}
                  {(() => {
                    const nameOf = (id) => players.find((p) => p.id === id)?.name || "?";
                    const played = (m.mapScores || []).map((s, idx) => ({ s, idx })).filter(({ s }) => isPlayedMap(s));
                    const subs = played.slice(1).map(({ s, idx }, k) => {
                      const before = played[k].s;
                      const text = [
                        substitutionSummary(before.lineupA, s.lineupA, nameOf),
                        substitutionSummary(before.lineupB, s.lineupB, nameOf),
                      ].filter(Boolean).join(" · ");
                      return text && Array.isArray(s.lineupA) && Array.isArray(before.lineupA) ? `Map ${idx + 1} : ${text}` : "";
                    }).filter(Boolean);
                    return subs.length > 0 && (
                      <div style={{ fontSize: 11, color: "var(--gold)", marginTop: 3 }}>↺ {subs.join(" — ")}</div>
                    );
                  })()}
                  <div style={{ marginTop: 4 }}>
                    {m.appliedToStats ? (
                      <span style={{ fontSize: 11, color: "var(--green)" }}>✓ Appliqué au classement</span>
                    ) : (
                      <span style={{ fontSize: 11, color: "var(--text-dim)" }}>Pas encore appliqué</span>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {!m.appliedToStats && (
                    <button className="vt-btn vt-cut-sm" style={{ padding: "5px 9px", fontSize: 11 }} onClick={() => onApplyMatch(m.id)}>
                      Appliquer au classement
                    </button>
                  )}
                  <button className="vt-btn vt-cut-sm" style={{ padding: "5px 9px" }} onClick={() => onEditMatch(m)}><Pencil size={12} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RecordCard({ field, entries }) {
  const validEntries = validRecordEntries(entries, field);
  if (validEntries.length === 0) return null;
  const fmt = (v) => round(v, field.decimals) + (field.suffix || "");
  const top = pickBest(validEntries, field);
  const bottom = pickWorst(validEntries, field);
  const showBottom = bottom !== top;

  return (
    <div className="vt-panel vt-cut-sm" style={{ padding: 14 }}>
      <div className="vt-label" style={{ marginBottom: 10 }}>{field.label}</div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Flame size={14} color="#E8B95E" />
        <span className="vt-display" style={{ fontWeight: 700, fontSize: 14 }}>{top.playerName}</span>
        <span className="vt-mono" style={{ color: "var(--gold)", fontWeight: 700, marginLeft: "auto" }}>{fmt(top[field.key])}</span>
      </div>
      <div style={{ fontSize: 11, color: "var(--text-dim)", marginLeft: 22, marginBottom: showBottom ? 10 : 0 }}>
        {top.tournamentName} · {top.matchLabel}{top.opponentName ? ` vs ${top.opponentName}` : ""}
      </div>

      {showBottom && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 14 }} />
            <span className="vt-display" style={{ fontWeight: 600, fontSize: 14, color: "var(--text-dim)" }}>{bottom.playerName}</span>
            <span className="vt-mono" style={{ color: "var(--text-dim)", marginLeft: "auto" }}>{fmt(bottom[field.key])}</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", marginLeft: 22 }}>
            {bottom.tournamentName} · {bottom.matchLabel}{bottom.opponentName ? ` vs ${bottom.opponentName}` : ""}
          </div>
        </>
      )}
    </div>
  );
}

function MatchDurationCard({ title, entries }) {
  return (
    <div className="vt-panel vt-cut-sm" style={{ padding: 14 }}>
      <div className="vt-label" style={{ marginBottom: 10 }}>{title}</div>
      {entries.length === 0 ? (
        <div style={{ color: "var(--text-dim)", fontSize: 13 }}>Aucun match {title} enregistré.</div>
      ) : (() => {
        const longest = [...entries].sort((a, b) => b.totalRounds - a.totalRounds)[0];
        const shortest = [...entries].sort((a, b) => a.totalRounds - b.totalRounds)[0];
        const showShortest = shortest !== longest;
        return (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Flame size={14} color="#E8B95E" />
              <span className="vt-display" style={{ fontWeight: 700, fontSize: 14 }}>Plus long</span>
              <span className="vt-mono" style={{ color: "var(--gold)", fontWeight: 700, marginLeft: "auto" }}>{longest.totalRounds} rounds</span>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginLeft: 22, marginBottom: showShortest ? 10 : 0 }}>
              {longest.tournamentName} · {longest.matchLabel} — {longest.teamAName} vs {longest.teamBName}
            </div>
            {showShortest && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 14 }} />
                  <span className="vt-display" style={{ fontWeight: 600, fontSize: 14, color: "var(--text-dim)" }}>Plus court</span>
                  <span className="vt-mono" style={{ color: "var(--text-dim)", marginLeft: "auto" }}>{shortest.totalRounds} rounds</span>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-dim)", marginLeft: 22 }}>
                  {shortest.tournamentName} · {shortest.matchLabel} — {shortest.teamAName} vs {shortest.teamBName}
                </div>
              </>
            )}
          </>
        );
      })()}
    </div>
  );
}

function RecordsSection({ title, entries, Card = RecordCard, emptyText = "Aucun match de ce format enregistré pour l'instant." }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div className="vt-label" style={{ marginBottom: 10 }}>{title}</div>
      {entries.length === 0 ? (
        <div className="vt-panel vt-cut-sm" style={{ padding: 18, color: "var(--text-dim)", fontSize: 14 }}>
          {emptyText}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 10 }}>
          {RECORD_FIELDS.map((f) => <Card key={f.key} field={f} entries={entries} />)}
        </div>
      )}
    </div>
  );
}

function PersonalRecordCard({ field, entries }) {
  const validEntries = validRecordEntries(entries, field);
  if (validEntries.length === 0) return null;
  const fmt = (v) => round(v, field.decimals) + (field.suffix || "");
  const best = pickBest(validEntries, field);
  const worst = pickWorst(validEntries, field);
  const showWorst = worst !== best;

  return (
    <div className="vt-panel vt-cut-sm" style={{ padding: 14 }}>
      <div className="vt-label" style={{ marginBottom: 10 }}>{field.label}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 12, color: "var(--green)" }}>Meilleur</span>
        <span className="vt-mono" style={{ color: "var(--green)", fontWeight: 700 }}>{fmt(best[field.key])}</span>
      </div>
      <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: showWorst ? 8 : 0 }}>
        {best.tournamentName} · {best.matchLabel}{best.opponentName ? ` vs ${best.opponentName}` : ""}
      </div>
      {showWorst && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: 12, color: "var(--red)" }}>Plus faible</span>
            <span className="vt-mono" style={{ color: "var(--red)", fontWeight: 700 }}>{fmt(worst[field.key])}</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
            {worst.tournamentName} · {worst.matchLabel}{worst.opponentName ? ` vs ${worst.opponentName}` : ""}
          </div>
        </>
      )}
    </div>
  );
}

function PlayerRecordsSection({ player, tournaments, players }) {
  const { BO3, BO5 } = useMemo(() => {
    const all = collectMatchRecords(tournaments, players);
    return {
      BO3: all.BO3.filter((e) => e.playerId === player.id),
      BO5: all.BO5.filter((e) => e.playerId === player.id),
    };
  }, [tournaments, players, player.id]);

  return (
    <div>
      <RecordsSection title="BO3" entries={BO3} Card={PersonalRecordCard} emptyText="Aucun match BO3 enregistré pour ce joueur." />
      <RecordsSection title="BO5" entries={BO5} Card={PersonalRecordCard} emptyText="Aucun match BO5 enregistré pour ce joueur." />
    </div>
  );
}

// green/red for a compared player's cell relative to the base player, for a given stat column
function compareColor(baseVal, otherVal, field) {
  const norm = (v) => {
    let n = num(v);
    if (field.suffix === "%" && n !== 0 && Math.abs(n) <= 1) n *= 100;
    return round(n, field.decimals);
  };
  const b = norm(baseVal), o = norm(otherVal);
  if (o === b) return null;
  const better = RANK_ASCENDING.has(field.key) ? o < b : o > b;
  return better ? "var(--green)" : "var(--red)";
}

function ComparePlayersModal({ basePlayer, players, onClose }) {
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState("");

  const toggle = (id) => setSelected((ids) => ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  const others = players.filter((p) => p.id !== basePlayer.id && p.name.toLowerCase().includes(search.toLowerCase()));
  const compared = [basePlayer, ...selected.map((id) => players.find((p) => p.id === id)).filter(Boolean)];

  return (
    <ModalShell title={`Comparer — ${basePlayer.name}`} onClose={onClose} wide>
      <input className="vt-input" style={{ width: "100%", marginBottom: 8 }} placeholder="Rechercher un joueur à comparer…" value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="vt-panel vt-cut-sm vt-scroll" style={{ maxHeight: 160, overflowY: "auto", marginBottom: 16 }}>
        {others.length === 0 && <div style={{ padding: 14, color: "var(--text-dim)", fontSize: 13 }}>Aucun autre joueur.</div>}
        {others.map((p) => (
          <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderBottom: "1px solid var(--line)", cursor: "pointer" }}>
            <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} />
            <span className="vt-display" style={{ fontSize: 14 }}>{p.name}</span>
            {currentTeam(p) ? <span style={{ fontSize: 12, color: "var(--text-dim)" }}>({currentTeam(p)})</span> : isFreeAgent(p) && <span style={{ fontSize: 12, color: "var(--gold)" }}>(agent libre)</span>}
          </label>
        ))}
      </div>

      {selected.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--text-dim)" }}>Sélectionne au moins un joueur pour lancer la comparaison.</div>
      ) : (
        <div className="vt-panel vt-cut-sm vt-scroll" style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", minWidth: 160 + compared.length * 110 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--line)" }}>
                <th className="vt-th" style={{ padding: "8px 10px", textAlign: "left" }}>Stat</th>
                {compared.map((p) => (
                  <th key={p.id} className="vt-th" style={{ padding: "8px 10px", textAlign: "right" }}>{p.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {STAT_FIELDS.map((f) => (
                <tr key={f.key} style={{ borderBottom: "1px solid var(--line)" }}>
                  <td style={{ padding: "7px 10px", fontSize: 13, color: "var(--text-dim)", whiteSpace: "nowrap" }}>{f.label}</td>
                  {compared.map((p, i) => {
                    const color = i === 0 ? "var(--text)" : (compareColor(basePlayer.stats[f.key], p.stats[f.key], f) || "var(--text)");
                    return (
                      <td key={p.id} className="vt-mono" style={{ padding: "7px 10px", textAlign: "right", color }}>
                        {fmtStat(p.stats[f.key], f)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
        <button className="vt-btn vt-cut-sm" onClick={onClose}>Fermer</button>
      </div>
    </ModalShell>
  );
}

function RankedCountList({ title, rows, countKey, unit }) {
  return (
    <div className="vt-panel vt-cut-sm" style={{ padding: 14 }}>
      <div className="vt-label" style={{ marginBottom: 10 }}>{title}</div>
      {rows.length === 0 ? (
        <div style={{ color: "var(--text-dim)", fontSize: 13 }}>Aucune donnée pour l'instant.</div>
      ) : rows.map((p, i) => (
        <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: i < rows.length - 1 ? "1px solid var(--line)" : "none" }}>
          <span className="vt-display" style={{ fontSize: 13 }}>{i + 1}. {p.name}</span>
          <span className="vt-mono" style={{ fontSize: 13, color: "var(--gold)" }}>{p[countKey]} {unit}</span>
        </div>
      ))}
    </div>
  );
}

function RecordsView({ tournaments, players, filters, onFiltersChange }) {
  const scopedTournaments = useMemo(() => filterTournamentScope(tournaments, filters, false), [tournaments, filters]);
  const eligibleIds = useMemo(() => eligiblePlayerIdsForFilters(scopedTournaments, filters), [scopedTournaments, filters]);
  const recordTournaments = useMemo(() => trimTournamentStatsForFilters(scopedTournaments, filters, eligibleIds), [scopedTournaments, filters, eligibleIds]);
  const { BO3, BO5 } = useMemo(() => collectMatchRecords(recordTournaments, players), [recordTournaments, players]);
  const durations = useMemo(() => collectMatchDurationRecords(scopedTournaments), [scopedTournaments]);
  const mvpMjCounts = useMemo(() => computeMvpMjCounts(scopedTournaments), [scopedTournaments]);

  const topMvp = players.filter((p) => eligibleIds.has(p.id) && (mvpMjCounts[p.id]?.mvp || 0) > 0)
    .sort((a, b) => (mvpMjCounts[b.id]?.mvp || 0) - (mvpMjCounts[a.id]?.mvp || 0)).slice(0, 10)
    .map((p) => ({ id: p.id, name: p.name, mvp: mvpMjCounts[p.id]?.mvp || 0 }));
  const topMj = players.filter((p) => eligibleIds.has(p.id) && (mvpMjCounts[p.id]?.mj || 0) > 0)
    .sort((a, b) => (mvpMjCounts[b.id]?.mj || 0) - (mvpMjCounts[a.id]?.mj || 0)).slice(0, 10)
    .map((p) => ({ id: p.id, name: p.name, mj: mvpMjCounts[p.id]?.mj || 0 }));

  return (
    <div>
      <DataFiltersPanel filters={filters} onChange={onFiltersChange} tournaments={tournaments} />
      <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 20 }}>
        Meilleure et plus faible performance d'un joueur sur un seul match, tous tournois confondus.
        Le format (BO3/BO5) est déterminé par le nombre de maps gagnées par l'équipe qui l'emporte.
      </div>
      <RecordsSection title="BO3" entries={BO3} />
      <RecordsSection title="BO5" entries={BO5} />

      <div className="vt-label" style={{ marginBottom: 10 }}>Durée des matchs</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 10, marginBottom: 28 }}>
        <MatchDurationCard title="BO3" entries={durations.BO3} />
        <MatchDurationCard title="BO5" entries={durations.BO5} />
      </div>

      <div className="vt-label" style={{ marginBottom: 4 }}>MVP & MJ</div>
      <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 10 }}>
        Sur chaque match, le meilleur rating toutes équipes confondues est le MVP ; le meilleur
        rating de l'équipe adverse au MVP est nommé MJ. Comptés sur tous les matchs enregistrés,
        appliqués au classement général ou non.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 10 }}>
        <RankedCountList title="Plus de MVP" rows={topMvp} countKey="mvp" unit="MVP" />
        <RankedCountList title="Plus de MJ" rows={topMj} countKey="mj" unit="MJ" />
      </div>
    </div>
  );
}

function TeamsLeaderboard({ tournaments, players = [], organizations = [], teamLogos, hiddenTeams, onToggleHidden, onOpenTeam }) {
  const ranking = useMemo(() => computeTeamElo(tournaments, undefined, organizations, players), [tournaments, organizations, players]);
  const playerNames = useMemo(() => new Map(players.map((p) => [p.id, p.name])), [players]);
  const hiddenSet = new Set(hiddenTeams);
  const visible = ranking.filter((t) => !hiddenSet.has(t.name.trim().toLowerCase()));
  const hidden = ranking.filter((t) => hiddenSet.has(t.name.trim().toLowerCase()));

  if (ranking.length === 0) {
    return (
      <div className="vt-panel vt-cut" style={{ padding: 48, textAlign: "center", color: "var(--text-dim)" }}>
        <Shield size={28} style={{ marginBottom: 10, opacity: 0.6 }} />
        <div className="vt-display" style={{ fontSize: 20, color: "var(--text)", marginBottom: 6 }}>Aucune équipe classée pour l'instant</div>
        <div style={{ fontSize: 14 }}>Ajoute des matchs dans tes tournois pour faire vivre ce classement.</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 16 }}>
        L'Elo appartient aux joueurs : celui d'une équipe est la moyenne de ses 5 joueurs principaux
        (ceux qui ont le plus joué lors de son dernier tournoi). Il suit donc le roster : un joueur
        qui change d'équipe emporte son Elo avec lui. Recalculé sur tous les matchs enregistrés,
        dans l'ordre chronologique ; battre un favori rapporte gros, un remplaçant gagne selon ses
        maps jouées, et gagner un tournoi donne un bonus à chaque joueur du roster vainqueur.
      </div>
      <div className="vt-panel vt-cut" style={{ padding: 4, marginBottom: hidden.length > 0 ? 16 : 0 }}>
        {visible.map((team, i) => {
          const rank = i + 1;
          const medal = rank === 1 ? "vt-medal-1" : rank === 2 ? "vt-medal-2" : rank === 3 ? "vt-medal-3" : "";
          const logo = getLogo(teamLogos, team.name);
          const pct = Math.round((team.elo / ELO_MAX) * 100);
          const last = team.history[team.history.length - 1];
          return (
            <div
              key={team.key} className="vt-row"
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: i < visible.length - 1 ? "1px solid var(--line)" : "none", cursor: "pointer" }}
              onClick={() => onOpenTeam(team.key)}
            >
              <div className={"vt-display vt-mono " + medal} style={{ fontSize: 18, fontWeight: 700, width: 26, flexShrink: 0 }}>{rank}</div>
              {logo && <img src={logo} className="vt-logo" alt="" />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="vt-display" style={{ fontWeight: 600, fontSize: 15 }}>{team.name}</div>
                {team.roster.length > 0 && (
                  <div style={{ fontSize: 11, color: "var(--text-dim)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {team.roster.map((r) => playerNames.get(r.id) || "?").join(" · ")}
                  </div>
                )}
                <div style={{ height: 4, background: "var(--panel-raised)", marginTop: 5, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: "var(--red)" }} />
                </div>
              </div>
              {last && (
                <span className="vt-mono" style={{ fontSize: 12, fontWeight: 700, color: last.delta >= 0 ? "var(--green)" : "var(--red)", flexShrink: 0, minWidth: 42, textAlign: "right" }}>
                  {last.delta >= 0 ? "+" : ""}{Math.round(last.delta)}
                </span>
              )}
              <div className="vt-mono vt-display" style={{ fontWeight: 700, fontSize: 18, flexShrink: 0 }}>{Math.round(team.elo)}</div>
              <button
                className="vt-btn vt-cut-sm" style={{ padding: "5px 8px", flexShrink: 0 }}
                title="Retirer du classement (org dissoute)"
                onClick={(e) => { e.stopPropagation(); onToggleHidden(team.name); }}
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>

      {hidden.length > 0 && (
        <>
          <div className="vt-label" style={{ marginBottom: 8 }}>Équipes retirées ({hidden.length})</div>
          <div className="vt-panel vt-cut" style={{ padding: 4 }}>
            {hidden.map((team, i) => (
              <div key={team.key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", opacity: 0.6, borderBottom: i < hidden.length - 1 ? "1px solid var(--line)" : "none" }}>
                <div style={{ flex: 1 }} className="vt-display">{team.name}</div>
                <div className="vt-mono">{Math.round(team.elo)}</div>
                <button className="vt-btn vt-cut-sm" style={{ padding: "5px 9px", fontSize: 11 }} onClick={() => onToggleHidden(team.name)}>
                  Réintégrer
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------- onglet Agents ----------
const pct = (v) => `${Math.round((v || 0) * 100)} %`;
const fixed = (v, d = 2) => (v === null || v === undefined ? "—" : v.toFixed(d));

function AgentsView({ tournaments, players, teamLogos, onSetLogo, onOpenAgent, gameDataVersion, settingsEnabled, onAddAgent, onRemoveAgent }) {
  const overview = useMemo(() => computeAgentOverview(tournaments), [tournaments, gameDataVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const byName = new Map(overview.agents.map((a) => [a.agent, a]));
  // tous les agents connus apparaissent (même jamais joués) pour pouvoir leur ajouter une image
  const allAgents = getAgents();
  const known = new Set(allAgents.map((a) => a.name));
  const customNames = new Set(allAgents.filter((a) => a.custom).map((a) => a.name));
  const rows = [
    ...overview.agents,
    ...allAgents.filter((a) => !byName.has(a.name)).map((a) => ({ agent: a.name, role: a.role, picks: 0, pickRate: 0, maps: 0, winRate: 0, rating: null, bestPlayer: null })),
  ];
  const playerName = (id) => players.find((p) => p.id === id)?.name || "?";
  return (
    <div>
      <AddGameItemForm kind="agent" enabled={settingsEnabled} onAdd={onAddAgent} />
      <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 16 }}>
        Basé sur les {overview.totalMaps} map{overview.totalMaps > 1 ? "s" : ""} où les agents ont été saisis. Pick rate = part des
        maps où au moins une des deux équipes a pris l'agent. Rating = Rating du match, attribué aux maps jouées
        sur l'agent (estimation si le joueur a changé d'agent en cours de match). Clique sur une case vide pour
        ajouter l'image d'un agent.
      </div>
      <div className="vt-panel vt-cut vt-scroll" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--line)" }}>
              {["Agent", "Rôle", "Pick rate", "Maps jouées", "Victoires", "Rating", "Meilleur joueur"].map((h, i) => (
                <th key={h} className="vt-th" style={{ padding: "10px 14px", textAlign: i < 2 || i === 6 ? "left" : "right", cursor: "default" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.agent} className="vt-row" style={{ borderBottom: "1px solid var(--line)", cursor: "pointer", opacity: a.maps ? 1 : 0.55 }} onClick={() => onOpenAgent(a.agent)}>
                <td style={{ padding: "8px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <AgentIcon agent={a.agent} teamLogos={teamLogos} onSetLogo={onSetLogo} size={32} />
                    <span className="vt-display" style={{ fontWeight: 700, fontSize: 15 }}>{a.agent}</span>
                    {!known.has(a.agent) && <span className="vt-label">hors liste</span>}
                    {customNames.has(a.agent) && <span className="vt-label">ajouté</span>}
                    {customNames.has(a.agent) && settingsEnabled && (
                      <button className="vt-btn vt-cut-sm" style={{ padding: "3px 6px", marginLeft: "auto" }} title="Retirer cet agent de la liste"
                        onClick={(e) => { e.stopPropagation(); if (window.confirm(`Retirer ${a.agent} de la liste des agents ? Les matchs déjà saisis ne changent pas.`)) onRemoveAgent(a.agent); }}>
                        <X size={11} />
                      </button>
                    )}
                  </div>
                </td>
                <td style={{ padding: "8px 14px" }}><RoleBadge role={a.role} /></td>
                <td className="vt-mono" style={{ padding: "8px 14px", textAlign: "right", fontWeight: 700 }}>{pct(a.pickRate)}</td>
                <td className="vt-mono" style={{ padding: "8px 14px", textAlign: "right" }}>{a.maps}</td>
                <td className="vt-mono" style={{ padding: "8px 14px", textAlign: "right" }}>{a.maps ? pct(a.winRate) : "—"}</td>
                <td className="vt-mono" style={{ padding: "8px 14px", textAlign: "right" }}>{fixed(a.rating)}</td>
                <td style={{ padding: "8px 14px", fontSize: 13 }}>
                  {a.bestPlayer?.ranked ? <>{playerName(a.bestPlayer.playerId)} <span className="vt-mono" style={{ color: "var(--text-dim)" }}>{fixed(a.bestPlayer.rating)}</span></> : <span style={{ color: "var(--text-dim)" }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AgentDetail({ agent, tournaments, players, teamLogos, onSetLogo, onBack, onOpenPlayer, onOpenTeam, gameDataVersion }) {
  const data = useMemo(() => computeAgentDetail(agent, tournaments), [agent, tournaments, gameDataVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const playerName = (id) => players.find((p) => p.id === id)?.name || "?";
  const ranked = data.players.filter((p) => p.ranked);
  const others = data.players.filter((p) => !p.ranked);
  const playerRow = (p, dim) => (
    <tr key={p.playerId} className="vt-row" style={{ borderBottom: "1px solid var(--line)", cursor: "pointer", opacity: dim ? 0.55 : 1 }} onClick={() => onOpenPlayer(p.playerId)}>
      <td style={{ padding: "9px 14px" }}><span className="vt-display" style={{ fontWeight: 600 }}>{playerName(p.playerId)}</span>
        {p.teams.length > 0 && <span style={{ fontSize: 12, color: "var(--text-dim)", marginLeft: 8 }}>{p.teams.join(", ")}</span>}</td>
      <td className="vt-mono" style={{ padding: "9px 14px", textAlign: "right", fontWeight: 700 }}>{fixed(p.rating)}</td>
      <td className="vt-mono" style={{ padding: "9px 14px", textAlign: "right" }}>{p.acs === null ? "—" : Math.round(p.acs)}</td>
      <td className="vt-mono" style={{ padding: "9px 14px", textAlign: "right" }}>{p.maps}</td>
      <td className="vt-mono" style={{ padding: "9px 14px", textAlign: "right" }}>{pct(p.winRate)}</td>
    </tr>
  );
  return (
    <div>
      <button className="vt-btn vt-cut-sm" style={{ marginBottom: 16 }} onClick={onBack}><ChevronLeft size={15} /> Agents</button>
      <div className="vt-panel vt-cut" style={{ padding: "20px 22px", marginBottom: 20, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <AgentIcon agent={data.agent} teamLogos={teamLogos} onSetLogo={onSetLogo} size={64} />
        <div>
          <h1 className="vt-display" style={{ fontSize: 30, fontWeight: 700, textTransform: "uppercase" }}>{data.agent}</h1>
          <RoleBadge role={data.role} />
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 22 }}>
        <StatCard label="Pick rate" value={pct(data.pickRate)} accent="var(--red)" />
        <StatCard label="Maps jouées" value={data.maps} />
        <StatCard label="Victoires" value={data.maps ? pct(data.winRate) : "—"} accent="var(--green)" />
        <StatCard label="Rating moyen" value={fixed(data.rating)} />
      </div>

      <div className="vt-label" style={{ marginBottom: 8 }}>Pick rate par map</div>
      {data.byMap.length === 0 ? (
        <div className="vt-panel vt-cut-sm" style={{ padding: 16, color: "var(--text-dim)", fontSize: 14, marginBottom: 22 }}>Aucune map avec agents saisis.</div>
      ) : (
        <div className="vt-panel vt-cut" style={{ padding: 4, marginBottom: 22 }}>
          {data.byMap.map((r, i) => (
            <div key={r.mapName} style={{ display: "grid", gridTemplateColumns: "140px 1fr 70px 110px", alignItems: "center", gap: 12, padding: "9px 16px", borderBottom: i < data.byMap.length - 1 ? "1px solid var(--line)" : "none" }}>
              <span className="vt-display" style={{ fontWeight: 600 }}>{r.mapName}</span>
              <div style={{ height: 6, background: "var(--panel-raised)" }}><div style={{ height: "100%", width: `${Math.round(r.pickRate * 100)}%`, background: ROLES[data.role]?.color || "var(--red)" }} /></div>
              <span className="vt-mono" style={{ textAlign: "right", fontWeight: 700 }}>{pct(r.pickRate)}</span>
              <span style={{ fontSize: 12, color: "var(--text-dim)", textAlign: "right" }}>{r.picked} / {r.played} map{r.played > 1 ? "s" : ""}</span>
            </div>
          ))}
        </div>
      )}

      <div className="vt-label" style={{ marginBottom: 4 }}>Meilleurs joueurs</div>
      <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 8 }}>
        Classés par Rating, à partir de {AGENT_STATS_CONFIG.minMapsForBestPlayers} maps sur l'agent ; les autres sont en grisé.
      </div>
      {data.players.length === 0 ? (
        <div className="vt-panel vt-cut-sm" style={{ padding: 16, color: "var(--text-dim)", fontSize: 14, marginBottom: 22 }}>Personne n'a encore joué cet agent.</div>
      ) : (
        <div className="vt-panel vt-cut vt-scroll" style={{ overflowX: "auto", marginBottom: 22 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--line)" }}>
                {["Joueur", "Rating", "ACS", "Maps", "Victoires"].map((h, i) => <th key={h} className="vt-th" style={{ padding: "9px 14px", textAlign: i ? "right" : "left", cursor: "default" }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {ranked.map((p) => playerRow(p, false))}
              {others.map((p) => playerRow(p, true))}
            </tbody>
          </table>
        </div>
      )}

      <div className="vt-label" style={{ marginBottom: 8 }}>Équipes qui le jouent le plus</div>
      {data.teams.length === 0 ? (
        <div className="vt-panel vt-cut-sm" style={{ padding: 16, color: "var(--text-dim)", fontSize: 14 }}>—</div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {data.teams.slice(0, 12).map((t) => (
            <button key={t.key} className="vt-btn vt-cut-sm" onClick={() => onOpenTeam(t.key)} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              {getLogo(teamLogos, t.name) && <img src={getLogo(teamLogos, t.name)} className="vt-logo" alt="" />}
              {t.name} <span className="vt-mono" style={{ color: "var(--text-dim)" }}>{t.picks}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- ajout d'agents / de maps ----------
function AddGameItemForm({ kind, enabled, onAdd }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("duelist");
  if (!enabled) {
    return (
      <div className="vt-panel vt-cut-sm" style={{ padding: 12, fontSize: 12, color: "var(--text-dim)", marginBottom: 16 }}>
        Pour ajouter {kind === "agent" ? "un agent" : "une map"} depuis l'appli, exécute une fois
        <span className="vt-mono"> supabase/etape-e-reglages.sql </span> dans Supabase → SQL Editor, puis recharge la page.
      </div>
    );
  }
  const submit = () => {
    if (!name.trim()) return;
    onAdd(name.trim(), role);
    setName("");
  };
  return (
    <div className="vt-panel vt-cut-sm" style={{ padding: 12, marginBottom: 16, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <span className="vt-label">{kind === "agent" ? "Ajouter un agent" : "Ajouter une map"}</span>
      <input className="vt-input" style={{ flex: "1 1 180px" }} placeholder={kind === "agent" ? "Nom de l'agent" : "Nom de la map"}
        value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
      {kind === "agent" && (
        <select className="vt-select" value={role} onChange={(e) => setRole(e.target.value)}>
          {["duelist", "controller", "initiator", "sentinel"].map((r) => <option key={r} value={r}>{ROLES[r].label}</option>)}
        </select>
      )}
      <button className="vt-btn vt-btn-primary vt-cut-sm" onClick={submit}><Plus size={14} /> Ajouter</button>
    </div>
  );
}

// ---------- onglet Maps ----------
function MapsView({ tournaments, gameDataVersion, settingsEnabled, onAddMap, onRemoveMap, onOpenMap }) {
  const overview = useMemo(() => computeMapOverview(tournaments, getMaps()), [tournaments, gameDataVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const bar = (v, color) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
      <div style={{ width: 70, height: 5, background: "var(--panel-raised)" }}><div style={{ height: "100%", width: `${Math.round(v * 100)}%`, background: color }} /></div>
      <span className="vt-mono" style={{ width: 52, textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>{pct(v)}</span>
    </div>
  );
  return (
    <div>
      <AddGameItemForm kind="map" enabled={settingsEnabled} onAdd={(name) => onAddMap(name)} />
      <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 16 }}>
        Jouée = part des {overview.playedTotal} maps jouées (avec un nom). Pick, ban et decider = part des {overview.vetoMatches} match{overview.vetoMatches > 1 ? "s" : ""} où
        le veto a été saisi (choix « Pick » de chaque map et « Bans » dans la fenêtre d'un match).
      </div>
      <div className="vt-panel vt-cut vt-scroll" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--line)" }}>
              {["Map", "Jouée", "Fois", "Pick", "Ban", "Decider", "Rounds / map", ""].map((h, i) => (
                <th key={i} className="vt-th" style={{ padding: "10px 14px", textAlign: i === 0 ? "left" : "right", cursor: "default" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {overview.maps.map((m) => (
              <tr key={m.map} className="vt-row" style={{ borderBottom: "1px solid var(--line)", cursor: "pointer", opacity: m.played || m.bans ? 1 : 0.55 }} onClick={() => onOpenMap(m.map)}>
                <td style={{ padding: "10px 14px" }}>
                  <span className="vt-display" style={{ fontWeight: 700, fontSize: 15 }}>{m.map}</span>
                  {isCustomMap(m.map) && <span className="vt-label" style={{ marginLeft: 8 }}>ajoutée</span>}
                </td>
                <td style={{ padding: "10px 14px" }}>{bar(m.playRate, "var(--steel)")}</td>
                <td className="vt-mono" style={{ padding: "10px 14px", textAlign: "right" }}>{m.played}</td>
                <td style={{ padding: "10px 14px" }}>{bar(m.pickRate, "var(--green)")}</td>
                <td style={{ padding: "10px 14px" }}>{bar(m.banRate, "var(--red)")}</td>
                <td style={{ padding: "10px 14px" }}>{bar(m.deciderRate, "var(--gold)")}</td>
                <td className="vt-mono" style={{ padding: "10px 14px", textAlign: "right" }}>{m.avgRounds === null ? "—" : m.avgRounds.toFixed(1)}</td>
                <td style={{ padding: "10px 14px", textAlign: "right" }}>
                  {isCustomMap(m.map) && settingsEnabled && (
                    <button className="vt-btn vt-cut-sm" style={{ padding: "4px 7px" }} title="Retirer cette map de la liste"
                      onClick={(e) => { e.stopPropagation(); if (window.confirm(`Retirer ${m.map} de la liste des maps ? Les matchs déjà saisis ne changent pas.`)) onRemoveMap(m.map); }}>
                      <X size={12} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MapDetail({ mapName, tournaments, teamLogos, onBack, onOpenTeam, onOpenAgent }) {
  const d = useMemo(() => computeMapDetail(mapName, tournaments), [mapName, tournaments]);
  const teamList = (rows, valueKey, unit, color) => (rows.length === 0 ? (
    <div className="vt-panel vt-cut-sm" style={{ padding: 14, color: "var(--text-dim)", fontSize: 13 }}>—</div>
  ) : (
    <div className="vt-panel vt-cut" style={{ padding: 4 }}>
      {rows.map((t, i) => (
        <div key={t.key} className="vt-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 14px", cursor: "pointer", borderBottom: i < rows.length - 1 ? "1px solid var(--line)" : "none" }} onClick={() => onOpenTeam(t.key)}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            {getLogo(teamLogos, t.name) && <img src={getLogo(teamLogos, t.name)} className="vt-logo" alt="" />}
            <span className="vt-display" style={{ fontWeight: 600 }}>{t.name}</span>
          </span>
          <span className="vt-mono" style={{ color }}>{t[valueKey]} {unit}</span>
        </div>
      ))}
    </div>
  ));
  return (
    <div>
      <button className="vt-btn vt-cut-sm" style={{ marginBottom: 16 }} onClick={onBack}><ChevronLeft size={15} /> Maps</button>
      <div className="vt-panel vt-cut" style={{ padding: "20px 22px", marginBottom: 20 }}>
        <h1 className="vt-display" style={{ fontSize: 30, fontWeight: 700, textTransform: "uppercase" }}>{mapName}</h1>
        <div style={{ fontSize: 13, color: "var(--text-dim)" }}>{d.played} map{d.played > 1 ? "s" : ""} jouée{d.played > 1 ? "s" : ""} · veto saisi sur {d.vetoMatches} match{d.vetoMatches > 1 ? "s" : ""}</div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 22 }}>
        <StatCard label="Jouée" value={pct(d.playRate)} />
        <StatCard label="Pick" value={pct(d.pickRate)} accent="var(--green)" />
        <StatCard label="Ban" value={pct(d.banRate)} accent="var(--red)" />
        <StatCard label="Decider" value={pct(d.deciderRate)} accent="var(--gold)" />
        <StatCard label="Rounds / map" value={d.avgRounds === null ? "—" : d.avgRounds.toFixed(1)} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14, marginBottom: 22 }}>
        <div><div className="vt-label" style={{ marginBottom: 8 }}>Équipes qui la choisissent le plus</div>{teamList(d.mostPicked, "picks", "pick", "var(--green)")}</div>
        <div><div className="vt-label" style={{ marginBottom: 8 }}>Équipes qui la bannissent le plus</div>{teamList(d.mostBanned, "bans", "ban", "var(--red)")}</div>
      </div>

      <div className="vt-label" style={{ marginBottom: 8 }}>Bilan des équipes sur {mapName}</div>
      {d.teamRecords.length === 0 ? (
        <div className="vt-panel vt-cut-sm" style={{ padding: 14, color: "var(--text-dim)", fontSize: 13, marginBottom: 22 }}>Aucune map jouée.</div>
      ) : (
        <div className="vt-panel vt-cut" style={{ padding: 4, marginBottom: 22 }}>
          {d.teamRecords.slice(0, 15).map((t, i, arr) => (
            <div key={t.key} className="vt-row" style={{ display: "grid", gridTemplateColumns: "1fr 90px 70px", alignItems: "center", gap: 8, padding: "8px 14px", cursor: "pointer", borderBottom: i < arr.length - 1 ? "1px solid var(--line)" : "none" }} onClick={() => onOpenTeam(t.key)}>
              <span className="vt-display" style={{ fontWeight: 600 }}>{t.name}</span>
              <span className="vt-mono" style={{ textAlign: "right", fontSize: 13 }}><span style={{ color: "var(--green)" }}>{t.wins}</span> – <span style={{ color: "var(--red)" }}>{t.played - t.wins}</span></span>
              <span className="vt-mono" style={{ textAlign: "right", fontWeight: 700 }}>{pct(t.winRate)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="vt-label" style={{ marginBottom: 8 }}>Agents les plus joués sur {mapName}</div>
      {d.agents.length === 0 ? (
        <div className="vt-panel vt-cut-sm" style={{ padding: 14, color: "var(--text-dim)", fontSize: 13 }}>Aucun agent saisi sur cette map.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 8 }}>
          {d.agents.map((a) => (
            <div key={a.agent} className="vt-panel vt-cut-sm vt-row" style={{ padding: 10, display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => onOpenAgent(a.agent)}>
              <AgentIcon agent={a.agent} teamLogos={teamLogos} size={34} />
              <div>
                <div className="vt-display" style={{ fontWeight: 700 }}>{a.agent}</div>
                <div style={{ fontSize: 12, color: "var(--text-dim)" }}>{pct(a.pickRate)} · {a.picks} map{a.picks > 1 ? "s" : ""}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Meilleurs 5 d'une équipe ----------
function BestFiveSection({ teamKey, members, agentPlays, teamLogos, onOpenPlayer }) {
  const best = useMemo(() => computeBestFive(teamKey, members, agentPlays), [teamKey, members, agentPlays]);
  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 12 }}>
        L'équipe-type de toute l'histoire du club : un joueur par poste, choisi selon son Rating avec
        cette équipe (au moins {BEST_FIVE_CONFIG.minMatches} matchs). Le rôle est celui qu'il jouait ici,
        déduit de ses agents. Le Flex revient à un vrai Flex s'il y en a un, sinon au meilleur joueur restant.
        {best.withoutRole > 0 && <> {best.withoutRole} joueur{best.withoutRole > 1 ? "s" : ""} éligible{best.withoutRole > 1 ? "s" : ""} n'{best.withoutRole > 1 ? "ont" : "a"} pas
          encore assez de maps avec agents pour avoir un rôle : complète leurs matchs pour qu'{best.withoutRole > 1 ? "ils" : "il"} soi{best.withoutRole > 1 ? "ent" : "t"} classé{best.withoutRole > 1 ? "s" : ""}.</>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
        {best.slots.map(({ slot, member }) => {
          const info = ROLES[slot];
          const mine = member ? agentPlays.filter((p) => p.playerId === member.id && p.orgKey === teamKey) : [];
          const top = member ? topAgentsOf(mine) : [];
          return (
            <div key={slot} className={"vt-panel vt-cut-sm" + (member ? " vt-row" : "")} style={{ padding: 14, borderTop: `3px solid ${info.color}`, cursor: member ? "pointer" : "default" }} onClick={() => member && onOpenPlayer(member.id)}>
              <div className="vt-label" style={{ color: info.color, marginBottom: 8 }}>{info.label}</div>
              {member ? (
                <>
                  <div className="vt-display" style={{ fontWeight: 700, fontSize: 20, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    {member.player?.name || "?"}
                    {member.legend?.level === "legend" && <Crown size={14} color="var(--gold)" />}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 10 }}>{formatPeriod(member.since, member.until, member.active)}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span>Rating</span><strong className="vt-mono">{member.rating.toFixed(2)}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span>Matchs</span><strong className="vt-mono">{member.stats.match}</strong>
                  </div>
                  {member.role !== slot && (
                    <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 6 }}>Rôle principal : {member.role ? roleLabel(member.role) : "inconnu"}</div>
                  )}
                  {top.length > 0 && (
                    <div style={{ display: "flex", gap: 6, marginTop: 10, alignItems: "center" }}>
                      {top.map((a) => <AgentFace key={a.agent} agent={a.agent} teamLogos={teamLogos} size={30} />)}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ color: "var(--text-dim)", fontSize: 13 }}>— Aucun joueur éligible à ce poste</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- page équipe ----------
const MEMBER_COLUMNS = [
  { key: "match", label: "Matchs", decimals: 0 },
  { key: "maps", label: "Maps", decimals: 0 },
  { key: "round", label: "Rounds", decimals: 0 },
  { key: "rating", label: "Rating", decimals: 2 },
  { key: "acs", label: "ACS", decimals: 0 },
  { key: "kd", label: "KD", decimals: 2 },
  { key: "kast", label: "KAST", decimals: 0, suffix: "%" },
];

function formatPeriod(since, until, active) {
  if (active) return since ? `depuis ${since}` : "—";
  if (since && until && since !== until) return `${since} → ${until}`;
  return since || until || "—";
}

function LegendBadge({ level, title }) {
  if (!level || level === "member") return null;
  const info = LEGEND_LEVELS[level];
  return (
    <span className="vt-label" title={title} style={{ marginLeft: 8, color: info.color, border: `1px solid ${info.color}`, padding: "1px 6px", whiteSpace: "nowrap" }}>
      {level === "legend" && <Crown size={10} style={{ display: "inline", marginRight: 3, verticalAlign: "-1px" }} />}{info.label}
    </span>
  );
}

function MemberTable({ rows, active, onOpenPlayer, detailed }) {
  const extra = detailed ? [
    { label: "FK / FD", render: (s) => `${num(s.fk)} / ${num(s.fd)}` },
    { label: "Clutch", render: (s) => num(s.clutch) },
    { label: "Multi", render: (s) => num(s.multiKill) },
    { label: "MVP / MJ", render: (s) => `${num(s.mvp)} / ${num(s.mj)}` },
  ] : [];
  return (
    <div className="vt-panel vt-cut vt-scroll" style={{ overflowX: "auto", marginBottom: 22 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: detailed ? 1150 : 860 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--line)" }}>
            <th className="vt-th" style={{ padding: "9px 12px", textAlign: "left", cursor: "default" }}>Joueur</th>
            <th className="vt-th" style={{ padding: "9px 12px", textAlign: "right", cursor: "default" }}>Elo</th>
            <th className="vt-th" style={{ padding: "9px 12px", textAlign: "left", cursor: "default" }}>{active ? "Arrivée" : "Période"}</th>
            {MEMBER_COLUMNS.map((c) => <th key={c.key} className="vt-th" style={{ padding: "9px 12px", textAlign: "right", cursor: "default" }}>{c.label}</th>)}
            {extra.map((c) => <th key={c.label} className="vt-th" style={{ padding: "9px 12px", textAlign: "right", cursor: "default" }}>{c.label}</th>)}
            <th className="vt-th" style={{ padding: "9px 12px", textAlign: "left", cursor: "default" }}>Trophées</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="vt-row" style={{ borderBottom: "1px solid var(--line)", cursor: "pointer" }} onClick={() => onOpenPlayer(r.id)}>
              <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                <span className="vt-display" style={{ fontWeight: 600, fontSize: 15 }}>{r.player?.name || "?"}</span>
                {r.substitute && <span className="vt-label" style={{ marginLeft: 8 }}>Remplaçant</span>}
                <LegendBadge level={r.legend?.level} title={r.legend?.reasons.join(" · ")} />
              </td>
              <td className="vt-mono" style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700 }}>{Math.round(r.elo)}</td>
              <td style={{ padding: "10px 12px", fontSize: 12, color: "var(--text-dim)", whiteSpace: "nowrap" }}>{formatPeriod(r.since, r.until, active)}</td>
              {MEMBER_COLUMNS.map((c) => (
                <td key={c.key} className="vt-mono" style={{ padding: "10px 12px", textAlign: "right" }}>
                  {num(r.stats.match) > 0 || ["match", "maps", "round"].includes(c.key) ? fmtStat(r.stats[c.key], c) : "—"}
                </td>
              ))}
              {extra.map((c) => <td key={c.label} className="vt-mono" style={{ padding: "10px 12px", textAlign: "right" }}>{c.render(r.stats)}</td>)}
              <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                {r.trophies.length === 0 ? <span style={{ color: "var(--text-dim)" }}>—</span> : r.trophies.map((t, i) => (
                  <span key={i} title={`${t.type} — ${t.tournamentName}`} style={{ marginRight: 4 }}><Trophy size={13} color={TROPHY_COLOR[t.type] || TROPHY_COLOR.Autre} /></span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RosterEditModal({ teamName, organization, players, currentIds, onClose, onSave }) {
  const [name, setName] = useState(organization?.name || teamName);
  const [selected, setSelected] = useState(currentIds);
  const [search, setSearch] = useState("");
  const toggle = (id) => setSelected((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const filtered = players
    .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => Number(selected.includes(b.id)) - Number(selected.includes(a.id)) || a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));
  return (
    <ModalShell title={`Roster actif — ${teamName}`} onClose={onClose} wide>
      <Field label="Nom de l'organisation">
        <input className="vt-input" style={{ width: "100%" }} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 10 }}>
        Par défaut, le roster actif vient du dernier tournoi de l'équipe. Corrige-le ici si besoin
        (joueur signé qui n'a encore rien joué, départ…). Les 5 joueurs qui ont le plus joué
        récemment comptent pour l'Elo de l'équipe, les autres apparaissent comme remplaçants.
      </div>
      <div className="vt-label" style={{ marginBottom: 6 }}>Joueurs ({selected.length})</div>
      <input className="vt-input" style={{ width: "100%", marginBottom: 8 }} placeholder="Rechercher un joueur…" value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="vt-panel vt-cut-sm vt-scroll" style={{ maxHeight: 260, overflowY: "auto" }}>
        {filtered.map((p) => (
          <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderBottom: "1px solid var(--line)", cursor: "pointer" }}>
            <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} />
            <span className="vt-display" style={{ fontSize: 14 }}>{p.name}</span>
            {currentTeam(p) ? <span style={{ fontSize: 12, color: "var(--text-dim)" }}>({currentTeam(p)})</span> : isFreeAgent(p) && <span style={{ fontSize: 12, color: "var(--gold)" }}>(agent libre)</span>}
          </label>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        <button className="vt-btn vt-cut-sm" onClick={() => onSave({ ...organization, name: name.trim() || teamName, rosterOverride: null })}>
          Revenir au roster automatique
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="vt-btn vt-cut-sm" onClick={onClose}>Annuler</button>
          <button className="vt-btn vt-btn-primary vt-cut-sm" onClick={() => onSave({ ...organization, name: name.trim() || teamName, rosterOverride: selected })}>Enregistrer</button>
        </div>
      </div>
    </ModalShell>
  );
}

function TeamProfile({ teamKey, tournaments, players, organizations, organizationsEnabled, playerElo, agentPlays = [], teamLogos, hiddenTeams, onToggleHidden, onBack, onOpenPlayer, onSaveOrganization }) {
  const data = useMemo(
    () => buildTeamPage(teamKey, tournaments, players, { organizations, playerElo }),
    [teamKey, tournaments, players, organizations, playerElo],
  );
  const [editingRoster, setEditingRoster] = useState(false);
  const [tab, setTab] = useState("team");

  if (!data) {
    return (
      <div>
        <button className="vt-btn vt-cut-sm" style={{ marginBottom: 16 }} onClick={onBack}><ChevronLeft size={15} /> Équipes</button>
        <div className="vt-panel vt-cut-sm" style={{ padding: 20, color: "var(--text-dim)" }}>Équipe introuvable.</div>
      </div>
    );
  }

  const { entry, rank, wins, losses, bestGain, worstLoss, recent, active, former, palmares, legends, historic } = data;
  const playerName = (id) => players.find((p) => p.id === id)?.name || "?";
  const logo = getLogo(teamLogos, entry.name);
  const isHidden = hiddenTeams.includes(entry.name.trim().toLowerCase());
  const totalGames = wins + losses;
  const winRate = totalGames ? Math.round((wins / totalGames) * 100) : 0;
  const pct = Math.round((entry.elo / ELO_MAX) * 100);
  const canEditRoster = organizationsEnabled && Boolean(entry.organization);

  return (
    <div>
      <button className="vt-btn vt-cut-sm" style={{ marginBottom: 16 }} onClick={onBack}><ChevronLeft size={15} /> Équipes</button>

      <div className="vt-panel vt-cut" style={{ padding: "20px 22px", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {logo && <img src={logo} className="vt-logo-lg" alt="" />}
            <div>
              <h1 className="vt-display" style={{ fontSize: 30, fontWeight: 700, textTransform: "uppercase" }}>{entry.name}</h1>
              <div style={{ fontSize: 13, color: "var(--text-dim)" }}>#{rank} au classement Elo · Elo du roster actuel</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ textAlign: "right" }}>
              <div className="vt-mono vt-display" style={{ fontSize: 34, fontWeight: 700 }}>{Math.round(entry.elo)}</div>
              <div style={{ height: 4, width: 120, background: "var(--panel-raised)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: "var(--red)" }} />
              </div>
            </div>
            <button className="vt-btn vt-cut-sm" onClick={() => onToggleHidden(entry.name)}>
              {isHidden ? "Réintégrer" : "Retirer"}
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        {[["team", "Équipe", <Shield key="i" size={14} />], ["best", "Meilleurs 5", <Crown key="i" size={14} />]].map(([id, label, icon]) => (
          <button key={id} className="vt-btn vt-cut-sm" onClick={() => setTab(id)}
            style={{ background: tab === id ? "var(--panel-raised)" : "var(--panel)", borderColor: tab === id ? "var(--steel)" : "var(--line)" }}>
            {icon} {label}
          </button>
        ))}
      </div>

      {tab === "best" ? (
        <BestFiveSection teamKey={teamKey} members={data.members} agentPlays={agentPlays} teamLogos={teamLogos} onOpenPlayer={onOpenPlayer} />
      ) : (<>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 22 }}>
        <StatCard label="Matchs" value={totalGames} />
        <StatCard label="Victoires" value={wins} accent="var(--green)" />
        <StatCard label="Défaites" value={losses} accent="var(--red)" />
        <StatCard label="Taux de victoire" value={winRate + "%"} />
        <StatCard label="Trophées" value={palmares.length} accent="var(--gold)" />
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
        <div className="vt-label">
          Roster actif{entry.manualRoster && <span style={{ color: "var(--steel)", marginLeft: 8 }}>· corrigé à la main</span>}
        </div>
        {canEditRoster ? (
          <button className="vt-btn vt-cut-sm" style={{ padding: "5px 9px", fontSize: 11 }} onClick={() => setEditingRoster(true)}><UserCog size={12} /> Modifier le roster</button>
        ) : (
          <span style={{ fontSize: 11, color: "var(--text-dim)" }}>Correction manuelle disponible après le script SQL de l'étape C</span>
        )}
      </div>
      {active.length === 0 ? (
        <div className="vt-panel vt-cut-sm" style={{ padding: 16, color: "var(--text-dim)", fontSize: 14, marginBottom: 22 }}>Aucun joueur.</div>
      ) : <MemberTable rows={active} active onOpenPlayer={onOpenPlayer} />}

      <div className="vt-label" style={{ marginBottom: 8 }}>Palmarès</div>
      {palmares.length === 0 ? (
        <div className="vt-panel vt-cut-sm" style={{ padding: 16, color: "var(--text-dim)", fontSize: 14, marginBottom: 22 }}>Aucun tournoi remporté pour l'instant.</div>
      ) : (
        <div className="vt-panel vt-cut" style={{ padding: 4, marginBottom: 22 }}>
          {[...palmares].sort((a, b) => (TROPHY_RANK[b.type] ?? 0) - (TROPHY_RANK[a.type] ?? 0) || String(b.date).localeCompare(String(a.date))).map((t, i, arr) => {
            const c = TROPHY_COLOR[t.type] || TROPHY_COLOR.Autre;
            return (
              <div key={t.tournamentId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", padding: "10px 16px", borderBottom: i < arr.length - 1 ? "1px solid var(--line)" : "none" }}>
                <span className="vt-display" style={{ fontWeight: 600, color: c, display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Trophy size={14} color={c} /> {t.type} — {t.tournamentName}
                  {t.date && <span className="vt-mono" style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 400 }}>{t.date.slice(0, 4)}</span>}
                </span>
                <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{t.playerIds.map(playerName).join(" · ")}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="vt-label" style={{ marginBottom: 4 }}>Légendes du club</div>
      <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 8 }}>
        Trois chemins mènent au statut de Légende : une longévité exceptionnelle à elle seule, un gros
        palmarès avec une vraie durée dans l'équipe, ou un ensemble solide longévité + palmarès +
        performance. Les Figures historiques ont marqué l'équipe sans aller jusque-là.
      </div>
      {legends.length + historic.length === 0 ? (
        <div className="vt-panel vt-cut-sm" style={{ padding: 16, color: "var(--text-dim)", fontSize: 14, marginBottom: 22 }}>Pas encore de légende ni de figure historique.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10, marginBottom: 22 }}>
          {[...legends, ...historic].map((m) => {
            const info = LEGEND_LEVELS[m.legend.level];
            return (
              <div key={m.id} className="vt-panel vt-cut-sm vt-row" style={{ padding: 14, cursor: "pointer", borderColor: m.legend.level === "legend" ? "var(--gold)" : undefined }} onClick={() => onOpenPlayer(m.id)}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                  <span className="vt-display" style={{ fontWeight: 700, fontSize: 16 }}>{m.player?.name || "?"}</span>
                  <span className="vt-label" style={{ color: info.color, display: "inline-flex", alignItems: "center", gap: 4 }}>
                    {m.legend.level === "legend" && <Crown size={11} />}{info.label}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 8 }}>
                  {formatPeriod(m.since, m.until, m.active)}{m.active ? " · dans le roster actuel" : ""}
                </div>
                {m.legend.reasons.map((reason) => (
                  <div key={reason} style={{ fontSize: 12, lineHeight: 1.6 }}>{reason}</div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      <div className="vt-label" style={{ marginBottom: 4 }}>Anciens joueurs ({former.length})</div>
      <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 8 }}>
        Stats calculées uniquement sur leurs matchs avec {entry.name} (tous les matchs enregistrés).
      </div>
      {former.length === 0 ? (
        <div className="vt-panel vt-cut-sm" style={{ padding: 16, color: "var(--text-dim)", fontSize: 14, marginBottom: 22 }}>Aucun ancien joueur.</div>
      ) : <MemberTable rows={former} detailed onOpenPlayer={onOpenPlayer} />}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 10, marginBottom: 22 }}>
        <div className="vt-panel vt-cut-sm" style={{ padding: 14 }}>
          <div className="vt-label" style={{ marginBottom: 8 }}>Plus gros gain Elo</div>
          {bestGain ? (
            <>
              <div className="vt-mono" style={{ color: "var(--green)", fontWeight: 700, fontSize: 20 }}>+{Math.round(bestGain.delta)}</div>
              <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>vs {bestGain.opponentName} — {bestGain.tournamentName} · {bestGain.matchLabel}</div>
            </>
          ) : <div style={{ color: "var(--text-dim)", fontSize: 13 }}>Aucune victoire enregistrée.</div>}
        </div>
        <div className="vt-panel vt-cut-sm" style={{ padding: 14 }}>
          <div className="vt-label" style={{ marginBottom: 8 }}>Plus grosse perte Elo</div>
          {worstLoss ? (
            <>
              <div className="vt-mono" style={{ color: "var(--red)", fontWeight: 700, fontSize: 20 }}>{Math.round(worstLoss.delta)}</div>
              <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>vs {worstLoss.opponentName} — {worstLoss.tournamentName} · {worstLoss.matchLabel}</div>
            </>
          ) : <div style={{ color: "var(--text-dim)", fontSize: 13 }}>Aucune défaite enregistrée.</div>}
        </div>
      </div>

      <div className="vt-label" style={{ marginBottom: 8 }}>Historique récent</div>
      {recent.length === 0 ? (
        <div className="vt-panel vt-cut-sm" style={{ padding: 16, color: "var(--text-dim)", fontSize: 14 }}>Aucun événement enregistré.</div>
      ) : (
        <div className="vt-panel vt-cut" style={{ padding: 4 }}>
          {recent.map((h, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: i < recent.length - 1 ? "1px solid var(--line)" : "none" }}>
              <div>
                {h.type === "trophy" ? (
                  <span className="vt-display" style={{ fontSize: 13, color: TROPHY_COLOR[h.tournamentType] || TROPHY_COLOR.Autre }}>
                    <Trophy size={12} style={{ display: "inline", marginRight: 5 }} />{h.tournamentType} — {h.tournamentName}
                  </span>
                ) : (
                  <span style={{ fontSize: 13 }}>
                    <span style={{ color: h.result === "W" ? "var(--green)" : "var(--red)", fontWeight: 700, marginRight: 6 }}>{h.result}</span>
                    vs {h.opponentName} <span style={{ color: "var(--text-dim)" }}>— {h.tournamentName} · {h.matchLabel}</span>
                  </span>
                )}
              </div>
              <span className="vt-mono" style={{ fontSize: 12, fontWeight: 700, color: h.delta >= 0 ? "var(--green)" : "var(--red)" }}>
                {h.delta >= 0 ? "+" : ""}{Math.round(h.delta)}
              </span>
            </div>
          ))}
        </div>
      )}

      </>)}

      {editingRoster && (
        <RosterEditModal
          teamName={entry.name}
          organization={entry.organization}
          players={players}
          currentIds={active.map((r) => r.id)}
          onClose={() => setEditingRoster(false)}
          onSave={(org) => { onSaveOrganization(org); setEditingRoster(false); }}
        />
      )}
    </div>
  );
}

// list views keep their remembered scroll position; detail views always open at the top
const LIST_VIEWS = new Set(["leaderboard", "tournaments", "records", "teams", "agents", "maps"]);

// players whose object changed between two versions of the list — only those need saving
function changedPlayers(before, after) {
  const previous = new Map(before.map((p) => [p.id, p]));
  return after.filter((p) => previous.get(p.id) !== p);
}

// ---------- app ----------
export default function App() {
  const [players, setPlayers] = useState([]);
  const [teamLogos, setTeamLogos] = useState({});
  const [tournaments, setTournaments] = useState([]);
  const [hiddenTeams, setHiddenTeams] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [organizationsEnabled, setOrganizationsEnabled] = useState(false);
  // agents / maps ajoutés depuis l'appli ; la version force le recalcul des stats qui en dépendent
  const [gameSettings, setGameSettings] = useState({ agents: [], maps: [] });
  const [gameSettingsEnabled, setGameSettingsEnabled] = useState(false);
  const [gameDataVersion, setGameDataVersion] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [session, setSession] = useState(null);
  const [view, setView] = useState({ name: "leaderboard" });
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(null); // 'addPlayer' | 'editProfile' | 'correctStats' | 'addMatch' | 'import' | 'createTournament' | 'addTeam' | 'editTeam' | 'addTournamentMatch' | 'finishTournament' | null
  const [editingTeam, setEditingTeam] = useState(null);
  const [editingMatch, setEditingMatch] = useState(null);
  const [sortKey, setSortKey] = useState("rating");
  const [sortDir, setSortDir] = useState("desc");
  const [dataFilters, setDataFilters] = useState(() => ({ ...DEFAULT_DATA_FILTERS, types: { ...DEFAULT_DATA_FILTERS.types } }));
  const scrollPositions = useRef({ leaderboard: 0, tournaments: 0, records: 0, teams: 0, agents: 0, maps: 0 });

  // All writes are optimistic: the UI updates immediately, then Supabase is updated in the
  // background. Writes run one after another (never in parallel) so an older save can't land
  // after a newer one and overwrite it. A failure stays on screen until it is dismissed — a
  // later successful save does not hide it, because the failed change is still missing.
  const writeQueue = useRef(Promise.resolve());
  const persist = (write, context = "sauvegarde") => {
    writeQueue.current = writeQueue.current
      .then(write)
      .catch((error) => {
        console.error(`[ValTrack] Échec ${context}:`, error);
        const denied = error?.code === "42501" || /row-level security/i.test(error?.message || "");
        setSaveError(denied
          ? `Modification refusée (${context}) : connecte-toi pour modifier les données. Recharge la page pour retrouver l'état enregistré.`
          : `Échec de ${context} dans Supabase : ${error?.message || String(error)}. Recharge la page pour vérifier ce qui a été enregistré.`);
      });
  };

  // session Supabase (connexion facultative tant que les règles RLS ne l'exigent pas)
  useEffect(() => {
    if (!supabase) return undefined;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (!isSupabaseConfigured) {
          throw new Error("Supabase n'est pas configuré. Ajoute VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env.");
        }

        let data = await loadValtrackData();

        // Migration automatique depuis l'ancien window.storage, uniquement si la base Supabase
        // est encore vide et que l'ancien stockage existe dans l'environnement actuel.
        const dbIsEmpty = data.players.length === 0 && data.tournaments.length === 0;
        if (dbIsEmpty) {
          const legacy = await readLegacyWindowStorage({
            players: STORAGE_KEY,
            tournaments: TOURNAMENTS_KEY,
            teamLogos: "vt_team_logos_v1",
            hiddenTeams: HIDDEN_TEAMS_KEY,
          });

          if (legacy) {
            const legacyData = {
              players: (legacy.players || []).map(migratePlayer),
              tournaments: (legacy.tournaments || []).map(migrateTournament),
              teamLogos: legacy.teamLogos || {},
              hiddenTeams: legacy.hiddenTeams || [],
            };
            await migrateLegacySnapshotDb(legacyData);
            data = legacyData;
          }
        }

        if (cancelled) return;
        setPlayers((data.players || []).map(migratePlayer));
        setTournaments((data.tournaments || []).map(migrateTournament));
        setTeamLogos(data.teamLogos || {});
        setHiddenTeams(data.hiddenTeams || []);
        setCustomGameData(data.gameSettings || {});
        setGameSettings(data.gameSettings || { agents: [], maps: [] });
        setGameSettingsEnabled(Boolean(data.gameSettingsEnabled));
        setGameDataVersion((v) => v + 1);
        setOrganizations(data.organizations || []);
        setOrganizationsEnabled(Boolean(data.organizationsEnabled));
        setSaveError("");

        // Les logos sont chargés après les données essentielles. Ils peuvent donc apparaître
        // progressivement sans empêcher le classement, la recherche ou les tris de fonctionner.
        loadTeamLogosDb((teamKey, url) => {
          if (!cancelled) {
            setTeamLogos((prev) => ({ ...prev, [teamKey]: url }));
          }
        }).catch((logoError) => {
          console.warn("[ValTrack] Chargement des logos en arrière-plan impossible :", logoError);
        });
      } catch (error) {
        console.error("[ValTrack] Chargement Supabase impossible:", error);
        if (!cancelled) setSaveError(`Chargement impossible : ${error?.message || String(error)}`);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // list views ("leaderboard", "tournaments") keep their own remembered scroll position;
  // detail views ("player", "tournament") always open at the top
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (LIST_VIEWS.has(view.name)) window.scrollTo(0, scrollPositions.current[view.name] || 0);
      else window.scrollTo(0, 0);
    });
    return () => cancelAnimationFrame(id);
  }, [view]);

  const openPlayer = (id) => {
    scrollPositions.current.leaderboard = window.scrollY;
    setView({ name: "player", id });
  };
  const openTournament = (id) => {
    scrollPositions.current.tournaments = window.scrollY;
    setView({ name: "tournament", id });
  };
  const openTeam = (teamKey) => {
    scrollPositions.current.teams = window.scrollY;
    setView({ name: "team", key: teamKey });
  };
  const backToLeaderboard = () => setView({ name: "leaderboard" });
  const backToTournaments = () => setView({ name: "tournaments" });

  const toggleSort = (key) => {
    if (key === "name") {
      if (sortKey === "name" && sortDir === "asc") { setSortDir("desc"); return; }
      if (sortKey === "name" && sortDir === "desc") { setSortKey("nationality"); setSortDir("asc"); return; }
      setSortKey("name"); setSortDir("asc");
      return;
    }
    if (key === sortKey) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const setLogo = (teamName, file) => {
    const key = teamName.trim().toLowerCase();
    const previewUrl = file instanceof Blob ? URL.createObjectURL(file) : file;

    setTeamLogos((prev) => ({ ...prev, [key]: previewUrl }));

    persist(() =>
      setTeamLogoDb(key, file).then((publicUrl) => {
        setTeamLogos((prev) => ({ ...prev, [key]: publicUrl }));
        if (file instanceof Blob && previewUrl?.startsWith("blob:")) {
          URL.revokeObjectURL(previewUrl);
        }
      }),
      "la sauvegarde du logo"
    );
  };

  const updateGameSettings = (key, value) => {
    const next = { ...gameSettings, [key]: value };
    setCustomGameData(next);
    setGameSettings(next);
    setGameDataVersion((v) => v + 1);
    persist(() => saveGameSettingDb(key, value), key === "agents" ? "l'ajout d'agent" : "l'ajout de map");
  };
  const addCustomAgent = (name, role) => {
    if (agentRole(name)) { setSaveError(`${canonicalAgent(name)} existe déjà dans la liste des agents.`); return; }
    updateGameSettings("agents", [...gameSettings.agents, { name, role }]);
  };
  const removeCustomAgent = (name) => updateGameSettings("agents", gameSettings.agents.filter((a) => a.name !== name));
  const addCustomMap = (name) => {
    if (getMaps().some((m) => m.toLowerCase() === name.toLowerCase())) { setSaveError(`${name} existe déjà dans la liste des maps.`); return; }
    updateGameSettings("maps", [...gameSettings.maps, name]);
  };
  const removeCustomMap = (name) => updateGameSettings("maps", gameSettings.maps.filter((m) => m !== name));

  const saveOrganization = (org) => {
    setOrganizations((prev) => (prev.some((o) => o.id === org.id) ? prev.map((o) => (o.id === org.id ? org : o)) : [...prev, org]));
    persist(() => upsertOrganizationDb(org), `la sauvegarde de l'organisation ${org.name}`);
  };

  const toggleHiddenTeam = (teamName) => {
    const key = teamName.trim().toLowerCase();
    const willBeHidden = !hiddenTeams.includes(key);
    setHiddenTeams((prev) => willBeHidden ? [...prev, key] : prev.filter((x) => x !== key));
    persist(() => setHiddenTeamDb(key, willBeHidden), "la visibilité de l'équipe");
  };

  const upsertPlayer = (p) => {
    setPlayers((prev) => {
      const idx = prev.findIndex((x) => x.id === p.id);
      if (idx === -1) return [...prev, p];
      const copy = [...prev];
      copy[idx] = p;
      return copy;
    });
    persist(() => upsertPlayerDb(p), `la sauvegarde de ${p.name}`);
    setModal(null);
  };

  // silent update (no modal to close) — used for trophies, added inline on the profile page
  const updatePlayer = (p) => {
    // la fiche affichée contient des valeurs calculées (MVP, MJ, Elo) : on garde les stats
    // réellement enregistrées pour ne jamais les figer en base
    const raw = players.find((x) => x.id === p.id);
    const next = raw ? { ...p, stats: raw.stats } : p;
    setPlayers((prev) => prev.map((x) => (x.id === p.id ? next : x)));
    persist(() => upsertPlayerDb(next), `la sauvegarde de ${p.name}`);
  };

  // Must stay synchronous because TeamModal immediately needs the returned player's id.
  const quickCreatePlayer = (name) => {
    const p = { id: uid(), name, nationality: "", teamHistory: [], trophies: [], stats: emptyStats() };
    setPlayers((prev) => [...prev, p]);
    persist(() => upsertPlayerDb(p), `la création de ${name}`);
    return p;
  };

  const deletePlayer = (playerId) => {
    setPlayers((prev) => prev.filter((p) => p.id !== playerId));
    persist(() => deletePlayerDb(playerId), "la suppression du joueur");
    setView({ name: "leaderboard" });
  };

  const importRows = (rows) => {
    const byName = new Map(players.map((p) => [p.name.toLowerCase(), p]));

    rows.forEach((row) => {
      const key = row.name.toLowerCase();
      const existing = byName.get(key);
      const player = existing
        ? { ...existing, stats: { ...existing.stats }, teamHistory: [...(existing.teamHistory || [])] }
        : { id: uid(), name: row.name, nationality: "", teamHistory: [], trophies: [], stats: emptyStats() };

      if (row.team && currentTeam(player) !== row.team) {
        player.teamHistory = [...player.teamHistory, { id: uid(), team: row.team, since: new Date().toISOString().slice(0, 10) }];
      }
      if (row.nationality) {
        const val = String(row.nationality).trim();
        const byCode = COUNTRIES.find((c) => c[0].toLowerCase() === val.toLowerCase());
        const byName2 = COUNTRIES.find((c) => normalizeHeader(c[1]) === normalizeHeader(val));
        player.nationality = byCode ? byCode[0] : byName2 ? byName2[0] : (val.length === 2 ? val.toUpperCase() : val);
      }
      STAT_FIELDS.forEach((f) => {
        if (row[f.key] !== undefined && row[f.key] !== "") player.stats[f.key] = row[f.key];
      });
      player.stats = computeDerived(resetAverageCounts(player.stats, existing?.stats));
      byName.set(key, player);
    });

    const nextPlayers = Array.from(byName.values());
    setPlayers(nextPlayers);
    persist(() => upsertPlayersDb(changedPlayers(players, nextPlayers)), "l'import des joueurs");
    setModal(null);
  };

  // ---- tournaments ----
  const upsertTournament = (t) => {
    setTournaments((prev) => {
      const idx = prev.findIndex((x) => x.id === t.id);
      if (idx === -1) return [...prev, t];
      const copy = [...prev];
      copy[idx] = t;
      return copy;
    });
    persist(() => upsertTournamentDb(t), `la sauvegarde du tournoi ${t.name}`);
  };

  // le tournoi le plus récent (ou sans date) reflète les effectifs actuels
  const isCurrentTournament = (tournamentId) => {
    const t = tournaments.find((x) => x.id === tournamentId);
    if (!t) return false;
    if (!t.date) return true;
    return tournaments.every((x) => !x.date || x.date <= t.date);
  };

  // Roster actif d'une équipe existante, pour pré-remplir une inscription à un tournoi
  const teamRanking = useMemo(() => computeTeamElo(tournaments, undefined, organizations, players), [tournaments, organizations, players]);
  const suggestRoster = (name, organizationId) => {
    const wanted = normalizedTeamName(name);
    const entry = organizationId
      ? teamRanking.find((r) => r.key === organizationId)
      : teamRanking.find((r) => orgNames(r.key, tournaments, r.organization).has(wanted));
    if (entry) return { teamName: entry.name, ids: [...entry.roster.map((r) => r.id), ...entry.substitutes] };
    // équipe jamais inscrite : les joueurs dont le profil indique ce club
    const ids = players.filter((p) => normalizedTeamName(currentTeam(p)) === wanted).map((p) => p.id);
    return { teamName: name, ids };
  };

  const saveTeam = (tournamentId, team, newOrganization = null) => {
    // l'organisation doit exister avant l'équipe qui la référence (les écritures sont en file)
    if (newOrganization) saveOrganization(newOrganization);

    // Tournoi actuel : chaque joueur inscrit est rattaché à cette équipe sur son profil.
    // Un joueur ne pouvant être que dans un club, son ancien club le perd automatiquement.
    if (isCurrentTournament(tournamentId)) {
      const tournament = tournaments.find((t) => t.id === tournamentId);
      const date = tournament?.date || new Date().toISOString().slice(0, 10);
      const names = orgNames(orgKeyOf(team), [...tournaments, { teams: [team] }], newOrganization || organizations.find((o) => o.id === team.organizationId));
      const nextPlayers = players.map((p) => {
        if (!team.playerIds.includes(p.id)) return p;
        if (names.has(normalizedTeamName(currentTeam(p)))) return p;
        return transferPlayer(p, team.name, date);
      });
      const moved = changedPlayers(players, nextPlayers);
      if (moved.length) {
        setPlayers(nextPlayers);
        persist(() => upsertPlayersDb(moved), "le transfert des joueurs");
      }
    }
    setTournaments((prev) => prev.map((t) => {
      if (t.id !== tournamentId) return t;
      const idx = t.teams.findIndex((x) => x.id === team.id);
      const teams = idx === -1 ? [...t.teams, team] : t.teams.map((x) => (x.id === team.id ? team : x));
      return { ...t, teams };
    }));
    persist(() => upsertTeamDb(tournamentId, team), `la sauvegarde de l'équipe ${team.name}`);
    setModal(null);
    setEditingTeam(null);
  };

  const saveTournamentMatch = (tournamentId, match, wasApplied) => {
    const tournamentBefore = tournaments.find((t) => t.id === tournamentId);
    const previousMatch = tournamentBefore?.matches.find((m) => m.id === match.id) || null;

    setTournaments((prev) => prev.map((t) => {
      if (t.id !== tournamentId) return t;
      const exists = t.matches.some((m) => m.id === match.id);
      const matches = exists ? t.matches.map((m) => (m.id === match.id ? match : m)) : [...t.matches, match];
      return { ...t, matches };
    }));
    persist(() => upsertMatchDb(tournamentId, match), `la sauvegarde du match ${match.label}`);

    // Nouveau match appliqué : on ajoute ses stats une seule fois.
    // Match déjà appliqué puis modifié : on retire l'ancienne version, puis on ajoute la nouvelle.
    if (match.appliedToStats && !wasApplied) {
      const nextPlayers = players.map((p) => {
        const rowStats = match.stats[p.id];
        if (!rowStats) return p;
        const hasValue = Object.values(rowStats).some((v) => v !== "" && v !== undefined);
        if (!hasValue) return p;
        return { ...p, prevStats: p.stats, stats: applyMatchToStats(p.stats, rowStats) };
      });
      setPlayers(nextPlayers);
      persist(() => upsertPlayersDb(changedPlayers(players, nextPlayers)), "la mise à jour des statistiques joueurs");
    } else if (wasApplied && previousMatch) {
      const nextPlayers = players.map((p) => {
        const oldRow = previousMatch.stats?.[p.id];
        const newRow = match.stats?.[p.id];
        const oldHasValue = oldRow && Object.values(oldRow).some((v) => v !== "" && v !== undefined);
        const newHasValue = newRow && Object.values(newRow).some((v) => v !== "" && v !== undefined);
        if (!oldHasValue && !newHasValue) return p;

        let corrected = p.stats;
        if (oldHasValue) corrected = removeMatchFromStats(corrected, oldRow);
        if (newHasValue && match.appliedToStats) corrected = applyMatchToStats(corrected, newRow);
        // une modification ne déplace pas la référence des couleurs vert/rouge (seul un
        // nouveau match le fait) : sinon tout repasse en blanc après une simple correction
        return { ...p, stats: corrected };
      });
      setPlayers(nextPlayers);
      persist(() => upsertPlayersDb(changedPlayers(players, nextPlayers)), "la correction des statistiques joueurs après modification du match");
    }

    setModal(null);
    setEditingMatch(null);
  };

  const applyTournamentMatchNow = (tournamentId, matchId) => {
    const tournament = tournaments.find((t) => t.id === tournamentId);
    const match = tournament?.matches.find((m) => m.id === matchId);
    if (!match || match.appliedToStats) return;

    const nextPlayers = players.map((p) => {
      const rowStats = match.stats[p.id];
      if (!rowStats) return p;
      const hasValue = Object.values(rowStats).some((v) => v !== "" && v !== undefined);
      if (!hasValue) return p;
      return { ...p, prevStats: p.stats, stats: applyMatchToStats(p.stats, rowStats) };
    });
    setPlayers(nextPlayers);
    persist(() => upsertPlayersDb(changedPlayers(players, nextPlayers)), "la mise à jour des statistiques joueurs");

    setTournaments((prev) => prev.map((t) => (
      t.id === tournamentId ? { ...t, matches: t.matches.map((m) => (m.id === matchId ? { ...m, appliedToStats: true } : m)) } : t
    )));
    persist(() => setMatchAppliedDb(matchId, true), "l'application du match au classement");
  };

  const finishTournament = (tournamentId, winnerTeamId) => {
    const tournament = tournaments.find((t) => t.id === tournamentId);
    if (!tournament) return;
    const winnerTeam = tournament.teams.find((t) => t.id === winnerTeamId);
    const updatedTournament = { ...tournament, winnerTeamId, finished: true };

    setTournaments((prev) => prev.map((t) => (t.id === tournamentId ? updatedTournament : t)));
    persist(() => upsertTournamentDb(updatedTournament), `la clôture du tournoi ${tournament.name}`);

    if (winnerTeam) {
      const trophy = { id: uid(), type: tournament.type, detail: tournament.name, tournamentId };
      const nextPlayers = players.map((p) => (
        winnerTeam.playerIds.includes(p.id) ? { ...p, trophies: [...(p.trophies || []), trophy] } : p
      ));
      setPlayers(nextPlayers);
      persist(() => upsertPlayersDb(changedPlayers(players, nextPlayers)), "l'attribution des trophées");
    }
    setModal(null);
  };

  const updateTournamentInfo = (tournamentId, updates) => {
    const tournament = tournaments.find((t) => t.id === tournamentId);
    if (!tournament) return;
    const oldWinnerId = tournament.winnerTeamId;
    const newWinnerId = updates.winnerTeamId !== undefined ? updates.winnerTeamId : oldWinnerId;
    const winnerChanged = tournament.finished && newWinnerId !== oldWinnerId;
    const typeOrNameChanged = updates.type !== tournament.type || updates.name !== tournament.name;
    const updatedTournament = { ...tournament, ...updates };

    setTournaments((prev) => prev.map((t) => (t.id === tournamentId ? updatedTournament : t)));
    persist(() => upsertTournamentDb(updatedTournament), `la modification du tournoi ${tournament.name}`);

    if (tournament.finished) {
      let nextPlayers = players;
      if (winnerChanged) {
        const oldWinnerTeam = tournament.teams.find((x) => x.id === oldWinnerId);
        const newWinnerTeam = tournament.teams.find((x) => x.id === newWinnerId);
        nextPlayers = players.map((p) => {
          let trophies = p.trophies || [];
          if (oldWinnerTeam?.playerIds.includes(p.id)) trophies = trophies.filter((tr) => tr.tournamentId !== tournamentId);
          if (newWinnerTeam?.playerIds.includes(p.id)) trophies = [...trophies, { id: uid(), type: updates.type || tournament.type, detail: updates.name || tournament.name, tournamentId }];
          return { ...p, trophies };
        });
      } else if (typeOrNameChanged) {
        nextPlayers = players.map((p) => ({
          ...p,
          trophies: (p.trophies || []).map((tr) => (tr.tournamentId === tournamentId ? { ...tr, type: updates.type || tournament.type, detail: updates.name || tournament.name } : tr)),
        }));
      }

      if (nextPlayers !== players) {
        setPlayers(nextPlayers);
        persist(() => upsertPlayersDb(changedPlayers(players, nextPlayers)), "la mise à jour des trophées");
      }
    }
    setModal(null);
  };

  const toggleTeamEliminated = (tournamentId, teamId) => {
    const tournament = tournaments.find((t) => t.id === tournamentId);
    const team = tournament?.teams.find((x) => x.id === teamId);
    if (!team) return;
    const updatedTeam = { ...team, eliminated: !team.eliminated };

    setTournaments((prev) => prev.map((t) => (
      t.id !== tournamentId ? t : { ...t, teams: t.teams.map((x) => (x.id === teamId ? updatedTeam : x)) }
    )));
    persist(() => upsertTeamDb(tournamentId, updatedTeam), `la mise à jour de l'équipe ${team.name}`);
  };

  // MVP/MJ are fully derived from every recorded match (applied or not) — never stored,
  // so there's nothing to keep in sync
  const mvpMjCounts = useMemo(() => computeMvpMjCounts(tournaments), [tournaments]);
  // Elo individuel : recalculé à partir de tous les matchs, jamais stocké non plus
  const playerElo = useMemo(() => computePlayerElo(tournaments), [tournaments]);
  const displayPlayers = useMemo(() => players.map((p) => ({
    ...p,
    stats: {
      ...p.stats,
      mvp: mvpMjCounts[p.id]?.mvp || 0,
      mj: mvpMjCounts[p.id]?.mj || 0,
      elo: playerElo.get(p.id)?.elo ?? ELO_START,
    },
  })), [players, mvpMjCounts, playerElo]);

  const filteredLeaderboardPlayers = useMemo(
    () => buildFilteredLeaderboardPlayers(displayPlayers, tournaments, dataFilters),
    [displayPlayers, tournaments, dataFilters]
  );

  const activePlayer = view.name === "player" ? displayPlayers.find((p) => p.id === view.id) : null;
  // the raw (non-overlaid) player — used for anything that can save, so the live MVP/MJ
  // snapshot never gets baked into real storage
  const rawActivePlayer = view.name === "player" ? players.find((p) => p.id === view.id) : null;
  const activePlayerId = view.name === "player" ? view.id : null;
  // une ligne par joueur et par map où son agent est connu (profils, rôles, agent habituel)
  const agentPlays = useMemo(() => collectAgentPlays(tournaments), [tournaments, gameDataVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const usualAgents = useMemo(() => {
    const counts = new Map();
    agentPlays.forEach((p) => {
      if (!counts.has(p.playerId)) counts.set(p.playerId, new Map());
      const c = counts.get(p.playerId);
      c.set(p.agent, (c.get(p.agent) || 0) + 1);
    });
    return new Map([...counts].map(([id, c]) => [id, [...c].sort((a, b) => b[1] - a[1])[0][0]]));
  }, [agentPlays]);
  const activeClubStatuses = useMemo(
    () => (activePlayerId ? clubStatusesForPlayer(activePlayerId, tournaments, players, { organizations, playerElo }) : []),
    [activePlayerId, tournaments, players, organizations, playerElo],
  );
  const activeTournament = view.name === "tournament" ? tournaments.find((t) => t.id === view.id) : null;

  return (
    <div className="vt-root" style={{ paddingBottom: 60 }}>
      <Styles />
      <div style={{ maxWidth: 1450, margin: "0 auto", padding: "28px 20px" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="vt-cut-sm" style={{ background: "var(--red)", width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Swords size={18} color="#180508" />
            </div>
            <div>
              <div className="vt-display" style={{ fontSize: 24, fontWeight: 700, letterSpacing: "0.04em", lineHeight: 1 }}>VALTRACK</div>
              <div className="vt-label" style={{ color: "var(--text-dim)" }}>Registre de performances</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {!loaded && <Loader2 className="vt-mono" size={18} style={{ animation: "spin 1s linear infinite", color: "var(--text-dim)" }} />}
            {supabase && (session ? (
              <>
                <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{session.user?.email}</span>
                <button className="vt-btn vt-cut-sm" style={{ padding: "6px 10px", fontSize: 11 }} onClick={() => supabase.auth.signOut()}>Déconnexion</button>
              </>
            ) : (
              <button className="vt-btn vt-cut-sm" style={{ padding: "6px 10px", fontSize: 11 }} onClick={() => setModal("login")}>Connexion</button>
            ))}
          </div>
        </header>

        {saveError && (
          <div className="vt-cut-sm" style={{ background: "var(--red-dim)", border: "1px solid var(--red)", color: "var(--red)", padding: "10px 14px", fontSize: 13, marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
              <span>⚠ {saveError}</span>
              <button onClick={() => setSaveError("")} title="Masquer" style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0, display: "flex" }}><X size={14} /></button>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginBottom: 22 }}>
          <button
            className="vt-btn vt-cut-sm"
            style={{ background: (view.name === "leaderboard" || view.name === "player") ? "var(--panel-raised)" : "var(--panel)", borderColor: (view.name === "leaderboard" || view.name === "player") ? "var(--steel)" : "var(--line)" }}
            onClick={backToLeaderboard}
          >
            <Award size={14} /> Classement
          </button>
          <button
            className="vt-btn vt-cut-sm"
            style={{ background: (view.name === "tournaments" || view.name === "tournament") ? "var(--panel-raised)" : "var(--panel)", borderColor: (view.name === "tournaments" || view.name === "tournament") ? "var(--steel)" : "var(--line)" }}
            onClick={backToTournaments}
          >
            <Trophy size={14} /> Tournois
          </button>
          <button
            className="vt-btn vt-cut-sm"
            style={{ background: view.name === "records" ? "var(--panel-raised)" : "var(--panel)", borderColor: view.name === "records" ? "var(--steel)" : "var(--line)" }}
            onClick={() => setView({ name: "records" })}
          >
            <Flame size={14} /> Records
          </button>
          <button
            className="vt-btn vt-cut-sm"
            style={{ background: (view.name === "teams" || view.name === "team") ? "var(--panel-raised)" : "var(--panel)", borderColor: (view.name === "teams" || view.name === "team") ? "var(--steel)" : "var(--line)" }}
            onClick={() => setView({ name: "teams" })}
          >
            <Shield size={14} /> Équipes
          </button>
          <button
            className="vt-btn vt-cut-sm"
            style={{ background: (view.name === "agents" || view.name === "agent") ? "var(--panel-raised)" : "var(--panel)", borderColor: (view.name === "agents" || view.name === "agent") ? "var(--steel)" : "var(--line)" }}
            onClick={() => setView({ name: "agents" })}
          >
            <Crosshair size={14} /> Agents
          </button>
          <button
            className="vt-btn vt-cut-sm"
            style={{ background: (view.name === "maps" || view.name === "map") ? "var(--panel-raised)" : "var(--panel)", borderColor: (view.name === "maps" || view.name === "map") ? "var(--steel)" : "var(--line)" }}
            onClick={() => setView({ name: "maps" })}
          >
            <MapIcon size={14} /> Maps
          </button>
        </div>

        {view.name === "records" && <RecordsView tournaments={tournaments} players={players} filters={dataFilters} onFiltersChange={setDataFilters} />}
        {view.name === "teams" && <TeamsLeaderboard tournaments={tournaments} players={players} organizations={organizations} teamLogos={teamLogos} hiddenTeams={hiddenTeams} onToggleHidden={toggleHiddenTeam} onOpenTeam={openTeam} />}
        {view.name === "agents" && (
          <AgentsView tournaments={tournaments} players={players} teamLogos={teamLogos} onSetLogo={setLogo}
            gameDataVersion={gameDataVersion} settingsEnabled={gameSettingsEnabled} onAddAgent={addCustomAgent} onRemoveAgent={removeCustomAgent} onOpenAgent={(agent) => { scrollPositions.current.agents = window.scrollY; setView({ name: "agent", agent }); }} />
        )}
        {view.name === "agent" && (
          <AgentDetail
            agent={view.agent} tournaments={tournaments} players={players} teamLogos={teamLogos} onSetLogo={setLogo} gameDataVersion={gameDataVersion}
            onBack={() => setView({ name: "agents" })}
            onOpenPlayer={(id) => setView({ name: "player", id })}
            onOpenTeam={openTeam}
          />
        )}
        {view.name === "maps" && (
          <MapsView tournaments={tournaments} gameDataVersion={gameDataVersion} settingsEnabled={gameSettingsEnabled}
            onAddMap={addCustomMap} onRemoveMap={removeCustomMap}
            onOpenMap={(map) => { scrollPositions.current.maps = window.scrollY; setView({ name: "map", map }); }} />
        )}
        {view.name === "map" && (
          <MapDetail mapName={view.map} tournaments={tournaments} teamLogos={teamLogos}
            onBack={() => setView({ name: "maps" })} onOpenTeam={openTeam}
            onOpenAgent={(agent) => setView({ name: "agent", agent })} />
        )}
        {view.name === "team" && (
          <TeamProfile
            teamKey={view.key}
            tournaments={tournaments}
            players={players}
            organizations={organizations}
            organizationsEnabled={organizationsEnabled}
            playerElo={playerElo}
            agentPlays={agentPlays}
            onSaveOrganization={saveOrganization}
            teamLogos={teamLogos}
            hiddenTeams={hiddenTeams}
            onToggleHidden={toggleHiddenTeam}
            onBack={() => setView({ name: "teams" })}
            onOpenPlayer={(id) => setView({ name: "player", id })}
          />
        )}

        {view.name === "leaderboard" && (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 18, alignItems: "center" }}>
              <div className="vt-panel vt-cut-sm" style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", flex: "1 1 220px" }}>
                <Search size={15} color="#8792A0" />
                <input
                  placeholder="Rechercher un joueur…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  style={{ background: "none", border: "none", outline: "none", color: "var(--text)", fontSize: 14, width: "100%" }}
                />
              </div>
              <button className="vt-btn vt-cut-sm" onClick={() => setModal("import")}><Upload size={14} /> Importer</button>
              <button className="vt-btn vt-btn-primary vt-cut-sm" onClick={() => setModal("addPlayer")}><Plus size={14} /> Joueur</button>
            </div>
            <DataFiltersPanel filters={dataFilters} onChange={setDataFilters} tournaments={tournaments} />
            <Leaderboard
              players={filteredLeaderboardPlayers}
              query={query}
              onOpenPlayer={openPlayer}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
              teamLogos={teamLogos}
            />
          </>
        )}

        {activePlayer && (
          <PlayerDetail
            player={activePlayer}
            players={displayPlayers}
            eloHistory={playerElo.get(activePlayer.id)?.history || []}
            clubStatuses={activeClubStatuses}
            onSetLogo={setLogo}
            agentProfile={activePlayerId ? playerAgentProfile(activePlayerId, agentPlays) : null}
            onOpenTeam={openTeam}
            tournaments={tournaments}
            teamLogos={teamLogos}
            onBack={backToLeaderboard}
            onAddMatch={() => setModal("addMatch")}
            onEditProfile={() => setModal("editProfile")}
            onCorrectStats={() => setModal("correctStats")}
            onDeletePlayer={() => {
              if (window.confirm(`Supprimer définitivement ${activePlayer.name} ? Cette action est irréversible.`)) deletePlayer(activePlayer.id);
            }}
            onUpdate={updatePlayer}
          />
        )}

        {view.name === "tournaments" && (
          <>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
              <button className="vt-btn vt-btn-primary vt-cut-sm" onClick={() => setModal("createTournament")}><Plus size={14} /> Nouveau tournoi</button>
            </div>
            <TournamentsList tournaments={tournaments} onOpen={openTournament} teamLogos={teamLogos} />
          </>
        )}

        {activeTournament && (
          <TournamentDetail
            tournament={activeTournament}
            players={players}
            teamLogos={teamLogos}
            onBack={backToTournaments}
            onAddTeam={() => { setEditingTeam(null); setModal("addTeam"); }}
            onEditTeam={(team) => { setEditingTeam(team); setModal("editTeam"); }}
            onAddMatch={() => { setEditingMatch(null); setModal("addTournamentMatch"); }}
            onEditMatch={(m) => { setEditingMatch(m); setModal("addTournamentMatch"); }}
            onApplyMatch={(matchId) => applyTournamentMatchNow(activeTournament.id, matchId)}
            onFinish={() => setModal("finishTournament")}
            onEditInfo={() => setModal("editTournament")}
            onToggleEliminated={(teamId) => toggleTeamEliminated(activeTournament.id, teamId)}
          />
        )}
      </div>

      {modal === "addPlayer" && <PlayerFormModal onClose={() => setModal(null)} onSave={upsertPlayer} />}
      {modal === "editProfile" && activePlayer && <ProfileEditModal player={rawActivePlayer} teamLogos={teamLogos} onSetLogo={setLogo} onClose={() => setModal(null)} onSave={upsertPlayer} />}
      {modal === "correctStats" && activePlayer && <StatsCorrectionModal player={rawActivePlayer} onClose={() => setModal(null)} onSave={upsertPlayer} />}
      {modal === "addMatch" && activePlayer && <AddMatchModal player={rawActivePlayer} onClose={() => setModal(null)} onSave={upsertPlayer} />}
      {modal === "login" && <LoginModal onClose={() => setModal(null)} />}
      {modal === "import" && <ImportModal onClose={() => setModal(null)} onImport={importRows} />}

      {modal === "createTournament" && <CreateTournamentModal onClose={() => setModal(null)} onSave={(t) => { upsertTournament(t); setModal(null); setView({ name: "tournament", id: t.id }); }} />}
      {modal === "editTournament" && activeTournament && (
        <EditTournamentModal
          tournament={activeTournament}
          onClose={() => setModal(null)}
          onSave={(updates) => updateTournamentInfo(activeTournament.id, updates)}
        />
      )}
      {(modal === "addTeam" || modal === "editTeam") && activeTournament && (
        <TeamModal
          tournament={activeTournament}
          team={editingTeam}
          players={players}
          organizations={organizations}
          organizationsEnabled={organizationsEnabled}
          suggestRoster={suggestRoster}
          isCurrentTournament={isCurrentTournament(activeTournament.id)}
          onCreatePlayer={quickCreatePlayer}
          onClose={() => { setModal(null); setEditingTeam(null); }}
          onSave={(team, newOrganization) => saveTeam(activeTournament.id, team, newOrganization)}
        />
      )}
      {modal === "addTournamentMatch" && activeTournament && (
        <AddTournamentMatchModal
          tournament={activeTournament}
          players={players}
          existingMatch={editingMatch}
          usualAgents={usualAgents}
          teamLogos={teamLogos}
          onClose={() => { setModal(null); setEditingMatch(null); }}
          onSave={(match, wasApplied) => saveTournamentMatch(activeTournament.id, match, wasApplied)}
        />
      )}
      {modal === "finishTournament" && activeTournament && (
        <FinishTournamentModal
          tournament={activeTournament}
          onClose={() => setModal(null)}
          onSave={(winnerTeamId) => finishTournament(activeTournament.id, winnerTeamId)}
        />
      )}
    </div>
  );
}