"use client";

import { useCallback, useEffect, useState } from "react";

const KEY = "chifree-radar:saved-events";
const CHANGE = "chifree-radar:saved-change";

function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export function useSavedEvents() {
  const [savedIds, setSavedIds] = useState<string[]>([]);
  useEffect(() => {
    const sync = () => setSavedIds(read());
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(CHANGE, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(CHANGE, sync);
    };
  }, []);

  const write = useCallback((ids: string[]) => {
    const unique = [...new Set(ids)];
    window.localStorage.setItem(KEY, JSON.stringify(unique));
    setSavedIds(unique);
    window.dispatchEvent(new Event(CHANGE));
  }, []);

  const toggle = useCallback(
    (id: string) => {
      const current = read();
      write(current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    },
    [write],
  );

  return {
    savedIds,
    savedCount: savedIds.length,
    isSaved: (id: string) => savedIds.includes(id),
    toggleSaved: toggle,
    clearSaved: () => write([]),
  };
}
