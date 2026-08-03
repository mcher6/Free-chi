"use client";

import Link from "next/link";
import { Bookmark, Menu, Radar, X } from "lucide-react";
import { useState } from "react";
import { useSavedEvents } from "./use-saved-events";

export function AppHeader() {
  const [open, setOpen] = useState(false);
  const { savedCount } = useSavedEvents();
  return (
    <header className="site-header">
      <div className="shell header-inner">
        <Link href="/" className="brand" aria-label="ChiFree Radar home">
          <span className="brand-mark" aria-hidden="true"><Radar size={20} /></span>
          <span><strong>ChiFree</strong> Radar</span>
        </Link>
        <nav className="desktop-nav" aria-label="Main navigation">
          <Link href="/?view=map">Explore</Link>
          <Link href="/?view=calendar">Calendar</Link>
          <Link href="/saved" className="saved-link">
            <Bookmark size={16} /> Saved
            {savedCount > 0 && <b aria-label={`${savedCount} saved`}>{savedCount}</b>}
          </Link>
          <Link href="/admin" className="admin-nav">Admin</Link>
        </nav>
        <button
          type="button"
          className="icon-button mobile-menu"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label={open ? "Close navigation" : "Open navigation"}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      {open && (
        <nav className="mobile-nav" aria-label="Mobile navigation">
          <Link href="/?view=map" onClick={() => setOpen(false)}>Explore the map</Link>
          <Link href="/?view=calendar" onClick={() => setOpen(false)}>Event calendar</Link>
          <Link href="/saved" onClick={() => setOpen(false)}>Saved events {savedCount ? `(${savedCount})` : ""}</Link>
          <Link href="/admin" onClick={() => setOpen(false)}>Admin</Link>
        </nav>
      )}
    </header>
  );
}
