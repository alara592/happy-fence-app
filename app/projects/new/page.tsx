"use client";

import ProjectForm, { emptyProject } from "@/components/ProjectForm";

export default function NewProjectPage() {
  return <ProjectForm initial={emptyProject} />;
}
