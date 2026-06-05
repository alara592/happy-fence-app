"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import SectionForm, { SectionFormValues } from "@/components/SectionForm";
import { api } from "@/lib/client";

interface Bundle {
  sections: {
    id: string;
    name: string;
    description: string | null;
    linear_ft: number;
    tear_down: boolean;
    dump: boolean;
    take_down_ft: number;
    tear_down_rate: number | null;
    dump_rate: number | null;
  }[];
}

export default function EditSectionPage() {
  const { id, sectionId } = useParams<{ id: string; sectionId: string }>();
  const [initial, setInitial] = useState<SectionFormValues | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Bundle>(`/api/projects/${id}`)
      .then((b) => {
        const s = b.sections.find((x) => x.id === sectionId);
        if (!s) throw new Error("Section not found");
        setInitial({
          name: s.name,
          description: s.description ?? "",
          linear_ft: String(s.linear_ft),
          tear_down: s.tear_down,
          take_down_ft: String(s.take_down_ft),
          dump: s.dump,
          tear_down_rate: s.tear_down_rate === null ? "" : String(s.tear_down_rate),
          dump_rate: s.dump_rate === null ? "" : String(s.dump_rate),
        });
      })
      .catch((e) => setError(e.message));
  }, [id, sectionId]);

  if (error) return <p className="error">{error}</p>;
  if (!initial) return <p className="muted">Loading…</p>;
  return <SectionForm projectId={id} sectionId={sectionId} initial={initial} />;
}
