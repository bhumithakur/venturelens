import { useEffect, useState } from "react";
import { migrateModel } from "./finance.js";

/**
 * localStorage persistence for businesses and research reports (no backend DB yet).
 * Stores only user-entered business details and backend responses; never secrets.
 */
const KEYS = {
  businesses: "vl.businesses.v1",
  reports: "vl.reports.v1",
  financialsV1: "vl.financials.v1", // legacy: plain rental numbers, read only for migration
  financials: "vl.financials.v2", // versioned models: { version: 2, template, currency, inputs, ... }
};

const read = (key) => {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};
export const STORAGE_EVENT = "vl:storage-changed";

const write = (key, value) => {
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent(STORAGE_EVENT, { detail: { key } })); // same-tab listeners
};

/** RFC 4122 v4 UUID; crypto.getRandomValues fallback for non-secure contexts. */
export function newId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const storage = {
  listBusinesses: () => read(KEYS.businesses).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  getBusiness: (id) => read(KEYS.businesses).find((b) => b.id === id) ?? null,
  saveBusiness(data) {
    const all = read(KEYS.businesses);
    let id = newId();
    while (all.some((b) => b.id === id)) id = newId(); // guard against the (astronomically unlikely) collision
    const business = { ...data, id, createdAt: new Date().toISOString() };
    write(KEYS.businesses, [...all, business]);
    return business;
  },

  listReports: () => read(KEYS.reports).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  listReportsForBusiness: (businessId) => storage.listReports().filter((r) => r.businessId === businessId),
  getReport: (id) => read(KEYS.reports).find((r) => r.id === id) ?? null,
  /**
   * Imports a validated live result. Idempotent: the same result (by fingerprint) is stored once.
   * Returns { report, duplicate }.
   */
  importReport({ businessId, result, fingerprint }) {
    const existing = read(KEYS.reports).find((r) => r.importFingerprint === fingerprint);
    if (existing) return { report: existing, duplicate: true };
    const report = {
      id: newId(),
      createdAt: result.generatedAt, // when the research actually ran
      importedAt: new Date().toISOString(),
      businessId,
      status: "completed",
      source: "import",
      importFingerprint: fingerprint,
      result: structuredClone(result), // stored exactly as validated, never rewritten
      error: null,
    };
    write(KEYS.reports, [...read(KEYS.reports), report]);
    return { report, duplicate: false };
  },

  /** status: "completed" | "failed"; result = backend response (completed) */
  saveReport({ businessId, status, result = null, error = null }) {
    // Duplicate guard: the same backend response is stored once.
    const resultKey = result ? `${result.agent}|${result.generatedAt}|${JSON.stringify(result.input)}` : null;
    const all = read(KEYS.reports);
    const existing = resultKey && all.find((r) => r.resultKey === resultKey);
    if (existing) return existing;
    const report = {
      id: newId(),
      createdAt: new Date().toISOString(),
      businessId,
      status,
      source: result ? (result.mock ? "mock" : "live") : null,
      resultKey,
      result,
      error,
    };
    write(KEYS.reports, [...all, report]);
    return report;
  },
};

/** Financial models per business: { [businessId]: model }. v1 entries are migrated on first read. */
const readMap = (key) => {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
};
export const financials = {
  get(businessId) {
    const current = migrateModel(readMap(KEYS.financials)[businessId]);
    if (current) return current;
    const migrated = migrateModel(readMap(KEYS.financialsV1)[businessId]);
    if (migrated) financials.save(businessId, migrated); // v1 entry is left untouched
    return migrated;
  },
  save(businessId, model) {
    localStorage.setItem(KEYS.financials, JSON.stringify({ ...readMap(KEYS.financials), [businessId]: model }));
  },
  /** Removes saved data (both versions) so the business returns to its defaults. */
  clear(businessId) {
    for (const key of [KEYS.financials, KEYS.financialsV1]) {
      const all = readMap(key);
      if (businessId in all) {
        delete all[businessId];
        localStorage.setItem(key, JSON.stringify(all));
      }
    }
  },
};

/** Maps a stored business to the backend's market-research input schema. */
export function toResearchInput(b) {
  const notes = [
    b.stage && `Business stage: ${b.stage}.`,
    b.targetCustomers && `Target customers: ${b.targetCustomers}.`,
    b.name && `Business name: ${b.name}.`,
  ].filter(Boolean).join(" ");
  return {
    business: b.description,
    ...(b.industry ? { industry: b.industry } : {}),
    ...(b.location ? { region: b.location } : {}),
    ...(notes ? { notes: notes.slice(0, 2000) } : {}),
  };
}

/** Re-renders when stored data changes in this tab or another tab. Returns a version number. */
export function useStorageVersion() {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    window.addEventListener(STORAGE_EVENT, bump);
    window.addEventListener("storage", bump); // other tabs
    return () => {
      window.removeEventListener(STORAGE_EVENT, bump);
      window.removeEventListener("storage", bump);
    };
  }, []);
  return version;
}
