"use client";

import { Building2, ChevronDown, CircleDollarSign, Gift, RotateCcw, SlidersHorizontal, Sparkles, TicketCheck, X } from "lucide-react";
import type { ReactNode } from "react";
import type { EventFilters } from "./event-types";

function Switch({ checked, label, detail, icon, onChange }: { checked: boolean; label: string; detail?: string; icon: ReactNode; onChange: (value: boolean) => void }) {
  return (
    <label className="filter-switch">
      <span className="filter-icon">{icon}</span>
      <span><strong>{label}</strong>{detail && <small>{detail}</small>}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <i aria-hidden="true"><b /></i>
    </label>
  );
}

export function FilterPanel({ filters, neighborhoods, categories, sources, mobileOpen, onClose, onChange, onReset }: {
  filters: EventFilters;
  neighborhoods: string[];
  categories: string[];
  sources: string[];
  mobileOpen: boolean;
  onClose: () => void;
  onChange: <K extends keyof EventFilters>(key: K, value: EventFilters[K]) => void;
  onReset: () => void;
}) {
  return (
    <>
      {mobileOpen && <button type="button" className="filter-backdrop" aria-label="Close filters" onClick={onClose} />}
      <aside className={`filter-panel${mobileOpen ? " mobile-open" : ""}`}>
        <div className="filter-heading"><div><SlidersHorizontal size={18} /><strong>Refine your radar</strong></div><button type="button" className="icon-button filter-close" onClick={onClose} aria-label="Close filters"><X size={18} /></button></div>
        <div className="filter-scroll">
          <section className="filter-section">
            <h3>When</h3>
            <div className="date-fields">
              <label>From<input type="date" value={filters.from} onChange={(event) => { onChange("date", ""); onChange("from", event.target.value); }} /></label>
              <label>To<input type="date" min={filters.from || undefined} value={filters.to} onChange={(event) => { onChange("date", ""); onChange("to", event.target.value); }} /></label>
            </div>
          </section>
          <section className="filter-section">
            <h3>Worth showing</h3>
            <Switch checked={filters.freeOnly} onChange={(value) => onChange("freeOnly", value)} icon={<CircleDollarSign size={18} />} label="Free events only" detail="Confidently free to attend" />
            <Switch checked={filters.freeStuff} onChange={(value) => onChange("freeStuff", value)} icon={<Gift size={18} />} label="Free stuff" detail="Samples, food, swag & more" />
            <Switch checked={filters.notable} onChange={(value) => onChange("notable", value)} icon={<Sparkles size={18} />} label="Notable guest" detail="Speakers, athletes & creators" />
            <Switch checked={filters.company} onChange={(value) => onChange("company", value)} icon={<Building2 size={18} />} label="Major company" detail="Hosted, sponsored or featured" />
            <Switch checked={filters.registration} onChange={(value) => onChange("registration", value)} icon={<TicketCheck size={18} />} label="Registration required" />
          </section>
          <section className="filter-section">
            <h3>Where</h3>
            <Select label="Neighborhood" value={filters.neighborhood} onChange={(value) => onChange("neighborhood", value)} first="All neighborhoods" options={neighborhoods} />
            <Select label="Distance" value={filters.distance} onChange={(value) => onChange("distance", value)} first="Any distance" options={["1", "3", "5", "10"]} render={(value) => `Within ${value} mile${value === "1" ? "" : "s"}`} />
          </section>
          <section className="filter-section">
            <h3>What</h3>
            <Select label="Category" value={filters.category} onChange={(value) => onChange("category", value)} first="Every category" options={categories} />
            <Select label="Setting" value={filters.environment} onChange={(value) => onChange("environment", value)} first="Indoor or outdoor" options={["indoor", "outdoor", "mixed"]} render={(value) => value === "mixed" ? "Both" : value[0].toUpperCase() + value.slice(1)} />
            <label className="simple-check"><input type="checkbox" checked={filters.familyFriendly} onChange={(event) => onChange("familyFriendly", event.target.checked)} />Family friendly</label>
          </section>
          <section className="filter-section">
            <h3>Trust level</h3>
            <label className="range-label">Minimum free confidence<div><input type="range" min="0" max="1" step="0.05" value={filters.minimumConfidence} onChange={(event) => onChange("minimumConfidence", event.target.value)} /><strong>{Math.round(Number(filters.minimumConfidence) * 100)}%</strong></div></label>
            <Select label="Source" value={filters.source} onChange={(value) => onChange("source", value)} first="Every source" options={sources} />
          </section>
        </div>
        <div className="filter-footer"><button type="button" className="secondary-button" onClick={onReset}><RotateCcw size={15} />Reset</button><button type="button" className="primary-button" onClick={onClose}>Show events</button></div>
      </aside>
    </>
  );
}

function Select({ label, value, onChange, first, options, render = (item) => item }: { label: string; value: string; onChange: (value: string) => void; first: string; options: string[]; render?: (item: string) => string }) {
  return (
    <label className="select-label">{label}<span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="">{first}</option>{options.map((option) => <option value={option} key={option}>{render(option)}</option>)}</select><ChevronDown size={15} /></span></label>
  );
}
