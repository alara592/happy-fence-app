"use client";

import { useEffect, useReducer } from "react";
import { api } from "./client";

/**
 * Tiny stale-while-revalidate cache, keyed by API path.
 *
 * Goal (Anthony, 2026-06-06): pay a longer first load, then feel instant. The home
 * screen prefetches every project on entry; thereafter screens render from cache
 * immediately and refresh in the background. Module state survives client-side
 * navigation, so the cache persists for the session.
 */

interface Entry {
  data?: unknown;
  error?: Error;
  promise?: Promise<unknown>;
  at: number;
}

const store = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();

/**
 * Persist the cache to localStorage so it survives a full app reopen / refresh —
 * the screen then shows last-known data instantly instead of a "Loading…" flash,
 * and revalidates in the background. BUMP the version when the cached payload shape
 * changes (project bundle / list), so stale shapes are discarded after a deploy.
 */
const PERSIST_KEY = "hfc-cache-v2";

function hydrate(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(PERSIST_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, { data: unknown; at: number }>;
    for (const [k, v] of Object.entries(parsed)) store.set(k, { data: v.data, at: v.at });
  } catch {
    /* ignore corrupt/blocked storage */
  }
}

function persist(): void {
  if (typeof window === "undefined") return;
  try {
    const obj: Record<string, { data: unknown; at: number }> = {};
    for (const [k, e] of store) if (e.data !== undefined) obj[k] = { data: e.data, at: e.at };
    window.localStorage.setItem(PERSIST_KEY, JSON.stringify(obj));
  } catch {
    /* quota/private-mode — caching just falls back to in-memory */
  }
}

hydrate();

function notify(key: string): void {
  const set = listeners.get(key);
  if (set) for (const fn of set) fn();
}

export function peek<T>(key: string): T | undefined {
  return store.get(key)?.data as T | undefined;
}

/** Overwrite an entry directly (e.g. data returned from a mutation). */
export function setCache<T>(key: string, data: T): void {
  store.set(key, { data, at: Date.now() });
  persist();
  notify(key);
}

export function invalidate(key: string): void {
  store.delete(key);
  persist();
  notify(key);
}

/**
 * Fetch a key and store it. Keeps existing data visible while in flight (no loading
 * flash on revalidate) and dedupes concurrent calls for the same key.
 */
export function load<T>(key: string): Promise<T> {
  const existing = store.get(key);
  if (existing?.promise) return existing.promise as Promise<T>;

  const promise = api<T>(key).then(
    (data) => {
      store.set(key, { data, at: Date.now() });
      persist();
      notify(key);
      return data;
    },
    (error: Error) => {
      const cur = store.get(key);
      store.set(key, { ...(cur ?? { at: 0 }), error, promise: undefined });
      notify(key);
      throw error;
    },
  );
  store.set(key, { ...(existing ?? { at: 0 }), promise });
  return promise as Promise<T>;
}

/** Warm a key in the background if not already cached/in-flight. Fire-and-forget. */
export function prefetch(key: string): void {
  const e = store.get(key);
  if (!e || (e.data === undefined && !e.promise)) load(key).catch(() => {});
}

/**
 * Read a cached key + subscribe to updates. Revalidates in the background on mount,
 * showing cached data instantly meanwhile.
 */
export function useCached<T>(key: string): { data: T | undefined; error: Error | undefined } {
  const [, bump] = useReducer((x) => x + 1, 0);

  useEffect(() => {
    let set = listeners.get(key);
    if (!set) listeners.set(key, (set = new Set()));
    set.add(bump);
    return () => {
      set!.delete(bump);
      if (set!.size === 0) listeners.delete(key);
    };
  }, [key]);

  useEffect(() => {
    load(key).catch(() => {});
  }, [key]);

  const e = store.get(key);
  return { data: e?.data as T | undefined, error: e?.error };
}
