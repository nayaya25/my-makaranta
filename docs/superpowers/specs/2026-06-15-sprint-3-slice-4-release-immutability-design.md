# Sprint 3 · Slice 4 — Release Workflow & Immutability (Design)

- **Date:** 2026-06-15
- **Status:** Approved (brainstorming complete) — ready for implementation plan
- **Part of:** Sprint 3 (Assessment & Grading), slice 4. Builds on slices 1–3.
- **Builds on:** `apps/api/src/modules/assessment/` — `Score`, `computeSubjectResult`, `resolveGrade`, `SubjectAssignment`, review service, `Enrollment`.

## Goal

A principal releases a class's results for a term: the system freezes each student's
per-subject totals/grades and overall average + position-in-class into immutable
`ResultSheet` rows, and blocks all further score edits for that class+term. Frozen rows
are served on read (never recomputed). Post-release correction is deferred to slice 4.5.

## Scope (locked decisions)

1. **Release unit = per (class, term).** One `Release` per class+term; releasing computes
   position-in-class within that class. Classes release independently (staggered entry).
2. **Freeze, never recompute** (charter). `ResultSheet` (overall) + `ResultSheetEntry`
   (per subject) written once at release; read endpoints serve them verbatim.
3. **Position = standard competition ranking** (1,2,2,4): `position = 1 + count(strictly
   higher average)`, within the class+term.
4. **Hard immutability.** Post-release score writes → 409. The proprietor-signed
   correction (unlock/edit/re-freeze/audit) is **slice 4.5**, not here.
5. **Permission `results.release`** (seeded). Read endpoints same permission.

### Non-goals
- Correction workflow (slice 4.5). Report-card PDF + public verification (slice 5).
  Reveal animation (slice 6). Weighted scoring. Cross-term trends.

## Architecture

Extends `apps/api/src/modules/assessment/`. Three tenant-scoped models + a pure
`computePositions` helper + a release service/controller. `ScoresService` gains an
immutability check. Web adds a `/release` dashboard + api client.

### Data model (tenant-scoped: TENANT_MODELS + RLS FORCE + migration)
- **`Release`** `id, schoolId, classId, termId, releasedBy (String), releasedAt (DateTime @default(now()))`; relations to Class, Term, School; `@@unique([classId, termId])`.
- **`ResultSheet`** `id, schoolId, releaseId (→Release), studentId, classId, termId, average (Int), position (Int)`; relations; `@@unique([studentId, termId])`; `@@index([schoolId, classId, termId])`.
- **`ResultSheetEntry`** `id, resultSheetId (→ResultSheet, onDelete Cascade), subjectId, total (Int), grade (String)`; `@@unique([resultSheetId, subjectId])`.
- Back-relations on School/Class/Term/Student/Subject as needed; add `"Release"`,
  `"ResultSheet"`, `"ResultSheetEntry"` to `TENANT_MODELS` (ResultSheetEntry carries no
  schoolId — it's child of ResultSheet; scope it via the parent, like attendance/enrollment
  pattern, OR add schoolId for directness — **add `schoolId` to ResultSheetEntry** for
  consistent explicit scoping).

### Pure helper — `position.util.ts`
`computePositions(students: { studentId: string; average: number }[]) → Map<string, number>`
- Standard competition ranking: `position = 1 + (# of students with strictly greater average)`.
- Empty input → empty map. Unit-tested (ranking, ties, empty).

### Release flow — `release.service.ts` (`results.release`, explicit scoping, IDOR)
`release(classId, termId, releasedBy)`:
1. Validate class + term are this tenant's (`findFirst({where:{id, schoolId}})`) → 404.
2. Reject if `Release` already exists for (classId, termId) → 409 (ConflictException).
3. Subjects the class offers (slice-1 `SubjectAssignment(classId, year-of-term)`);
   enrolled students (`Enrollment(classId, termId)`); their `Score`s.
4. Per (student, subject): `computeSubjectResult` → total + grade. Per student: `average`
   = round(mean of offered-subject totals that have scores). `computePositions` → position.
5. One `$transaction`: create `Release`; for each student create `ResultSheet` + its
   `ResultSheetEntry` rows. Explicit `schoolId` on all creates. (Auto-audit middleware
   logs each create.)
6. Return `{ released: studentCount, classId, termId }`.

### Immutability — `ScoresService.saveScores`
After `assertContext`, before upserting: if `release.findFirst({where:{classId, termId,
schoolId}})` exists → `ConflictException` "Results released for this class/term;
correction required." (Blocks every post-release write.)

### Read endpoints (`results.release`)
- `GET /v1/assessment/release/status?termId=` → the term's classes each
  `{ classId, name, released: boolean, releasedAt: string|null }`.
- `GET /v1/assessment/release/sheet?classId=&termId=` → if released:
  `{ releasedAt, students: [{ studentId, name, average, position,
  entries: [{ subjectId, subjectName, total, grade }] }] }` (ordered by position); else 404.

## Web — `/release` (`results.release`)
New `Release` sidebar item. Principal picks **Term** → table of the term's classes with
**status** (Released w/ date · or Not released) + a **Release** button per unreleased
class (confirm dialog). On release → status flips + the frozen sheet renders (students
ranked by position, per-subject totals/grades, average). A link to `/review` for
pre-release review. api client: `getReleaseStatus(termId)`, `releaseClass(classId,
termId)`, `getReleasedSheet(classId, termId)`. Empty/loading states.

## Validation & errors
- Foreign class/term → 404 (explicit scoping; Enrollment gated by class check).
- Re-release → 409; post-release score edit → 409 (surfaced in the gradebook).
- Release with no enrolled students → `Release` created, 0 `ResultSheet`s (no crash).
- No assessment types/boundaries configured → totals 0 / null grades (still freezes; the
  principal reviews first via slice-3 sheets).

## Testing
- **`computePositions` unit:** ranking; ties (1,2,2,4); empty.
- **API e2e** (extend `assessment.e2e-spec.ts`): release freezes `Release` + `ResultSheet`
  (correct averages + positions incl. a tie) + `ResultSheetEntry`; **re-release → 409**;
  **immutability** (`saveScores` after release → 409); `status` reflects released;
  `sheet` returns frozen rows ordered by position; **cross-tenant** (B releases/reads A's
  class → 404); explicit scoping.
- **Web** (vitest): light.
- **Browser QA:** enter scores (a tie) → release a class → positions frozen + ranked,
  averages correct, tie shares position; attempt a score edit in `/gradebook` → 409
  surfaced; status shows released; second release attempt blocked.

## Dependencies
- Slices 1–3, `Enrollment`, `results.release` permission (seeded), tenancy stack,
  AuditLog (auto-middleware). No new npm deps.

## Out-of-scope future
- **Slice 4.5:** proprietor-signed correction (unlock a `Release`/result, edit, re-freeze,
  before/after audit).
- Slice 5: report-card PDF (consumes `getReleasedSheet`) + public verification.
