import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Scrolls window to top on route change. Skips POP (browser back/forward)
 * so we preserve native back-from-edit scroll position.
 */
export function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    const navType = (performance.getEntriesByType("navigation")[0] as any)?.type;
    // Always scroll top on PUSH/REPLACE; browser restores POP automatically
    if (navType !== "back_forward") {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [pathname]);
  return null;
}
