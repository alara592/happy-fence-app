"use client";

import { useParams } from "next/navigation";
import ProjectForm, { ProjectFormValues } from "@/components/ProjectForm";
import { useCached } from "@/lib/cache";

interface Bundle {
  project: Record<string, unknown>;
}

export default function EditProjectPage() {
  const { id } = useParams<{ id: string }>();
  // Read from the cached project bundle so the edit screen opens instantly.
  const { data: b, error } = useCached<Bundle>(`/api/projects/${id}`);

  if (error && !b) return <p className="error">{error.message}</p>;
  if (!b) return <p className="muted">Loading…</p>;

  const p = b.project;
  const initial: ProjectFormValues = {
    client: String(p.client ?? ""),
    address: String(p.address ?? ""),
    date: String(p.date ?? "").slice(0, 10),
    permit: !!p.permit,
    labor_cost_ft: String(p.labor_cost_ft),
    // stored as a decimal (0.30); the form edits it as a percent (30)
    profit_margin: String(+(Number(p.profit_margin) * 100).toFixed(6)),
    notes: String(p.notes ?? ""),
    price_mod_notes: String(p.price_mod_notes ?? ""),
  };
  return <ProjectForm initial={initial} projectId={id} />;
}
