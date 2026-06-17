"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

type VantaEffect = {
  destroy: () => void;
};

declare global {
  interface Window {
    VANTA?: {
      BIRDS?: (options: Record<string, unknown>) => VantaEffect;
    };
    THREE?: unknown;
  }
}

const THREE_SCRIPT =
  "https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js";
const VANTA_BIRDS_SCRIPT =
  "https://cdn.jsdelivr.net/npm/vanta@0.5.24/dist/vanta.birds.min.js";

export function VantaBirdsBackground() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const effectRef = useRef<VantaEffect | null>(null);
  const [threeReady, setThreeReady] = useState(false);
  const [vantaReady, setVantaReady] = useState(false);

  useEffect(() => {
    if (
      effectRef.current ||
      !containerRef.current ||
      !threeReady ||
      !vantaReady ||
      !window.VANTA?.BIRDS
    ) {
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    effectRef.current = window.VANTA.BIRDS({
      el: containerRef.current,
      mouseControls: true,
      touchControls: true,
      gyroControls: false,
      minHeight: 200.0,
      minWidth: 200.0,
      scale: 1.0,
      scaleMobile: 1.0,
      backgroundAlpha: 0,
      backgroundColor: 0x070b09,
      color1: 0x55f991,
      color2: 0xb6ffd0,
      colorMode: "varianceGradient",
      birdSize: 0.75,
      wingSpan: 18,
      speedLimit: 3,
      separation: 42,
      alignment: 28,
      cohesion: 24,
      quantity: 2.5,
    });

    return () => {
      effectRef.current?.destroy();
      effectRef.current = null;
    };
  }, [threeReady, vantaReady]);

  return (
    <div aria-hidden="true" className="fixed inset-0 z-0 overflow-hidden bg-ink">
      <div ref={containerRef} className="absolute inset-0 opacity-70" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_-10%,rgba(85,249,145,0.17),transparent_30rem),radial-gradient(circle_at_92%_18%,rgba(182,255,208,0.12),transparent_26rem),linear-gradient(180deg,rgba(7,11,9,0.18),rgba(7,11,9,0.76))]" />
      <div className="absolute inset-0 bg-ink/35" />

      <Script
        id="three-r134"
        onLoad={() => setThreeReady(true)}
        onReady={() => setThreeReady(true)}
        src={THREE_SCRIPT}
        strategy="afterInteractive"
      />
      {threeReady ? (
        <Script
          id="vanta-birds"
          onLoad={() => setVantaReady(true)}
          onReady={() => setVantaReady(true)}
          src={VANTA_BIRDS_SCRIPT}
          strategy="afterInteractive"
        />
      ) : null}
    </div>
  );
}
