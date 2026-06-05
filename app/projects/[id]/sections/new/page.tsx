"use client";

import { useParams } from "next/navigation";
import SectionForm, { emptySection } from "@/components/SectionForm";

export default function NewSectionPage() {
  const { id } = useParams<{ id: string }>();
  return <SectionForm projectId={id} initial={emptySection} />;
}
