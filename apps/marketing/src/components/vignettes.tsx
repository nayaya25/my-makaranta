import { Check } from "lucide-react";

/**
 * Product vignettes — small, crisp in-product UI mockups used as the visual
 * "illustrations" throughout the page (Lattice-style). Pure markup, no client JS,
 * so they stay sharp at any size and cost nothing to render.
 */

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-white px-3.5 py-2.5 ring-hair">
      {children}
    </div>
  );
}

function Window({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-[0_20px_50px_-28px_rgba(0,31,31,0.45)] ring-hair">
      <div className="flex items-center gap-1.5 border-b border-ink/[0.08] px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-ink/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-ink/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-ink/15" />
        <span className="ml-2 text-[0.7rem] font-500 text-slate">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export function DashboardVignette() {
  const kpis = [
    { label: "Present today", value: "412", tint: "bg-teal-50 text-teal-800" },
    { label: "Collected", value: "₦2.4M", tint: "bg-lime-50 text-lime-800" },
    { label: "Outstanding", value: "₦640K", tint: "bg-sun-50 text-sun-800" },
  ];
  return (
    <Window title="myMakaranta — Dashboard">
      <div className="grid grid-cols-3 gap-2.5">
        {kpis.map((k) => (
          <div key={k.label} className={`rounded-xl p-3 ${k.tint}`}>
            <p className="text-[0.65rem] font-500 opacity-80">{k.label}</p>
            <p className="mt-1 text-lg font-700 tabular-nums">{k.value}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-xl bg-sand p-3 ring-hair">
        <div className="flex items-end justify-between gap-1.5">
          {[40, 62, 48, 78, 90, 70, 84].map((h, i) => (
            <span key={i} className="w-full rounded-t bg-teal-600/80" style={{ height: `${h * 0.5}px` }} />
          ))}
        </div>
        <p className="mt-2 text-[0.65rem] text-slate">Attendance, this week</p>
      </div>
    </Window>
  );
}

export function AttendanceVignette() {
  return (
    <Window title="Attendance · JSS 1A">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-xs text-slate">Morning roll call</span>
        <span className="rounded-full bg-mint-50 px-2.5 py-1 text-[0.65rem] font-600 text-mint-800">
          Marked in 28s
        </span>
      </div>
      <div className="space-y-2">
        {["Ada Eze", "Bola Okoro", "Chidi Nwosu", "Fatima Bello"].map((n, i) => (
          <Row key={n}>
            <span className="text-xs text-ink">{n}</span>
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-white ${
                i === 2 ? "bg-blush-400" : "bg-mint-400"
              }`}
            >
              {i === 2 ? <span className="text-[0.6rem]">✕</span> : <Check className="h-3 w-3" />}
            </span>
          </Row>
        ))}
      </div>
    </Window>
  );
}

export function FeesVignette() {
  return (
    <Window title="Fees · First Term">
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-xl bg-teal-50 p-3">
          <p className="text-[0.65rem] font-500 text-teal-800/80">Collected</p>
          <p className="mt-1 text-lg font-700 tabular-nums text-teal-800">₦2.4M</p>
        </div>
        <div className="rounded-xl bg-sun-50 p-3">
          <p className="text-[0.65rem] font-500 text-sun-800/80">Outstanding</p>
          <p className="mt-1 text-lg font-700 tabular-nums text-sun-800">₦640K</p>
        </div>
      </div>
      <div className="mt-2.5">
        <Row>
          <div>
            <p className="text-xs text-ink">Transfer · Ada Eze</p>
            <p className="text-[0.65rem] text-slate">Ref TRX-0091 · ₦45,000</p>
          </div>
          <span className="rounded-full bg-mint-50 px-2.5 py-1 text-[0.65rem] font-600 text-mint-800">
            Reconciled
          </span>
        </Row>
      </div>
    </Window>
  );
}

export function ResultsVignette() {
  return (
    <Window title="Results · Ada Eze">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-xs text-slate">First Term · JSS 1A</span>
        <span className="rounded-full bg-lilac-50 px-2.5 py-1 text-[0.65rem] font-600 text-lilac-800">
          Published
        </span>
      </div>
      <div className="space-y-2">
        {[
          ["Mathematics", "92", "A"],
          ["English", "85", "A"],
          ["Basic Science", "78", "B"],
        ].map(([s, score, g]) => (
          <Row key={s}>
            <span className="text-xs text-ink">{s}</span>
            <span className="flex items-center gap-2.5">
              <span className="text-xs tabular-nums text-slate">{score}</span>
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-lilac-100 text-[0.6rem] font-700 text-lilac-800">
                {g}
              </span>
            </span>
          </Row>
        ))}
      </div>
    </Window>
  );
}

export function AnnouncementsVignette() {
  return (
    <Window title="Announcements">
      <div className="rounded-xl bg-blush-50 p-3">
        <p className="text-xs font-600 text-ink">Mid-term break</p>
        <p className="mt-1 text-[0.7rem] leading-relaxed text-graphite">
          School resumes Monday 14th. Buses run the normal schedule.
        </p>
      </div>
      <div className="mt-2.5">
        <Row>
          <span className="text-xs text-slate">Sent to 312 parents</span>
          <span className="rounded-full bg-blush-100 px-2.5 py-1 text-[0.65rem] font-600 text-blush-800">
            286 read
          </span>
        </Row>
      </div>
    </Window>
  );
}
