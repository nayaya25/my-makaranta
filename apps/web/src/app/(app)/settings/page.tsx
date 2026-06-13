"use client";

import { Card, CardBody, CardHeader } from "@mymakaranta/ui";

export default function SettingsPage() {
  return (
    <div className="px-4 py-8 mx-auto max-w-2xl">
      <h1 className="font-display text-h2 font-semibold text-ink-1000 dark:text-ink-100 mb-6">
        Settings
      </h1>
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
    </div>
  );
}
