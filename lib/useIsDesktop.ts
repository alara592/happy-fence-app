"use client";

import { useEffect, useState } from "react";

/**
 * True at ≥1024px — the desktop-shell breakpoint (globals.css). Starts false so the
 * server render and first client render match (phone layout); desktop upgrades after
 * mount. Pages use this to swap whole trees, so phones never mount desktop components
 * or pay for their data fetches.
 */
export function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return desktop;
}
