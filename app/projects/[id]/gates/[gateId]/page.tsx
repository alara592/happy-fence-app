"use client";

import { useParams } from "next/navigation";
import GateForm, { GateFormValues } from "@/components/GateForm";
import { useCached } from "@/lib/cache";

interface Bundle {
  gates: {
    id: string;
    name: string;
    description: string | null;
    type: string;
    style: "Single" | "Double";
    quantity: number;
  }[];
}

export default function EditGatePage() {
  const { id, gateId } = useParams<{ id: string; gateId: string }>();
  // Read the gate from the cached project bundle so editing opens instantly.
  const { data: b, error } = useCached<Bundle>(`/api/projects/${id}`);

  if (error && !b) return <p className="error">{error.message}</p>;
  if (!b) return <p className="muted">Loading…</p>;

  const g = b.gates.find((x) => x.id === gateId);
  if (!g) return <p className="error">Gate not found</p>;

  const initial: GateFormValues = {
    name: g.name,
    description: g.description ?? "",
    type: g.type,
    style: g.style,
    quantity: String(g.quantity ?? 1),
  };
  return <GateForm projectId={id} gateId={gateId} initial={initial} />;
}
