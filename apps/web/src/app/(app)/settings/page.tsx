"use client";

import Link from "next/link";
import { Card, CardBody, CardHeader } from "@mymakaranta/ui";

export default function SettingsPage() {
  return (
    <div className="px-4 py-8 mx-auto max-w-2xl">
      <h1 className="font-display text-h2 font-semibold text-ink-1000 dark:text-ink-100 mb-6">
        Settings
      </h1>
      <div className="flex flex-col gap-4">
        <Card elevation="sm">
          <CardHeader>
            <h2 className="text-h3 font-semibold text-ink-1000 dark:text-ink-100">School settings</h2>
          </CardHeader>
          <CardBody>
            <p className="text-small text-ink-500">
              School configuration and advanced settings coming in a later sprint.
            </p>
          </CardBody>
        </Card>
        <Link href="/settings/assessment" className="block">
          <Card elevation="sm" interactive>
            <CardHeader>
              <h2 className="text-h3 font-semibold text-ink-1000 dark:text-ink-100">
                Assessment &amp; Grading
              </h2>
            </CardHeader>
            <CardBody>
              <p className="text-small text-ink-500">
                Score components, grade boundaries, and teacher–subject assignments.
              </p>
            </CardBody>
          </Card>
        </Link>
        <Link href="/settings/fees" className="block">
          <Card elevation="sm" interactive>
            <CardHeader>
              <h2 className="text-h3 font-semibold text-ink-1000 dark:text-ink-100">
                Fees
              </h2>
            </CardHeader>
            <CardBody>
              <p className="text-small text-ink-500">
                Per-class-level fee structure for each term.
              </p>
            </CardBody>
          </Card>
        </Link>
      </div>
    </div>
  );
}
