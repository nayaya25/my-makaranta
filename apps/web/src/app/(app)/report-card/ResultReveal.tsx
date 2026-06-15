"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, animate } from "framer-motion";
import { Button } from "@mymakaranta/ui";
import { shouldCelebrate, type GradeBand } from "./reveal.util";

type Phase = "idle" | "suspense" | "headline" | "done";

interface RevealData {
  student: { name: string };
  average: number;
  position: number;
  classSize: number;
  gradeKey: GradeBand[];
}

const SUSPENSE_MS = 800;
const COUNTUP_MS = 1200;
const HOLD_MS = 1400;

function CountUp({ to, durationMs, reduce }: { to: number; durationMs: number; reduce: boolean }) {
  const [val, setVal] = useState(reduce ? to : 0);
  useEffect(() => {
    if (reduce) {
      setVal(to);
      return;
    }
    const controls = animate(0, to, {
      duration: durationMs / 1000,
      ease: "easeOut",
      onUpdate: (v) => setVal(Math.round(v)),
    });
    return () => controls.stop();
  }, [to, durationMs, reduce]);
  return <span className="tabular-nums">{val}</span>;
}

function Burst({ count = 16 }: { count?: number }) {
  const colors = ["bg-brand-500", "bg-saffron-500", "bg-success", "bg-brand-300"];
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
      {Array.from({ length: count }).map((_, i) => {
        const angle = (i / count) * Math.PI * 2;
        const dist = 90 + (i % 3) * 22;
        return (
          <motion.span
            key={i}
            className={`absolute h-2 w-2 rounded-full ${colors[i % colors.length]}`}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          />
        );
      })}
    </div>
  );
}

export function ResultReveal({ data, children }: { data: RevealData; children: React.ReactNode }) {
  const reduce = useReducedMotion() ?? false;
  const [phase, setPhase] = useState<Phase>("idle");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const celebrate = shouldCelebrate({ position: data.position, average: data.average, gradeKey: data.gradeKey });

  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  const start = () => {
    if (reduce) {
      setPhase("done");
      return;
    }
    setPhase("suspense");
    timers.current.push(setTimeout(() => setPhase("headline"), SUSPENSE_MS));
    timers.current.push(setTimeout(() => setPhase("done"), SUSPENSE_MS + COUNTUP_MS + HOLD_MS));
  };

  return (
    <div className="relative">
      {children}
      <AnimatePresence>
        {phase !== "done" && (
          <motion.div
            className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-card bg-surface dark:bg-surface-dark print:hidden"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            {phase === "idle" && (
              <div className="text-center">
                <p className="text-small text-ink-500 mb-1">{data.student.name}</p>
                <p className="font-display text-h3 font-semibold text-ink-1000 dark:text-ink-100 mb-4">Your results are ready</p>
                <Button onClick={start}>Reveal results</Button>
              </div>
            )}
            {phase === "suspense" && (
              <motion.div className="text-center" animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}>
                <p className="font-display text-h3 font-semibold text-ink-700 dark:text-ink-300">Revealing…</p>
              </motion.div>
            )}
            {phase === "headline" && (
              <div className="relative text-center">
                {celebrate && <Burst />}
                <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 220, damping: 16 }}>
                  <p className="text-small text-ink-500 mb-1">Overall average</p>
                  <p className="font-display text-[3rem] leading-none font-semibold text-brand-500">
                    <CountUp to={data.average} durationMs={COUNTUP_MS} reduce={reduce} />
                  </p>
                  <motion.p
                    className="mt-3 text-body text-ink-1000 dark:text-ink-100"
                    initial={{ y: 8, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.5, type: "spring", stiffness: 200, damping: 18 }}
                  >
                    Position <span className="font-semibold tabular-nums">{data.position}</span> of <span className="tabular-nums">{data.classSize}</span>
                    {celebrate && " 🎉"}
                  </motion.p>
                </motion.div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
