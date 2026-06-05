"use client";

import { useParams } from "next/navigation";
import GateForm, { emptyGate } from "@/components/GateForm";

export default function NewGatePage() {
  const { id } = useParams<{ id: string }>();
  return <GateForm projectId={id} initial={emptyGate} />;
}
