"use client";

import {
  AlertTriangle,
  Ban,
  Check,
  CheckCircle2,
  Clock3,
  Database,
  ExternalLink,
  FileWarning,
  LoaderCircle,
  LockKeyhole,
  MapPinOff,
  Merge,
  Pencil,
  Play,
  RefreshCw,
  RotateCw,
  Save,
  ShieldCheck,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { AppHeader } from "./app-header";
import { coerceEvent, parseEventsResponse, type RadarEvent } from "./event-types";
import { relativeTime } from "./event-utils";

interface SourceStatus {
  id: string;
  name: string;
  enabled: boolean;
  healthy: boolean;
  lastSuccessAt?: string;
  fetched: number;
  created: number;
  updated: number;
  rejected: number;
  deduplicated: number;
  review: number;
  durationMs?: number;
  error?: string;
}

interface Health {
  sources: SourceStatus[];
  lastSuccessfulRun?: string;
  recentlyExpired: number;
  missingLocations: number;
  ambiguousFree: number;
}

const EMPTY_HEALTH: Health = { sources: [], recentlyExpired: 0, missingLocations: 0, ambiguousFree: 0 };
const num = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;
const str = (value: unknown) => typeof value === "string" && value ? value : undefined;
const flag = (value: unknown, fallback: boolean) => typeof value === "boolean" ? value : fallback;

function parseHealth(value: unknown): Health {
  if (!value || typeof value !== "object") return EMPTY_HEALTH;
  const container = value as Record<string, unknown>;
  const raw = Array.isArray(container.data) ? container.data : Array.isArray(container.sources) ? container.sources : [];
  const summary = container.summary && typeof container.summary === "object" ? container.summary as Record<string, unknown> : container;
  return {
    sources: raw.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object")).map((item) => {
      const status = str(item.status);
      return {
        id: str(item.id) || str(item.sourceId) || str(item.sourceName) || "source",
        name: str(item.name) || str(item.sourceName) || str(item.id) || "Event source",
        enabled: flag(item.enabled, status !== "disabled"),
        healthy: flag(item.healthy, status !== "error" && status !== "failed"),
        lastSuccessAt: str(item.lastSuccessAt) || str(item.lastSuccessfulRun),
        fetched: num(item.fetched ?? item.eventsFetched),
        created: num(item.created ?? item.eventsCreated),
        updated: num(item.updated ?? item.eventsUpdated),
        rejected: num(item.rejected ?? item.eventsRejected),
        deduplicated: num(item.deduplicated ?? item.eventsDeduplicated),
        review: num(item.awaitingReview ?? item.eventsAwaitingReview),
        durationMs: num(item.durationMs) || undefined,
        error: str(item.error) || str(item.lastError),
      };
    }),
    lastSuccessfulRun: str(container.lastSuccessfulRun),
    recentlyExpired: num(summary.recentlyExpired),
    missingLocations: num(summary.missingLocations),
    ambiguousFree: num(summary.ambiguousFree ?? summary.awaitingReview),
  };
}

function headers(token: string, json = false): HeadersInit {
  return { Authorization: `Bearer ${token}`, ...(json ? { "Content-Type": "application/json" } : {}) };
}

export function AdminDashboard() {
  const [token, setToken] = useState("");
  const [input, setInput] = useState("");
  const [health, setHealth] = useState(EMPTY_HEALTH);
  const [reviews, setReviews] = useState<RadarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState({ primary: "", duplicate: "" });

  const load = useCallback(async (adminToken: string) => {
    setLoading(true);
    setAuthError(false);
    try {
      const status = await fetch("/api/sources/status", { headers: headers(adminToken) });
      if (status.status === 401 || status.status === 403) throw new Error("unauthorized");
      if (!status.ok) throw new Error("status");
      setHealth(parseHealth((await status.json()) as unknown));
      let reviewRequest = await fetch("/api/admin/events?status=review&pageSize=25", { headers: headers(adminToken) });
      if (reviewRequest.status === 404 || reviewRequest.status === 405) reviewRequest = await fetch("/api/events?status=review&pageSize=25", { headers: headers(adminToken) });
      if (reviewRequest.ok) setReviews(parseEventsResponse((await reviewRequest.json()) as unknown).events);
      window.sessionStorage.setItem("chifree-radar:admin-token", adminToken);
    } catch (error) {
      if (error instanceof Error && error.message === "unauthorized") {
        setAuthError(true);
        setToken("");
        window.sessionStorage.removeItem("chifree-radar:admin-token");
      } else setMessage("Some dashboard data could not be loaded.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const existing = window.sessionStorage.getItem("chifree-radar:admin-token") || "";
    if (!existing) return;
    const timer = window.setTimeout(() => { setToken(existing); setInput(existing); void load(existing); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function connect(event: FormEvent) {
    event.preventDefault();
    const next = input.trim();
    if (!next) return;
    setToken(next);
    void load(next);
  }

  async function run(source?: string) {
    if (!token) return;
    setRunning(source || "all");
    setMessage(null);
    try {
      const request = await fetch("/api/admin/scrape", { method: "POST", headers: headers(token, true), body: JSON.stringify(source ? { source } : {}) });
      if (!request.ok) throw new Error();
      setMessage(source ? `${source} scrape queued.` : "A full scrape has been queued.");
      window.setTimeout(() => void load(token), 1200);
    } catch { setMessage("The scraper could not be started."); }
    finally { setRunning(null); }
  }

  async function patchEvent(id: string, body: Record<string, unknown>, success: string) {
    if (!token) return;
    try {
      const request = await fetch(`/api/admin/events/${encodeURIComponent(id)}`, { method: "PATCH", headers: headers(token, true), body: JSON.stringify(body) });
      if (!request.ok) throw new Error();
      setReviews((current) => body.status === "published" || body.status === "rejected" || typeof body.duplicateOfId === "string" ? current.filter((item) => item.id !== id) : current.map((item) => item.id === id ? coerceEvent({ ...item, ...body }) || item : item));
      setMessage(success);
      setEditing(null);
    } catch { setMessage("That change could not be saved."); }
  }

  async function toggleSource(source: SourceStatus) {
    if (!token) return;
    try {
      const request = await fetch(`/api/admin/sources/${encodeURIComponent(source.id)}`, { method: "PATCH", headers: headers(token, true), body: JSON.stringify({ enabled: !source.enabled }) });
      if (!request.ok) throw new Error();
      setHealth((current) => ({ ...current, sources: current.sources.map((item) => item.id === source.id ? { ...item, enabled: !item.enabled } : item) }));
      setMessage(`${source.name} ${source.enabled ? "disabled" : "enabled"}.`);
    } catch { setMessage("The source setting could not be changed."); }
  }

  const totals = useMemo(() => health.sources.reduce((total, source) => ({
    fetched: total.fetched + source.fetched,
    created: total.created + source.created,
    updated: total.updated + source.updated,
    rejected: total.rejected + source.rejected,
    deduplicated: total.deduplicated + source.deduplicated,
    review: total.review + source.review,
    duration: total.duration + (source.durationMs || 0),
    durations: total.durations + (source.durationMs ? 1 : 0),
  }), { fetched: 0, created: 0, updated: 0, rejected: 0, deduplicated: 0, review: 0, duration: 0, durations: 0 }), [health.sources]);

  if (!token) return (
    <div className="app-page admin-page"><AppHeader /><main className="admin-login"><form onSubmit={connect}><span className="admin-lock"><LockKeyhole size={24} /></span><span className="eyebrow">Protected operations</span><h1>Open the radar room</h1><p>Enter the administrator token configured for this deployment. It stays in this browser tab only.</p><label>Admin token<input type="password" value={input} autoComplete="current-password" onChange={(event) => setInput(event.target.value)} placeholder="Enter token" required /></label>{authError && <p className="auth-error"><XCircle size={16} />That token was not accepted.</p>}<button type="submit" className="primary-button"><ShieldCheck size={17} />Open dashboard</button><Link href="/">← Back to public events</Link></form></main></div>
  );

  return (
    <div className="app-page admin-page">
      <AppHeader />
      <main>
        <section className="admin-hero"><div className="shell"><div><span className="eyebrow">Operations</span><h1>Radar room</h1><p>Source health, scraper runs, and events that need a human call.</p></div><div><button type="button" className="secondary-button" onClick={() => void load(token)} disabled={loading}><RefreshCw size={16} className={loading ? "spin" : ""} />Refresh</button><button type="button" className="primary-button" onClick={() => void run()} disabled={Boolean(running)}>{running === "all" ? <LoaderCircle size={16} className="spin" /> : <Play size={16} />}Run all sources</button><button type="button" className="secondary-button" onClick={() => { window.sessionStorage.removeItem("chifree-radar:admin-token"); setToken(""); }}>Lock</button></div></div></section>
        <div className="shell admin-content">
          {message && <div className="admin-message" role="status"><CheckCircle2 size={17} />{message}<button type="button" onClick={() => setMessage(null)} aria-label="Dismiss"><X size={15} /></button></div>}
          <div className="overview-heading"><div><h2>Latest run</h2><p>Last successful scrape <strong>{relativeTime(health.lastSuccessfulRun)}</strong></p></div><span className={`health-pill${health.sources.some((source) => !source.healthy) ? " warning" : ""}`}>{health.sources.some((source) => !source.healthy) ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}{health.sources.some((source) => !source.healthy) ? "Attention needed" : "All systems healthy"}</span></div>
          <div className="metric-grid"><Metric icon={<Database />} label="Fetched" value={totals.fetched} /><Metric icon={<Check />} label="Created" value={totals.created} /><Metric icon={<RotateCw />} label="Updated" value={totals.updated} /><Metric icon={<Merge />} label="Deduplicated" value={totals.deduplicated} /><Metric icon={<FileWarning />} label="Awaiting review" value={Math.max(totals.review, reviews.length)} warning /><Metric icon={<Clock3 />} label="Avg. duration" value={totals.durations ? `${Math.round(totals.duration / totals.durations / 1000)}s` : "—"} /></div>
          <div className="attention-grid"><article><Trash2 size={18} /><span><strong>{health.recentlyExpired}</strong>Recently expired</span></article><article><MapPinOff size={18} /><span><strong>{health.missingLocations}</strong>Missing locations</span></article><article><AlertTriangle size={18} /><span><strong>{health.ambiguousFree}</strong>Ambiguous free status</span></article></div>

          <section className="admin-section"><div className="admin-section-heading"><span className="eyebrow">Ingestion</span><h2>Source health</h2></div><div className="source-table-wrap"><table className="source-table"><thead><tr><th>Source</th><th>Status</th><th>Last success</th><th>Fetched</th><th>Created</th><th>Updated</th><th>Rejected</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{health.sources.map((source) => <tr key={source.id}><td><strong>{source.name}</strong>{source.error && <small title={source.error}>{source.error}</small>}</td><td><span className={`source-status${!source.enabled ? " disabled" : source.healthy ? "" : " failed"}`}>{!source.enabled ? "Disabled" : source.healthy ? "Healthy" : "Failed"}</span></td><td>{relativeTime(source.lastSuccessAt)}</td><td>{source.fetched}</td><td>{source.created}</td><td>{source.updated}</td><td>{source.rejected}</td><td><div className="table-actions"><button type="button" onClick={() => void run(source.id)} disabled={Boolean(running) || !source.enabled} aria-label={`Run ${source.name}`}>{running === source.id ? <LoaderCircle size={16} className="spin" /> : <Play size={16} />}</button><button type="button" onClick={() => void toggleSource(source)} aria-label={source.enabled ? `Disable ${source.name}` : `Enable ${source.name}`}>{source.enabled ? <Ban size={16} /> : <Check size={16} />}</button></div></td></tr>)}{!health.sources.length && <tr><td colSpan={8} className="table-empty">No source runs have been recorded yet.</td></tr>}</tbody></table></div></section>

          <section className="admin-section"><div className="admin-section-heading"><span className="eyebrow">Human review</span><h2>Questionable events</h2><p>Ambiguous pricing and incomplete records stay off the public feed until approved.</p></div><div className="review-list">{reviews.map((event) => <ReviewItem key={event.id} event={event} editing={editing === event.id} onEdit={() => setEditing((current) => current === event.id ? null : event.id)} onPatch={(body, success) => void patchEvent(event.id, body, success)} />)}{!reviews.length && <div className="review-empty"><CheckCircle2 size={25} /><strong>The review queue is clear</strong><p>No questionable events are waiting for a decision.</p></div>}</div></section>

          <section className="admin-section duplicate-section"><div><span className="eyebrow">Data cleanup</span><h2>Mark duplicate records</h2><p>Keep the primary record and attach the duplicate’s source evidence to it.</p></div><form onSubmit={(event) => { event.preventDefault(); if (duplicates.primary && duplicates.duplicate) void patchEvent(duplicates.duplicate, { duplicateOfId: duplicates.primary }, "The duplicate records were linked."); }}><label>Primary event ID<input value={duplicates.primary} onChange={(event) => setDuplicates((current) => ({ ...current, primary: event.target.value }))} required /></label><label>Duplicate event ID<input value={duplicates.duplicate} onChange={(event) => setDuplicates((current) => ({ ...current, duplicate: event.target.value }))} required /></label><button type="submit" className="secondary-button"><Merge size={16} />Merge records</button></form></section>
        </div>
      </main>
    </div>
  );
}

function Metric({ icon, label, value, warning = false }: { icon: ReactNode; label: string; value: string | number; warning?: boolean }) {
  return <article className={`metric${warning ? " warning" : ""}`}><span>{icon}</span><div><strong>{value}</strong><small>{label}</small></div></article>;
}

function ReviewItem({ event, editing, onEdit, onPatch }: { event: RadarEvent; editing: boolean; onEdit: () => void; onPatch: (body: Record<string, unknown>, success: string) => void }) {
  const [form, setForm] = useState({ title: event.title, venueName: event.venueName || "", address: event.address || "", priceText: event.priceText || "" });
  return (
    <article className="review-item">
      <div className="review-score"><span>free confidence</span><strong>{Math.round(event.freeConfidence * 100)}%</strong></div>
      <div className="review-content"><div className="review-heading"><div><span>{event.sourceName}</span><h3>{event.title}</h3><p>{event.freeExplanation || "Pricing could not be verified."}</p></div>{event.originalEventUrl && <a href={event.originalEventUrl} target="_blank" rel="noreferrer" aria-label="Open source listing"><ExternalLink size={17} /></a>}</div>{editing && <form className="edit-form" onSubmit={(submit) => { submit.preventDefault(); onPatch(form, "Event corrections saved."); }}><label>Title<input value={form.title} onChange={(change) => setForm((current) => ({ ...current, title: change.target.value }))} /></label><label>Venue<input value={form.venueName} onChange={(change) => setForm((current) => ({ ...current, venueName: change.target.value }))} /></label><label>Address<input value={form.address} onChange={(change) => setForm((current) => ({ ...current, address: change.target.value }))} /></label><label>Price text<input value={form.priceText} onChange={(change) => setForm((current) => ({ ...current, priceText: change.target.value }))} /></label><button type="submit" className="secondary-button"><Save size={15} />Save corrections</button></form>}</div>
      <div className="review-actions"><button type="button" className="approve" onClick={() => onPatch({ status: "published" }, "Event approved and published.")}><Check size={16} />Approve</button><button type="button" onClick={onEdit}><Pencil size={16} />{editing ? "Close" : "Correct"}</button><button type="button" className="reject" onClick={() => onPatch({ status: "rejected" }, "Event rejected.")}><X size={16} />Reject</button></div>
    </article>
  );
}
