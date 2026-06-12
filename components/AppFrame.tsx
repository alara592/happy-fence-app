"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCached } from "@/lib/cache";
import { fmtDate } from "@/lib/format";

/**
 * Desktop shell (2026-06-12): top nav + persistent project rail, both desktop-only
 * (≥1024px via CSS — phones render exactly what they always have). The Present screen
 * and the unlock screen stay bare: one is customer-facing, the other is pre-auth.
 */

interface ProjectListItem {
  id: string;
  client: string;
  address: string | null;
  date: string;
  updated_at: string;
}

const TABS: [href: string, label: string][] = [
  ["/", "Projects"],
  ["/quick-quote", "Quick Quote"],
  ["/appointments", "Appointments"],
];

export default function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/unlock" || pathname.includes("/present")) {
    return <main>{children}</main>;
  }
  // The rail rides along on project screens; the home list IS the list, so no rail there.
  const showRail = pathname.startsWith("/projects");
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" || pathname.startsWith("/projects") : pathname.startsWith(href);

  return (
    <>
      <nav className="dnav">
        <span className="dnav-logo">Happy Fence</span>
        {TABS.map(([href, label]) => (
          <Link key={href} href={href} className={`dnav-tab${isActive(href) ? " on" : ""}`}>
            {label}
          </Link>
        ))}
      </nav>
      <div className={showRail ? "dframe with-rail" : "dframe"}>
        {showRail && <ProjectRail pathname={pathname} />}
        <main>{children}</main>
      </div>
    </>
  );
}

function ProjectRail({ pathname }: { pathname: string }) {
  const { data: projects } = useCached<ProjectListItem[]>("/api/projects");
  return (
    <aside className="drail">
      <div className="drail-head">
        <span>Projects</span>
        <Link href="/projects/new">+ New</Link>
      </div>
      {(projects ?? []).map((p) => {
        const sel = pathname === `/projects/${p.id}` || pathname.startsWith(`/projects/${p.id}/`);
        const city = p.address?.split(",")[1]?.trim();
        return (
          <Link key={p.id} href={`/projects/${p.id}`} className={`drail-item${sel ? " sel" : ""}`}>
            <span className="c">{p.client}</span>
            <span className="m">
              {city ? `${city} · ` : ""}
              {fmtDate(p.date)}
            </span>
          </Link>
        );
      })}
    </aside>
  );
}
