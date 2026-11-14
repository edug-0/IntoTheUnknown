import { useEffect, useRef } from "react";
import { seeded } from "../../lib/sky";
import { tokenRgb } from "../../lib/stretch";
import s from "./SkyBackdrop.module.css";

/**
 * Decorative deep-space backdrop behind everything. It is not data: the stars are random and it
 * never sits behind the science image (the frame is opaque). Dims while a view is open.
 */
export function SkyBackdrop({ dim }: { dim: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const draw = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = window.innerWidth + 48;
      const h = window.innerHeight + 48;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      cv.style.width = `${w}px`;
      cv.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const [r, g, b] = tokenRgb("--star");
      const rnd = seeded(20261115);
      const count = Math.round((w * h) / 1900);
      for (let i = 0; i < count; i++) {
        const x = rnd() * w;
        const y = rnd() * h;
        const m = rnd() ** 4;
        const radius = 0.35 + m * 1.25;
        ctx.fillStyle = `rgba(${r},${g},${b},${0.12 + m * 0.75})`;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, []);

  // Slow parallax on pointer move. Skipped under reduced motion.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const cv = ref.current;
    if (!cv) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const dx = (e.clientX / window.innerWidth - 0.5) * -16;
        const dy = (e.clientY / window.innerHeight - 0.5) * -16;
        cv.style.translate = `${dx}px ${dy}px`;
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return (
    <div className={s.backdrop} data-dim={dim} aria-hidden="true">
      <canvas ref={ref} className={s.canvas} />
      <div className={s.vignette} />
    </div>
  );
}
