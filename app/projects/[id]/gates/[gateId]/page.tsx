"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import GateForm, { GateFormValues } from "@/components/GateForm";
import { api } from "@/lib/client";

interface Bundle {
  gates: {
    id: string;
    name: string;
    description: string | null;
    type: string;
    style: "Single" | "Double";
  }[];
}

export default function EditGatePage() {
  const { id, gateId } = useParams<{ id: string; gateId: string }>();
  const [initial, setInitial] = useState<GateFormValues | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Bundle>(`/api/projects/${id}`)
      .then((b) => {
        const g = b.gates.find((x) => x.id === gateId);
        if (!g) throw new Error("Gate not found");
        setInitial({
          name: g.name,
          description: g.description ?? "",
          type: g.type,
          style: g.style,
        });
      })
      .catch((e) => setError(e.message));
  }, [id, gateId]);

  if (error) return <p className="error">{error}</p>;
  if (!initial) return <p className="muted">Loading…</p>;
  return <GateForm projectId={id} gateId={gateId} initial={initial} />;
}
