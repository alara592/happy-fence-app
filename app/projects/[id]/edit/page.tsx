"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ProjectForm, { ProjectFormValues } from "@/components/ProjectForm";
import { api } from "@/lib/client";

export default function EditProjectPage() {
  const { id } = useParams<{ id: string }>();
  const [initial, setInitial] = useState<ProjectFormValues | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ project: Record<string, unknown> }>(`/api/projects/${id}`)
      .then(({ project: p }) =>
        setInitial({
          client: String(p.client ?? ""),
          address: String(p.address ?? ""),
          date: String(p.date ?? "").slice(0, 10),
          permit: !!p.permit,
          labor_cost_ft: String(p.labor_cost_ft),
          profit_margin: String(p.profit_margin),
          discount: String(p.discount),
          notes: String(p.notes ?? ""),
          price_mod_notes: String(p.price_mod_notes ?? ""),
        }),
      )
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) return <p className="error">{error}</p>;
  if (!initial) return <p className="muted">Loading…</p>;
  return <ProjectForm initial={initial} projectId={id} />;
}
