"use client";

import { useParams } from "next/navigation";
import SectionForm, { SectionFormValues } from "@/components/SectionForm";
import { useCached } from "@/lib/cache";

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
  // Read the section from the cached project bundle so editing opens instantly.
  const { data: b, error } = useCached<Bundle>(`/api/projects/${id}`);

  if (error && !b) return <p className="error">{error.message}</p>;
  if (!b) return <p className="muted">Loading…</p>;

  const s = b.sections.find((x) => x.id === sectionId);
  if (!s) return <p className="error">Section not found</p>;

  const initial: SectionFormValues = {
    name: s.name,
    description: s.description ?? "",
    linear_ft: String(s.linear_ft),
    tear_down: s.tear_down,
    take_down_ft: String(s.take_down_ft),
    dump: s.dump,
    tear_down_rate: s.tear_down_rate === null ? "" : String(s.tear_down_rate),
    dump_rate: s.dump_rate === null ? "" : String(s.dump_rate),
  };
  return <SectionForm projectId={id} sectionId={sectionId} initial={initial} />;
}
