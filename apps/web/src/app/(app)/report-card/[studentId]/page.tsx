"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { Button, Spinner } from "@mymakaranta/ui";
import {
  api,
  ApiError,
  type StandardReportCard,
  type EarlyYearsReportCard,
  type ReportCard,
  type ReportCardConfig,
} from "@/lib/api";
import { ResultReveal } from "../ResultReveal";

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

function AttendancePill({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className={`flex flex-col items-center rounded-lg px-4 py-2 ${accent}`}>
      <span className="text-[1.25rem] font-bold tabular-nums leading-tight">{value}</span>
      <span className="text-[0.625rem] uppercase tracking-widest opacity-70">{label}</span>
    </div>
  );
}

// ─── section components ────────────────────────────────────────────────────────

function SkillsSection({ skills, scaleKey }: {
  skills: NonNullable<StandardReportCard["skills"]>;
  scaleKey: NonNullable<StandardReportCard["scaleKey"]>;
}) {
  const sortedScale = [...scaleKey].sort((a, b) => b.value - a.value);
  return (
    <section className="mb-5">
      <h3 className="mb-2 text-[0.65rem] font-semibold uppercase tracking-widest text-ink-500 dark:text-ink-400 print:text-gray-500">
        Skills Assessment
      </h3>
      {skills.map((dom) => (
        <div key={dom.domain} className="mb-3">
          <p className="mb-1 text-[0.75rem] font-semibold text-ink-700 dark:text-ink-300 print:text-gray-700">
            {dom.domain}
          </p>
          <table className="w-full text-[0.75rem] border-collapse">
            <tbody>
              {dom.items.map((item) => (
                <tr key={item.name} className="border-b border-ink-1000/[0.05] dark:border-white/[0.05] print:border-gray-200">
                  <td className="py-0.5 pr-3 text-ink-700 dark:text-ink-300 print:text-gray-700 w-[55%]">{item.name}</td>
                  <td className="py-0.5 text-center tabular-nums font-medium text-ink-1000 dark:text-ink-100 print:text-black">
                    {item.value ?? "—"}
                  </td>
                  <td className="py-0.5 pl-2 text-ink-500 dark:text-ink-400 print:text-gray-500">
                    {item.value != null ? (sortedScale.find((s) => s.value === item.value)?.label ?? "") : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {sortedScale.length > 0 && (
        <p className="mt-1 text-[0.625rem] text-ink-400 dark:text-ink-500 print:text-gray-400">
          Scale: {sortedScale.map((s) => `${s.value} = ${s.label}`).join("  ·  ")}
        </p>
      )}
    </section>
  );
}

function AttendanceSection({ attendance }: { attendance: { present: number; absent: number; total: number } }) {
  return (
    <section className="mb-5">
      <h3 className="mb-2 text-[0.65rem] font-semibold uppercase tracking-widest text-ink-500 dark:text-ink-400 print:text-gray-500">
        Attendance
      </h3>
      <div className="flex gap-3">
        <AttendancePill label="Present" value={attendance.present} accent="bg-success/10 text-success dark:bg-success/20" />
        <AttendancePill label="Absent" value={attendance.absent} accent="bg-error/10 text-error dark:bg-error/20" />
        <AttendancePill label="Total" value={attendance.total} accent="bg-ink-1000/[0.05] text-ink-700 dark:bg-white/[0.05] dark:text-ink-300" />
      </div>
    </section>
  );
}

function RemarksSection({ remarks }: { remarks: { formTeacher: string | null; principal: string | null } }) {
  return (
    <section className="mb-5">
      <h3 className="mb-2 text-[0.65rem] font-semibold uppercase tracking-widest text-ink-500 dark:text-ink-400 print:text-gray-500">
        Remarks
      </h3>
      {remarks.formTeacher && (
        <div className="mb-2">
          <p className="text-[0.625rem] text-ink-400 dark:text-ink-500 print:text-gray-400">Form Teacher</p>
          <p className="text-[0.8rem] text-ink-700 dark:text-ink-300 print:text-gray-700">{remarks.formTeacher}</p>
        </div>
      )}
      {remarks.principal && (
        <div>
          <p className="text-[0.625rem] text-ink-400 dark:text-ink-500 print:text-gray-400">Principal</p>
          <p className="text-[0.8rem] text-ink-700 dark:text-ink-300 print:text-gray-700">{remarks.principal}</p>
        </div>
      )}
      {!remarks.formTeacher && !remarks.principal && (
        <p className="text-[0.8rem] text-ink-400 italic">No remarks.</p>
      )}
    </section>
  );
}

function SignatureSection({ signatureUrl, releasedAt }: { signatureUrl?: string | null; releasedAt: string }) {
  return (
    <div className="mt-auto flex items-end justify-between border-t border-ink-1000/10 dark:border-white/10 print:border-gray-200 pt-4">
      <div className="text-[0.65rem] text-ink-400 dark:text-ink-500 print:text-gray-400">
        <p>Issued {fmtDate(releasedAt)}</p>
      </div>
      <div className="flex flex-col items-center gap-1">
        {signatureUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={signatureUrl} alt="Principal signature" className="h-10 object-contain" />
        )}
        <div className="border-t border-ink-1000/20 dark:border-white/20 print:border-gray-400 w-32 pt-0.5 text-center text-[0.625rem] text-ink-400 dark:text-ink-500 print:text-gray-400">
          Principal&apos;s Signature
        </div>
      </div>
    </div>
  );
}

// ─── Early Years layout ───────────────────────────────────────────────────────

function EarlyYearsLayout({ rc, cfg }: { rc: EarlyYearsReportCard; cfg: ReportCardConfig }) {
  const sortedScale = [...rc.scaleKey].sort((a, b) => b.value - a.value);

  return (
    <div className="rounded-[4px] border border-ink-200 dark:border-white/10 print:border-0 bg-surface dark:bg-surface-dark p-8 print:p-0 font-sans text-ink-1000 dark:text-ink-100 print:text-black print:bg-white">
      {/* Header */}
      <header className="flex items-center gap-4 mb-6 pb-4 border-b-2 border-brand-600 print:border-teal-700">
        {rc.school.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={rc.school.logoUrl} alt="School logo" className="h-16 w-16 object-contain shrink-0" />
        )}
        <div className="text-center flex-1">
          <h1 className="font-display text-[1.25rem] font-bold text-ink-1000 dark:text-ink-100 print:text-black uppercase tracking-wide">
            {rc.school.name}
          </h1>
          {rc.school.motto && (
            <p className="text-[0.75rem] italic text-ink-500 dark:text-ink-400 print:text-gray-500 mt-0.5">
              &quot;{rc.school.motto}&quot;
            </p>
          )}
          <p className="mt-1 text-[0.7rem] font-semibold uppercase tracking-widest text-brand-600 print:text-teal-700">
            Early Years Report
          </p>
        </div>
      </header>

      {/* Student info */}
      <section className="grid grid-cols-2 gap-x-6 gap-y-1 text-[0.8rem] mb-5 bg-ink-1000/[0.02] dark:bg-white/[0.02] print:bg-gray-50 rounded-lg p-3">
        <div><span className="text-ink-500 dark:text-ink-400 print:text-gray-500">Student:</span> <span className="font-medium">{rc.student.name}</span></div>
        <div><span className="text-ink-500 dark:text-ink-400 print:text-gray-500">Admission No:</span> <span className="font-medium tabular-nums">{rc.student.admissionNo}</span></div>
        <div><span className="text-ink-500 dark:text-ink-400 print:text-gray-500">Class:</span> <span className="font-medium">{rc.class.name}</span></div>
        <div><span className="text-ink-500 dark:text-ink-400 print:text-gray-500">Term:</span> <span className="font-medium">{rc.term.label}</span></div>
      </section>

      {/* Developmental areas */}
      <section className="mb-5">
        <h3 className="mb-2 text-[0.65rem] font-semibold uppercase tracking-widest text-ink-500 dark:text-ink-400 print:text-gray-500">
          Developmental Assessment
        </h3>
        {rc.areas.map((area) => (
          <div key={area.area} className="mb-4">
            <p className="mb-1 text-[0.75rem] font-semibold text-brand-700 dark:text-brand-300 print:text-teal-700">
              {area.area}
            </p>
            <table className="w-full text-[0.75rem] border-collapse">
              <tbody>
                {area.items.map((item) => (
                  <tr key={item.name} className="border-b border-ink-1000/[0.05] dark:border-white/[0.05] print:border-gray-200">
                    <td className="py-0.5 pr-3 text-ink-700 dark:text-ink-300 print:text-gray-700 w-[55%]">{item.name}</td>
                    <td className="py-0.5 text-center tabular-nums font-medium text-ink-1000 dark:text-ink-100 print:text-black">
                      {item.rating ? item.rating.value : "—"}
                    </td>
                    <td className="py-0.5 pl-2 text-ink-500 dark:text-ink-400 print:text-gray-500">
                      {item.rating ? item.rating.label : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </section>

      {/* Scale key */}
      {sortedScale.length > 0 && (
        <p className="mb-5 text-[0.625rem] text-ink-400 dark:text-ink-500 print:text-gray-400">
          Scale: {sortedScale.map((s) => `${s.value} = ${s.label}`).join("  ·  ")}
        </p>
      )}

      {/* Attendance */}
      {cfg.showAttendance && (
        <AttendanceSection attendance={rc.attendance} />
      )}

      {/* Narrative / remarks */}
      {cfg.showRemarks && (
        <RemarksSection remarks={rc.narrative} />
      )}

      {/* Next term */}
      {cfg.nextTermBegins && (
        <p className="mb-4 text-[0.75rem] text-ink-500 dark:text-ink-400 print:text-gray-500">
          Next term begins: <span className="font-medium">{fmtDate(cfg.nextTermBegins)}</span>
        </p>
      )}

      {/* Footer */}
      <footer className="flex items-end justify-between pt-4 border-t border-ink-1000/10 dark:border-white/10 print:border-gray-200">
        <div className="text-[0.65rem] text-ink-400 dark:text-ink-500 print:text-gray-400">
          <p>{rc.school.name}</p>
        </div>
        <div className="flex flex-col items-center gap-1">
          {rc.school.principalSignatureUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={rc.school.principalSignatureUrl} alt="Principal signature" className="h-10 object-contain" />
          )}
          <div className="w-32 border-t border-ink-1000/20 dark:border-white/20 print:border-gray-400 pt-0.5 text-center text-[0.625rem] text-ink-400 dark:text-ink-500 print:text-gray-400">
            Principal&apos;s Signature
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─── layout variants ───────────────────────────────────────────────────────────

function ClassicLayout({ rc, qr, cfg }: { rc: StandardReportCard; qr: string; cfg: ReportCardConfig }) {
  return (
    <div className="rounded-[4px] border border-ink-200 dark:border-white/10 print:border-0 bg-surface dark:bg-surface-dark p-8 print:p-0 font-sans text-ink-1000 dark:text-ink-100 print:text-black print:bg-white">
      {/* Header */}
      <header className="flex items-center gap-4 mb-6 pb-4 border-b-2 border-brand-600 print:border-teal-700">
        {rc.school.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={rc.school.logoUrl} alt="School logo" className="h-16 w-16 object-contain shrink-0" />
        )}
        <div className="text-center flex-1">
          <h1 className="font-display text-[1.25rem] font-bold text-ink-1000 dark:text-ink-100 print:text-black uppercase tracking-wide">
            {rc.school.name}
          </h1>
          {rc.school.motto && (
            <p className="text-[0.75rem] italic text-ink-500 dark:text-ink-400 print:text-gray-500 mt-0.5">
              &quot;{rc.school.motto}&quot;
            </p>
          )}
          <p className="mt-1 text-[0.7rem] font-semibold uppercase tracking-widest text-brand-600 print:text-teal-700">
            Terminal Report Card
          </p>
        </div>
      </header>

      {/* Student info */}
      <section className="grid grid-cols-2 gap-x-6 gap-y-1 text-[0.8rem] mb-5 bg-ink-1000/[0.02] dark:bg-white/[0.02] print:bg-gray-50 rounded-lg p-3">
        <div><span className="text-ink-500 dark:text-ink-400 print:text-gray-500">Student:</span> <span className="font-medium">{rc.student.name}</span></div>
        <div><span className="text-ink-500 dark:text-ink-400 print:text-gray-500">Admission No:</span> <span className="font-medium tabular-nums">{rc.student.admissionNo}</span></div>
        <div><span className="text-ink-500 dark:text-ink-400 print:text-gray-500">Class:</span> <span className="font-medium">{rc.className}</span></div>
        <div><span className="text-ink-500 dark:text-ink-400 print:text-gray-500">Term:</span> <span className="font-medium">{rc.term.label}</span></div>
      </section>

      {/* Subjects table */}
      <section className="mb-5">
        <h3 className="mb-2 text-[0.65rem] font-semibold uppercase tracking-widest text-ink-500 dark:text-ink-400 print:text-gray-500">
          Academic Performance
        </h3>
        <table className="w-full text-[0.8rem] border-collapse">
          <thead>
            <tr className="bg-brand-600/10 print:bg-teal-50 text-left">
              <th className="py-2 px-3 font-semibold text-brand-700 dark:text-brand-300 print:text-teal-700 rounded-tl-md">Subject</th>
              <th className="py-2 px-3 text-center font-semibold text-brand-700 dark:text-brand-300 print:text-teal-700">Total</th>
              <th className="py-2 px-3 text-center font-semibold text-brand-700 dark:text-brand-300 print:text-teal-700 rounded-tr-md">Grade</th>
            </tr>
          </thead>
          <tbody>
            {rc.subjectGroups && rc.subjectGroups.length > 0 ? (
              (() => {
                const hasNonNull = rc.subjectGroups.some((g) => g.category !== null);
                let rowIdx = 0;
                return rc.subjectGroups.map((group) => (
                  <>
                    {(group.category !== null || hasNonNull) && (
                      <tr key={`cat-${group.category ?? "null"}`}>
                        <td colSpan={3} className="py-1 px-3 text-[0.65rem] font-semibold uppercase tracking-widest text-ink-500 dark:text-ink-400 print:text-gray-500 bg-ink-1000/[0.03] dark:bg-white/[0.03] print:bg-gray-50">
                          {group.category ?? "Subjects"}
                        </td>
                      </tr>
                    )}
                    {group.subjects.map((e) => {
                      const i = rowIdx++;
                      return (
                        <tr key={e.subjectId} className={i % 2 === 0 ? "bg-transparent" : "bg-ink-1000/[0.02] dark:bg-white/[0.02] print:bg-gray-50"}>
                          <td className="py-1.5 px-3 border-b border-ink-1000/[0.05] dark:border-white/[0.05] print:border-gray-100">{e.subjectName}</td>
                          <td className="py-1.5 px-3 text-center tabular-nums font-medium border-b border-ink-1000/[0.05] dark:border-white/[0.05] print:border-gray-100">{e.total}</td>
                          <td className="py-1.5 px-3 text-center border-b border-ink-1000/[0.05] dark:border-white/[0.05] print:border-gray-100">{e.grade || "—"}</td>
                        </tr>
                      );
                    })}
                  </>
                ));
              })()
            ) : (
              rc.entries.map((e, i) => (
                <tr key={e.subjectId} className={i % 2 === 0 ? "bg-transparent" : "bg-ink-1000/[0.02] dark:bg-white/[0.02] print:bg-gray-50"}>
                  <td className="py-1.5 px-3 border-b border-ink-1000/[0.05] dark:border-white/[0.05] print:border-gray-100">{e.subjectName}</td>
                  <td className="py-1.5 px-3 text-center tabular-nums font-medium border-b border-ink-1000/[0.05] dark:border-white/[0.05] print:border-gray-100">{e.total}</td>
                  <td className="py-1.5 px-3 text-center border-b border-ink-1000/[0.05] dark:border-white/[0.05] print:border-gray-100">{e.grade || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="bg-brand-600/5 print:bg-teal-50 font-semibold">
              <td className="py-2 px-3 text-ink-1000 dark:text-ink-100 print:text-black">Overall</td>
              <td className="py-2 px-3 text-center tabular-nums text-brand-600 print:text-teal-700">{rc.average}</td>
              <td className="py-2 px-3 text-center text-ink-500 dark:text-ink-400 print:text-gray-500">
                {cfg.showPosition ? `${rc.position} / ${rc.classSize}` : ""}
              </td>
            </tr>
          </tfoot>
        </table>
      </section>

      {cfg.showGradingKey && rc.gradeKey.length > 0 && (
        <p className="mb-5 text-[0.625rem] text-ink-400 dark:text-ink-500 print:text-gray-400">
          Grade key: {rc.gradeKey.map((g) => `${g.grade} ≥ ${g.minScore} (${g.remark})`).join("  ·  ")}
        </p>
      )}

      {cfg.showSkills && rc.skills && rc.skills.length > 0 && (
        <SkillsSection skills={rc.skills} scaleKey={rc.scaleKey ?? []} />
      )}

      {cfg.showAttendance && rc.attendance && (
        <AttendanceSection attendance={rc.attendance} />
      )}

      {cfg.showRemarks && rc.remarks && (
        <RemarksSection remarks={rc.remarks} />
      )}

      {cfg.nextTermBegins && (
        <p className="mb-4 text-[0.75rem] text-ink-500 dark:text-ink-400 print:text-gray-500">
          Next term begins: <span className="font-medium">{fmtDate(cfg.nextTermBegins)}</span>
        </p>
      )}

      {/* Footer */}
      <footer className="flex items-end justify-between pt-4 border-t border-ink-1000/10 dark:border-white/10 print:border-gray-200">
        <div className="text-[0.65rem] text-ink-400 dark:text-ink-500 print:text-gray-400">
          <p>Issued {fmtDate(rc.releasedAt)}</p>
          <p className="font-mono mt-0.5">{rc.verificationCode}</p>
        </div>
        <div className="flex items-end gap-4">
          {qr && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="Verification QR code" width={72} height={72} />
          )}
          <div className="flex flex-col items-center gap-1">
            {rc.school.principalSignatureUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={rc.school.principalSignatureUrl} alt="Principal signature" className="h-10 object-contain" />
            )}
            <div className="w-32 border-t border-ink-1000/20 dark:border-white/20 print:border-gray-400 pt-0.5 text-center text-[0.625rem] text-ink-400 dark:text-ink-500 print:text-gray-400">
              Principal&apos;s Signature
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function ModernLayout({ rc, qr, cfg }: { rc: StandardReportCard; qr: string; cfg: ReportCardConfig }) {
  return (
    <div className="overflow-hidden rounded-[4px] border border-ink-200 dark:border-white/10 print:border-0 bg-surface dark:bg-surface-dark print:bg-white font-sans text-ink-1000 dark:text-ink-100 print:text-black">
      {/* Accent header bar */}
      <div className="bg-gradient-to-r from-brand-600 to-brand-500 print:bg-teal-700 px-8 py-6 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {rc.school.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={rc.school.logoUrl} alt="School logo" className="h-14 w-14 rounded-full border-2 border-white/30 object-contain bg-white/10 p-1" />
            )}
            <div>
              <h1 className="font-display text-[1.1rem] font-bold uppercase tracking-wide leading-tight">{rc.school.name}</h1>
              {rc.school.motto && <p className="text-[0.7rem] italic opacity-80 mt-0.5">&quot;{rc.school.motto}&quot;</p>}
            </div>
          </div>
          <div className="text-right">
            <p className="text-[0.625rem] uppercase tracking-widest opacity-70">Terminal Report Card</p>
            <p className="text-[0.8rem] font-medium mt-0.5">{rc.term.label}</p>
          </div>
        </div>
      </div>

      <div className="p-8 print:p-6">
        {/* Student card */}
        <div className="mb-6 flex items-center justify-between rounded-xl bg-ink-1000/[0.03] dark:bg-white/[0.03] print:bg-gray-50 px-5 py-4">
          <div>
            <p className="text-[1rem] font-bold text-ink-1000 dark:text-ink-100 print:text-black">{rc.student.name}</p>
            <p className="text-[0.75rem] text-ink-500 dark:text-ink-400 print:text-gray-500 mt-0.5">
              {rc.className} &nbsp;·&nbsp; Adm. No: <span className="tabular-nums">{rc.student.admissionNo}</span>
            </p>
          </div>
          {cfg.showPosition && (
            <div className="text-center">
              <p className="text-[2rem] font-bold tabular-nums text-brand-600 print:text-teal-700 leading-none">{rc.position}</p>
              <p className="text-[0.625rem] uppercase tracking-widest text-ink-400 dark:text-ink-500 print:text-gray-400">of {rc.classSize}</p>
            </div>
          )}
        </div>

        {/* Two-column layout: subjects + secondary */}
        <div className="flex gap-6">
          <div className="flex-1 min-w-0">
            <h3 className="mb-2 text-[0.65rem] font-semibold uppercase tracking-widest text-ink-500 dark:text-ink-400 print:text-gray-500">
              Academic Results
            </h3>
            <table className="w-full text-[0.8rem] border-collapse">
              <thead>
                <tr className="border-b-2 border-brand-600/30 print:border-teal-300 text-left">
                  <th className="pb-1.5 font-semibold text-ink-700 dark:text-ink-300 print:text-gray-700">Subject</th>
                  <th className="pb-1.5 text-center font-semibold text-ink-700 dark:text-ink-300 print:text-gray-700">Score</th>
                  <th className="pb-1.5 text-center font-semibold text-ink-700 dark:text-ink-300 print:text-gray-700">Grade</th>
                </tr>
              </thead>
              <tbody>
                {rc.subjectGroups && rc.subjectGroups.length > 0 ? (
                  (() => {
                    const hasNonNull = rc.subjectGroups.some((g) => g.category !== null);
                    return rc.subjectGroups.map((group) => (
                      <>
                        {(group.category !== null || hasNonNull) && (
                          <tr key={`cat-${group.category ?? "null"}`}>
                            <td colSpan={3} className="py-1 px-1 text-[0.65rem] font-semibold uppercase tracking-widest text-ink-500 dark:text-ink-400 print:text-gray-500 bg-ink-1000/[0.03] dark:bg-white/[0.03] print:bg-gray-50">
                              {group.category ?? "Subjects"}
                            </td>
                          </tr>
                        )}
                        {group.subjects.map((e) => (
                          <tr key={e.subjectId} className="border-b border-ink-1000/[0.05] dark:border-white/[0.05] print:border-gray-100">
                            <td className="py-1.5 pr-3 text-ink-700 dark:text-ink-300 print:text-gray-700">{e.subjectName}</td>
                            <td className="py-1.5 text-center tabular-nums font-medium">{e.total}</td>
                            <td className="py-1.5 text-center text-brand-600 dark:text-brand-300 print:text-teal-700 font-semibold">{e.grade || "—"}</td>
                          </tr>
                        ))}
                      </>
                    ));
                  })()
                ) : (
                  rc.entries.map((e) => (
                    <tr key={e.subjectId} className="border-b border-ink-1000/[0.05] dark:border-white/[0.05] print:border-gray-100">
                      <td className="py-1.5 pr-3 text-ink-700 dark:text-ink-300 print:text-gray-700">{e.subjectName}</td>
                      <td className="py-1.5 text-center tabular-nums font-medium">{e.total}</td>
                      <td className="py-1.5 text-center text-brand-600 dark:text-brand-300 print:text-teal-700 font-semibold">{e.grade || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-brand-600/30 print:border-teal-300">
                  <td className="pt-2 font-semibold">Average</td>
                  <td className="pt-2 text-center tabular-nums font-bold text-brand-600 print:text-teal-700">{rc.average}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="w-[11rem] shrink-0 flex flex-col gap-4">
            {cfg.showAttendance && rc.attendance && (
              <div>
                <h3 className="mb-2 text-[0.65rem] font-semibold uppercase tracking-widest text-ink-500 dark:text-ink-400 print:text-gray-500">
                  Attendance
                </h3>
                <div className="flex gap-1.5">
                  <AttendancePill label="Present" value={rc.attendance.present} accent="bg-success/10 text-success dark:bg-success/20" />
                  <AttendancePill label="Absent" value={rc.attendance.absent} accent="bg-error/10 text-error dark:bg-error/20" />
                </div>
                <p className="mt-1 text-[0.625rem] text-ink-400 dark:text-ink-500 print:text-gray-400">
                  Total: {rc.attendance.total} days
                </p>
              </div>
            )}

            {qr && (
              <div className="flex flex-col items-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt="Verification QR code" width={80} height={80} />
                <p className="mt-1 text-center font-mono text-[0.55rem] text-ink-400 dark:text-ink-500 print:text-gray-400 break-all">{rc.verificationCode}</p>
              </div>
            )}
          </div>
        </div>

        {cfg.showGradingKey && rc.gradeKey.length > 0 && (
          <p className="mt-4 text-[0.625rem] text-ink-400 dark:text-ink-500 print:text-gray-400">
            Grade key: {rc.gradeKey.map((g) => `${g.grade} ≥ ${g.minScore} (${g.remark})`).join("  ·  ")}
          </p>
        )}

        {cfg.showSkills && rc.skills && rc.skills.length > 0 && (
          <div className="mt-4">
            <SkillsSection skills={rc.skills} scaleKey={rc.scaleKey ?? []} />
          </div>
        )}

        {cfg.showRemarks && rc.remarks && (
          <div className="mt-2">
            <RemarksSection remarks={rc.remarks} />
          </div>
        )}

        {cfg.nextTermBegins && (
          <p className="mt-3 text-[0.75rem] text-ink-500 dark:text-ink-400 print:text-gray-500">
            Next term begins: <span className="font-medium">{fmtDate(cfg.nextTermBegins)}</span>
          </p>
        )}

        <SignatureSection signatureUrl={rc.school.principalSignatureUrl} releasedAt={rc.releasedAt} />
      </div>
    </div>
  );
}

function CompactLayout({ rc, qr, cfg }: { rc: StandardReportCard; qr: string; cfg: ReportCardConfig }) {
  return (
    <div className="rounded-[4px] border border-ink-200 dark:border-white/10 print:border-0 bg-surface dark:bg-surface-dark print:bg-white font-sans text-ink-1000 dark:text-ink-100 print:text-black p-5 print:p-4 text-[0.78rem]">
      {/* Compact single-line header */}
      <header className="flex items-center gap-3 mb-4 pb-3 border-b border-brand-600/30 print:border-teal-300">
        {rc.school.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={rc.school.logoUrl} alt="School logo" className="h-10 w-10 object-contain shrink-0" />
        )}
        <div className="flex-1">
          <span className="font-bold text-[0.9rem] uppercase tracking-wide">{rc.school.name}</span>
          {rc.school.motto && <span className="ml-2 text-[0.65rem] italic text-ink-400 dark:text-ink-500 print:text-gray-400">&quot;{rc.school.motto}&quot;</span>}
        </div>
        <span className="text-[0.65rem] uppercase tracking-widest text-brand-600 print:text-teal-700 font-semibold shrink-0">Terminal Report</span>
      </header>

      {/* Student row */}
      <div className="flex items-center justify-between mb-3 text-[0.75rem]">
        <div className="flex gap-4">
          <span><span className="text-ink-500 print:text-gray-500">Student:</span> <strong>{rc.student.name}</strong></span>
          <span><span className="text-ink-500 print:text-gray-500">Adm:</span> <span className="tabular-nums">{rc.student.admissionNo}</span></span>
          <span><span className="text-ink-500 print:text-gray-500">Class:</span> {rc.className}</span>
        </div>
        <span className="text-ink-500 print:text-gray-500 shrink-0">{rc.term.label}</span>
      </div>

      {/* Compact subjects table */}
      <table className="w-full text-[0.75rem] border-collapse mb-3">
        <thead>
          <tr className="bg-ink-1000/[0.04] dark:bg-white/[0.04] print:bg-gray-100 text-left">
            <th className="py-1 px-2 text-ink-600 dark:text-ink-400 print:text-gray-600">Subject</th>
            <th className="py-1 px-2 text-center text-ink-600 dark:text-ink-400 print:text-gray-600">Score</th>
            <th className="py-1 px-2 text-center text-ink-600 dark:text-ink-400 print:text-gray-600">Gd</th>
          </tr>
        </thead>
        <tbody>
          {rc.subjectGroups && rc.subjectGroups.length > 0 ? (
            (() => {
              const hasNonNull = rc.subjectGroups.some((g) => g.category !== null);
              return rc.subjectGroups.map((group) => (
                <>
                  {(group.category !== null || hasNonNull) && (
                    <tr key={`cat-${group.category ?? "null"}`}>
                      <td colSpan={3} className="py-0.5 px-2 text-[0.6rem] font-semibold uppercase tracking-widest text-ink-500 dark:text-ink-400 print:text-gray-500 bg-ink-1000/[0.03] dark:bg-white/[0.03] print:bg-gray-50">
                        {group.category ?? "Subjects"}
                      </td>
                    </tr>
                  )}
                  {group.subjects.map((e) => (
                    <tr key={e.subjectId} className="border-b border-ink-1000/[0.04] dark:border-white/[0.04] print:border-gray-100">
                      <td className="py-0.5 px-2">{e.subjectName}</td>
                      <td className="py-0.5 px-2 text-center tabular-nums">{e.total}</td>
                      <td className="py-0.5 px-2 text-center font-semibold text-brand-600 dark:text-brand-300 print:text-teal-700">{e.grade || "—"}</td>
                    </tr>
                  ))}
                </>
              ));
            })()
          ) : (
            rc.entries.map((e) => (
              <tr key={e.subjectId} className="border-b border-ink-1000/[0.04] dark:border-white/[0.04] print:border-gray-100">
                <td className="py-0.5 px-2">{e.subjectName}</td>
                <td className="py-0.5 px-2 text-center tabular-nums">{e.total}</td>
                <td className="py-0.5 px-2 text-center font-semibold text-brand-600 dark:text-brand-300 print:text-teal-700">{e.grade || "—"}</td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr className="bg-ink-1000/[0.03] dark:bg-white/[0.03] print:bg-gray-50 font-semibold">
            <td className="py-1 px-2">Average</td>
            <td className="py-1 px-2 text-center tabular-nums text-brand-600 print:text-teal-700">{rc.average}</td>
            <td className="py-1 px-2 text-center text-ink-500 print:text-gray-500">
              {cfg.showPosition ? `${rc.position}/${rc.classSize}` : ""}
            </td>
          </tr>
        </tfoot>
      </table>

      {/* Compact row of optional sections */}
      <div className="flex gap-4 text-[0.72rem] mb-3">
        {cfg.showAttendance && rc.attendance && (
          <div>
            <span className="text-ink-500 print:text-gray-500 uppercase tracking-widest text-[0.58rem] font-semibold">Attendance: </span>
            <span className="text-success font-medium">{rc.attendance.present}P</span>
            {" · "}
            <span className="text-error font-medium">{rc.attendance.absent}A</span>
            {" · "}
            <span className="text-ink-500 print:text-gray-500">{rc.attendance.total} days</span>
          </div>
        )}
        {cfg.showGradingKey && rc.gradeKey.length > 0 && (
          <div className="text-ink-400 print:text-gray-400">
            {rc.gradeKey.map((g) => `${g.grade}≥${g.minScore}`).join("  ")}
          </div>
        )}
      </div>

      {cfg.showSkills && rc.skills && rc.skills.length > 0 && (
        <div className="mb-3">
          {rc.skills.map((dom) => (
            <div key={dom.domain} className="mb-1">
              <span className="text-[0.65rem] font-semibold text-ink-600 dark:text-ink-400 print:text-gray-600 mr-2">{dom.domain}:</span>
              <span className="text-ink-700 dark:text-ink-300 print:text-gray-700">
                {dom.items.map((it) => `${it.name} ${it.value ?? "—"}`).join("  ·  ")}
              </span>
            </div>
          ))}
          {rc.scaleKey && rc.scaleKey.length > 0 && (
            <p className="text-[0.58rem] text-ink-400 dark:text-ink-500 print:text-gray-400 mt-0.5">
              {[...rc.scaleKey].sort((a, b) => b.value - a.value).map((s) => `${s.value}=${s.label}`).join("  ")}
            </p>
          )}
        </div>
      )}

      {cfg.showRemarks && rc.remarks && (
        <div className="mb-3 text-[0.72rem]">
          {rc.remarks.formTeacher && <p><span className="text-ink-400 print:text-gray-400">Teacher: </span>{rc.remarks.formTeacher}</p>}
          {rc.remarks.principal && <p><span className="text-ink-400 print:text-gray-400">Principal: </span>{rc.remarks.principal}</p>}
        </div>
      )}

      {cfg.nextTermBegins && (
        <p className="mb-3 text-[0.72rem] text-ink-500 print:text-gray-500">
          Next term begins: <strong>{fmtDate(cfg.nextTermBegins)}</strong>
        </p>
      )}

      {/* Compact footer */}
      <div className="flex items-end justify-between border-t border-ink-1000/10 dark:border-white/10 print:border-gray-200 pt-3">
        <div className="text-[0.6rem] text-ink-400 dark:text-ink-500 print:text-gray-400">
          <p>Issued {fmtDate(rc.releasedAt)}</p>
          <p className="font-mono">{rc.verificationCode}</p>
        </div>
        <div className="flex items-end gap-3">
          {qr && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="Verification QR code" width={56} height={56} />
          )}
          <div className="flex flex-col items-center gap-1">
            {rc.school.principalSignatureUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={rc.school.principalSignatureUrl} alt="Principal signature" className="h-8 object-contain" />
            )}
            <div className="w-24 border-t border-ink-1000/20 print:border-gray-400 pt-0.5 text-center text-[0.55rem] text-ink-400 print:text-gray-400">
              Principal&apos;s Signature
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── print styles (injected into <head> at runtime) ───────────────────────────

const PRINT_CSS = `
@media print {
  /* Hide everything except #report-card-printable */
  body > *:not(#__next):not([data-nextjs-scroll-focus-boundary]) { display: none !important; }
  #__next > * { display: none !important; }
  #report-card-printable { display: block !important; }
  #report-card-printable * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  /* A4 page setup */
  @page {
    size: A4 portrait;
    margin: 12mm 14mm;
  }

  html, body {
    width: 210mm;
    height: 297mm;
    margin: 0;
    padding: 0;
    font-size: 11pt;
    background: white !important;
    color: black !important;
  }

  /* Prevent page breaks inside the card */
  #report-card-printable { page-break-inside: avoid; }

  /* Ensure the card fills the A4 area */
  .print-a4-wrapper {
    width: 100%;
    min-height: 270mm;
  }
}
`;

// ─── default config fallback ───────────────────────────────────────────────────

const DEFAULT_CFG: ReportCardConfig = {
  id: "",
  layout: "classic",
  showSkills: true,
  showAttendance: true,
  showRemarks: true,
  showGradingKey: true,
  showPosition: true,
  nextTermBegins: null,
};

// ─── page ─────────────────────────────────────────────────────────────────────

export default function ReportCardPage() {
  const params = useParams<{ studentId: string }>();
  const search = useSearchParams();
  const termId = search.get("termId") ?? "";

  const [rc, setRc] = useState<ReportCard | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [qr, setQr] = useState<string>("");
  const [downloading, setDownloading] = useState(false);
  const [dlErr, setDlErr] = useState<string | null>(null);

  // Inject print CSS once
  useEffect(() => {
    const style = document.createElement("style");
    style.id = "rc-print-css";
    style.textContent = PRINT_CSS;
    if (!document.getElementById("rc-print-css")) document.head.appendChild(style);
    return () => { document.getElementById("rc-print-css")?.remove(); };
  }, []);

  useEffect(() => {
    if (!params.studentId || !termId) return;
    void api
      .getReportCard(params.studentId, termId)
      .then(setRc)
      .catch((e) => setErr(e instanceof ApiError ? e.message : "Could not load the report card."));
  }, [params.studentId, termId]);

  // QR code only for standard mode (has verificationCode)
  const verifyUrl = useMemo(
    () =>
      rc && rc.mode === "standard" && typeof window !== "undefined"
        ? `${window.location.origin}/verify/${rc.verificationCode}`
        : "",
    [rc],
  );
  useEffect(() => {
    if (verifyUrl) void QRCode.toDataURL(verifyUrl, { margin: 1, width: 120 }).then(setQr).catch(() => setQr(""));
  }, [verifyUrl]);

  const handleDownload = async () => {
    if (!params.studentId || !termId) return;
    setDownloading(true);
    setDlErr(null);
    try {
      await api.downloadReportCardPdf(params.studentId, termId);
    } catch (e) {
      setDlErr(e instanceof ApiError ? e.message : "PDF download failed.");
    } finally {
      setDownloading(false);
    }
  };

  if (err) return <p className="p-8 text-small text-error">{err}</p>;
  if (!rc) return <div className="flex justify-center p-16"><Spinner size="lg" /></div>;

  const cfg: ReportCardConfig = rc.config ?? DEFAULT_CFG;

  // ── Early Years mode ──────────────────────────────────────────────────────
  if (rc.mode === "early_years") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 print:p-0 print:max-w-none">
        {/* Toolbar — hidden on print */}
        <div className="mb-6 flex items-center justify-between print:hidden">
          <h1 className="font-display text-h2 font-semibold text-ink-1000 dark:text-ink-100">
            Report Card
          </h1>
          <div className="flex items-center gap-3">
            {dlErr && <span className="text-small text-error">{dlErr}</span>}
            <Button variant="outline" onClick={handleDownload} disabled={downloading}>
              {downloading ? "Downloading…" : "Download PDF"}
            </Button>
            <Button onClick={() => window.print()}>Print</Button>
          </div>
        </div>
        <div id="report-card-printable" className="print-a4-wrapper">
          <EarlyYearsLayout rc={rc} cfg={cfg} />
        </div>
      </div>
    );
  }

  // ── Standard mode ─────────────────────────────────────────────────────────
  const layout = cfg.layout ?? "classic";

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 print:p-0 print:max-w-none">
      {/* Toolbar — hidden on print */}
      <div className="mb-6 flex items-center justify-between print:hidden">
        <h1 className="font-display text-h2 font-semibold text-ink-1000 dark:text-ink-100">
          Report Card
        </h1>
        <div className="flex items-center gap-3">
          {dlErr && <span className="text-small text-error">{dlErr}</span>}
          <Button variant="outline" onClick={handleDownload} disabled={downloading}>
            {downloading ? "Downloading…" : "Download PDF"}
          </Button>
          <Button onClick={() => window.print()}>Print</Button>
        </div>
      </div>

      {/* The printable card */}
      <ResultReveal
        data={{
          student: rc.student,
          average: rc.average,
          position: rc.position,
          classSize: rc.classSize,
          gradeKey: rc.gradeKey,
        }}
      >
        <div id="report-card-printable" className="print-a4-wrapper">
          {layout === "modern" ? (
            <ModernLayout rc={rc} qr={qr} cfg={cfg} />
          ) : layout === "compact" ? (
            <CompactLayout rc={rc} qr={qr} cfg={cfg} />
          ) : (
            <ClassicLayout rc={rc} qr={qr} cfg={cfg} />
          )}
        </div>
      </ResultReveal>
    </div>
  );
}
