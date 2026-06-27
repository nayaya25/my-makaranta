"use client";

import { BookOpen } from "lucide-react";
import { Card, CardBody } from "@mymakaranta/ui";

export default function StudentMaterialsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <Card>
        <CardBody className="flex flex-col items-center gap-4 py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-300">
            <BookOpen size={28} aria-hidden />
          </span>
          <h1 className="font-display text-h2 font-bold tracking-tight text-ink-1000 dark:text-ink-100">
            Materials
          </h1>
          <p className="max-w-xs text-body leading-relaxed text-ink-500 dark:text-ink-400">
            Lesson materials, notes, and resources shared by your teachers will appear here once the
            academic workstream ships.
          </p>
          <span className="inline-flex items-center rounded-full bg-brand-50 px-3 py-1 text-[12px] font-semibold text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
            Coming soon
          </span>
        </CardBody>
      </Card>
    </div>
  );
}
