"use client";

import { useEffect } from "react";

/**
 * Lenis smooth-scroll — the weighted, inertial scroll behind sites like wlt.design.
 * Side-effect only (renders nothing). Lenis is dynamically imported inside the effect
 * so it never enters the server/prerender graph, and it's disabled under
 * prefers-reduced-motion so it never fights accessibility settings or low-end devices.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let cancelled = false;
    let cleanup = () => {};

    void import("lenis").then(({ default: Lenis }) => {
      if (cancelled) return;

      const lenis = new Lenis({
        duration: 1.1,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // ease-out-expo
      });

      let raf = requestAnimationFrame(function loop(time: number) {
        lenis.raf(time);
        raf = requestAnimationFrame(loop);
      });

      // Smooth-scroll same-page anchor links (#features, #pricing, #demo).
      const onClick = (e: MouseEvent) => {
        const a = (e.target as HTMLElement)?.closest('a[href^="#"]');
        if (!a) return;
        const id = a.getAttribute("href");
        if (!id || id === "#") return;
        const el = document.querySelector(id);
        if (el) {
          e.preventDefault();
          lenis.scrollTo(el as HTMLElement, { offset: -80 });
        }
      };
      document.addEventListener("click", onClick);

      cleanup = () => {
        cancelAnimationFrame(raf);
        document.removeEventListener("click", onClick);
        lenis.destroy();
      };
    });

    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);

  return null;
}
