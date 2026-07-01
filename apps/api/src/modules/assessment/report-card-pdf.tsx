/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReportCardEntry {
  subjectId: string;
  subjectName: string;
  total: number | null;
  grade: string | null;
}

interface SkillItem {
  name: string;
  value: number | null;
}

interface SkillDomain {
  domain: string;
  items: SkillItem[];
}

interface ScalePoint {
  value: number;
  label: string;
}

interface GradeKey {
  grade: string;
  minScore: number;
  remark: string | null;
}

interface ReportCardConfig {
  showSkills: boolean;
  showAttendance: boolean;
  showRemarks: boolean;
  showGradingKey?: boolean;
  showPosition?: boolean;
  layout: string;
  [key: string]: unknown;
}

// Early-Years payload shape (produced by T5)
export interface EarlyYearsReportCardPayload {
  mode: "early_years";
  student: { name: string; admissionNo: string };
  class: { name: string };
  term: { label: string };
  school: {
    name: string;
    logoUrl: string | null | undefined;
    motto: string | null;
    principalSignatureUrl: string | null | undefined;
  };
  areas: {
    area: string;
    items: { name: string; rating: { value: number; label: string } | null }[];
  }[];
  scaleKey: ScalePoint[];
  narrative: { formTeacher: string | null; principal: string | null };
  attendance: { present: number; absent: number; total: number };
}

export interface StandardReportCardPayload {
  mode?: "standard";
  school: {
    name: string;
    logoUrl: string | null | undefined;
    motto: string | null;
    principalSignatureUrl: string | null | undefined;
  };
  student: { name: string; admissionNo: string };
  className: string;
  term: { label: string };
  entries: ReportCardEntry[];
  average: number | null;
  position: number | null;
  classSize: number;
  releasedAt: string;
  gradeKey: GradeKey[];
  verificationCode: string;
  skills: SkillDomain[];
  scaleKey: ScalePoint[];
  remarks: { formTeacher: string | null; principal: string | null };
  attendance: { present: number; absent: number; total: number };
  config: ReportCardConfig;
  subjectGroups: { category: string | null; subjects: ReportCardEntry[] }[];
}

// Union type — renderReportCardPdf accepts either
export type ReportCardPayload = StandardReportCardPayload | EarlyYearsReportCardPayload;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEAL = "#066666";
const LIME = "#B3CC18";
const BLACK = "#111111";
const GRAY = "#555555";
const LIGHT_GRAY = "#f2f2f2";
const WHITE = "#ffffff";
const BORDER = "#dddddd";

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: BLACK,
    paddingTop: 28,
    paddingBottom: 32,
    paddingHorizontal: 32,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: TEAL,
    paddingBottom: 8,
  },
  logo: { width: 52, height: 52, marginRight: 12 },
  headerText: { flex: 1 },
  schoolName: { fontSize: 14, fontFamily: "Helvetica-Bold", color: TEAL, marginBottom: 2 },
  motto: { fontSize: 8, color: GRAY, fontStyle: "italic" },
  reportTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", color: TEAL, marginTop: 3 },
  headerRight: { alignItems: "flex-end" },
  headerRightLabel: { fontSize: 8, color: GRAY },
  headerRightValue: { fontSize: 9, fontFamily: "Helvetica-Bold", color: TEAL },

  infoBar: {
    flexDirection: "row",
    backgroundColor: LIGHT_GRAY,
    borderRadius: 3,
    padding: 7,
    marginBottom: 10,
    flexWrap: "wrap",
  },
  infoCell: { marginRight: 20, marginBottom: 2 },
  infoCellLabel: { fontSize: 7, color: GRAY, textTransform: "uppercase", marginBottom: 1 },
  infoCellValue: { fontSize: 9, fontFamily: "Helvetica-Bold" },

  sectionLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: WHITE,
    backgroundColor: TEAL,
    paddingHorizontal: 6,
    paddingVertical: 3,
    marginBottom: 4,
    borderRadius: 2,
  },
  sectionLabelMt: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: WHITE,
    backgroundColor: TEAL,
    paddingHorizontal: 6,
    paddingVertical: 3,
    marginBottom: 4,
    marginTop: 10,
    borderRadius: 2,
  },

  table: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 2,
    marginBottom: 0,
    overflow: "hidden",
  },
  tableHeader: { flexDirection: "row", backgroundColor: TEAL },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  tableRowAlt: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    backgroundColor: LIGHT_GRAY,
  },
  tableRowLast: { flexDirection: "row" },
  thCell: { paddingVertical: 5, paddingHorizontal: 6, fontSize: 8, fontFamily: "Helvetica-Bold", color: WHITE },
  tdCell: { paddingVertical: 4, paddingHorizontal: 6, fontSize: 9 },
  colSubject: { flex: 3 },
  colScore: { flex: 1, textAlign: "center" },
  colGrade: { flex: 1, textAlign: "center" },
  tdGrade: { paddingVertical: 4, paddingHorizontal: 6, fontSize: 9, flex: 1, textAlign: "center", color: TEAL, fontFamily: "Helvetica-Bold" },

  summaryRow: {
    flexDirection: "row",
    backgroundColor: "#e8f4f4",
    padding: 6,
    borderTopWidth: 1.5,
    borderTopColor: TEAL,
    marginBottom: 0,
  },
  summaryCell: { flex: 1, alignItems: "center" },
  summaryLabel: { fontSize: 7, color: GRAY, textTransform: "uppercase", marginBottom: 1 },
  summaryValue: { fontSize: 10, fontFamily: "Helvetica-Bold", color: TEAL },

  twoCol: { flexDirection: "row", marginBottom: 10, marginTop: 0 },
  col: { flex: 1 },
  colRight: { flex: 1, paddingLeft: 8 },

  skillsTable: { borderWidth: 1, borderColor: BORDER, borderRadius: 2, overflow: "hidden", marginRight: 8 },
  skillsHeader: { flexDirection: "row", backgroundColor: TEAL, paddingVertical: 4, paddingHorizontal: 6 },
  skillsHeaderText: { fontSize: 8, fontFamily: "Helvetica-Bold", color: WHITE },
  skillDomainRow: { flexDirection: "row", backgroundColor: "#e8f4f4", paddingVertical: 3, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: BORDER },
  skillDomainLabel: { fontSize: 8, fontFamily: "Helvetica-Bold", color: TEAL },
  skillRow: { flexDirection: "row", paddingVertical: 3, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: BORDER },
  skillRowLast: { flexDirection: "row", paddingVertical: 3, paddingHorizontal: 6 },
  skillName: { flex: 3, fontSize: 8, color: BLACK },
  skillValue: { flex: 1, fontSize: 8, textAlign: "center", color: TEAL, fontFamily: "Helvetica-Bold" },

  scaleKeyTitle: { fontSize: 8, fontFamily: "Helvetica-Bold", marginBottom: 4, color: TEAL },
  scaleKeyEntry: { flexDirection: "row", marginBottom: 2, alignItems: "center" },
  scaleKeyValue: { fontSize: 7, fontFamily: "Helvetica-Bold", color: TEAL, marginRight: 3 },
  scaleKeyLabel: { fontSize: 7, color: GRAY },

  gradeKeyTitle: { fontSize: 8, fontFamily: "Helvetica-Bold", marginTop: 8, marginBottom: 4, color: TEAL },
  gradeKeyEntry: { flexDirection: "row", marginBottom: 2, alignItems: "center" },
  gradeKeyGrade: { fontSize: 7, fontFamily: "Helvetica-Bold", color: TEAL, marginRight: 3, minWidth: 16 },
  gradeKeyDesc: { fontSize: 7, color: GRAY },
  gradeKeyRow: { flexDirection: "row", flexWrap: "wrap" },

  attendanceBox: { borderWidth: 1, borderColor: BORDER, borderRadius: 2, overflow: "hidden", marginBottom: 10 },
  attendanceRow: { flexDirection: "row" },
  attendanceCell: { flex: 1, alignItems: "center", paddingVertical: 6, borderRightWidth: 1, borderRightColor: BORDER },
  attendanceCellLast: { flex: 1, alignItems: "center", paddingVertical: 6 },
  attendanceCellLabel: { fontSize: 7, color: GRAY, textTransform: "uppercase", marginBottom: 1 },
  attendanceCellValue: { fontSize: 11, fontFamily: "Helvetica-Bold", color: TEAL },

  remarksBox: { borderWidth: 1, borderColor: BORDER, borderRadius: 2, overflow: "hidden", marginBottom: 10 },
  remarkEntry: { paddingHorizontal: 8, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: BORDER },
  remarkEntryLast: { paddingHorizontal: 8, paddingVertical: 5 },
  remarkLabel: { fontSize: 7, color: GRAY, textTransform: "uppercase", marginBottom: 2 },
  remarkText: { fontSize: 9, color: BLACK, fontStyle: "italic" },

  signatureSection: { marginBottom: 10, alignItems: "flex-end" },
  signatureImage: { width: 100, height: 40, marginBottom: 2 },
  signatureLabel: { fontSize: 7, color: GRAY, textTransform: "uppercase" },

  footer: {
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  footerText: { fontSize: 7, color: GRAY },
  verificationCode: { fontSize: 7, color: TEAL, fontFamily: "Helvetica-Bold" },
  footerMid: { alignItems: "center" },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ordinal(n: number): string {
  const s: string[] = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0] ?? "th");
}

// Wrap components to avoid key-prop TS conflict with react-pdf types
const AnyView = View as any;
const AnyText = Text as any;
const AnyImage = Image as any;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SubjectsTable({ entries }: { entries: ReportCardEntry[] }) {
  return (
    <View style={styles.table}>
      <View style={styles.tableHeader}>
        <View style={[styles.thCell, styles.colSubject] as any}>
          <Text>Subject</Text>
        </View>
        <View style={[styles.thCell, styles.colScore] as any}>
          <Text>Score</Text>
        </View>
        <View style={[styles.thCell, styles.colGrade] as any}>
          <Text>Grade</Text>
        </View>
      </View>
      {entries.map((entry, i) => {
        const isLast = i === entries.length - 1;
        const isAlt = i % 2 === 1;
        const rowStyle = isLast ? styles.tableRowLast : isAlt ? styles.tableRowAlt : styles.tableRow;
        return (
          <AnyView key={entry.subjectId} style={rowStyle}>
            <Text style={[styles.tdCell, styles.colSubject] as any}>{entry.subjectName}</Text>
            <Text style={[styles.tdCell, styles.colScore] as any}>{entry.total !== null ? entry.total : "-"}</Text>
            <Text style={styles.tdGrade}>{entry.grade ?? "-"}</Text>
          </AnyView>
        );
      })}
    </View>
  );
}

function SkillsSection({ skills, scaleKey, gradeKey }: { skills: SkillDomain[]; scaleKey: ScalePoint[]; gradeKey: GradeKey[] }) {
  return (
    <View style={styles.twoCol}>
      <View style={styles.skillsTable}>
        <View style={styles.skillsHeader}>
          <Text style={[styles.skillsHeaderText, { flex: 3 }] as any}>Skill</Text>
          <Text style={[styles.skillsHeaderText, { flex: 1, textAlign: "center" }] as any}>Rating</Text>
        </View>
        {skills.map((domain) => (
          <React.Fragment key={domain.domain}>
            <View style={styles.skillDomainRow}>
              <Text style={styles.skillDomainLabel}>{domain.domain}</Text>
            </View>
            {domain.items.map((item, idx) => {
              const isLast = idx === domain.items.length - 1;
              return (
                <AnyView key={item.name} style={isLast ? styles.skillRowLast : styles.skillRow}>
                  <Text style={styles.skillName}>{item.name}</Text>
                  <Text style={styles.skillValue}>{item.value !== null ? item.value : "–"}</Text>
                </AnyView>
              );
            })}
          </React.Fragment>
        ))}
      </View>
      <View style={styles.colRight}>
        <Text style={styles.scaleKeyTitle}>Scale Key</Text>
        {scaleKey.map((sp) => (
          <AnyView key={sp.value} style={styles.scaleKeyEntry}>
            <Text style={styles.scaleKeyValue}>{sp.value}</Text>
            <Text style={styles.scaleKeyLabel}>– {sp.label}</Text>
          </AnyView>
        ))}
        {gradeKey.length > 0 ? (
          <>
            <Text style={styles.gradeKeyTitle}>Grade Key</Text>
            {gradeKey.map((g) => (
              <AnyView key={g.grade} style={styles.gradeKeyEntry}>
                <Text style={styles.gradeKeyGrade}>{g.grade}:</Text>
                <Text style={styles.gradeKeyDesc}>
                  {g.minScore}+ {g.remark ? `(${g.remark})` : ""}
                </Text>
              </AnyView>
            ))}
          </>
        ) : null}
      </View>
    </View>
  );
}

function GradeKeyOnly({ gradeKey }: { gradeKey: GradeKey[] }) {
  return (
    <View style={styles.gradeKeyRow}>
      {gradeKey.map((g) => (
        <AnyView key={g.grade} style={[styles.gradeKeyEntry, { marginRight: 10 }]}>
          <Text style={styles.gradeKeyGrade}>{g.grade}:</Text>
          <Text style={styles.gradeKeyDesc}>
            {g.minScore}+ {g.remark ? `(${g.remark})` : ""}
          </Text>
        </AnyView>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Early-Years document component
// ---------------------------------------------------------------------------

function EarlyYearsReportCardPdf({ payload }: { payload: EarlyYearsReportCardPayload }) {
  const { school, student, class: cls, term, areas, scaleKey, narrative, attendance } = payload;

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* ── Header ── */}
        <View style={styles.header}>
          {school.logoUrl ? <Image src={school.logoUrl} style={styles.logo} /> : null}
          <View style={styles.headerText}>
            <Text style={styles.schoolName}>{school.name}</Text>
            {school.motto ? <Text style={styles.motto}>{school.motto}</Text> : null}
            <Text style={styles.reportTitle}>EARLY YEARS DEVELOPMENTAL REPORT</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.headerRightLabel}>Term</Text>
            <Text style={styles.headerRightValue}>{term.label}</Text>
          </View>
        </View>

        {/* ── Student Info Bar ── */}
        <View style={styles.infoBar}>
          <View style={styles.infoCell}>
            <Text style={styles.infoCellLabel}>Student</Text>
            <Text style={styles.infoCellValue}>{student.name}</Text>
          </View>
          <View style={styles.infoCell}>
            <Text style={styles.infoCellLabel}>Admission No.</Text>
            <Text style={styles.infoCellValue}>{student.admissionNo}</Text>
          </View>
          <View style={styles.infoCell}>
            <Text style={styles.infoCellLabel}>Class</Text>
            <Text style={styles.infoCellValue}>{cls.name}</Text>
          </View>
        </View>

        {/* ── Developmental Areas ── */}
        <Text style={styles.sectionLabel}>DEVELOPMENTAL AREAS</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <View style={[styles.thCell, { flex: 3 }] as any}>
              <Text>Area / Item</Text>
            </View>
            <View style={[styles.thCell, { flex: 2, textAlign: "center" }] as any}>
              <Text>Rating</Text>
            </View>
          </View>
          {areas.map((areaBlock) => (
            <React.Fragment key={areaBlock.area}>
              {/* Area header row */}
              <View style={styles.skillDomainRow}>
                <Text style={[styles.skillDomainLabel, { flex: 3 }] as any}>{areaBlock.area}</Text>
                <Text style={[styles.skillDomainLabel, { flex: 2 }] as any}></Text>
              </View>
              {/* Item rows */}
              {areaBlock.items.map((item, idx) => {
                const isLast = idx === areaBlock.items.length - 1;
                return (
                  <AnyView key={item.name} style={isLast ? styles.skillRowLast : styles.skillRow}>
                    <Text style={[styles.skillName, { flex: 3 }] as any}>{item.name}</Text>
                    <Text style={[styles.skillValue, { flex: 2 }] as any}>
                      {item.rating ? item.rating.label : "—"}
                    </Text>
                  </AnyView>
                );
              })}
            </React.Fragment>
          ))}
        </View>

        {/* ── Scale Key ── */}
        <Text style={styles.sectionLabelMt}>SCALE KEY</Text>
        <View style={styles.twoCol}>
          <View style={styles.col}>
            {scaleKey.map((sp) => (
              <AnyView key={sp.value} style={styles.scaleKeyEntry}>
                <Text style={styles.scaleKeyValue}>{sp.value}</Text>
                <Text style={styles.scaleKeyLabel}>– {sp.label}</Text>
              </AnyView>
            ))}
          </View>
        </View>

        {/* ── Attendance ── */}
        <Text style={styles.sectionLabelMt}>ATTENDANCE</Text>
        <View style={styles.attendanceBox}>
          <View style={styles.attendanceRow}>
            <View style={styles.attendanceCell}>
              <Text style={styles.attendanceCellLabel}>Days Present</Text>
              <Text style={styles.attendanceCellValue}>{attendance.present}</Text>
            </View>
            <View style={styles.attendanceCell}>
              <Text style={styles.attendanceCellLabel}>Days Absent</Text>
              <Text style={styles.attendanceCellValue}>{attendance.absent}</Text>
            </View>
            <View style={styles.attendanceCellLast}>
              <Text style={styles.attendanceCellLabel}>Total Days</Text>
              <Text style={styles.attendanceCellValue}>{attendance.total}</Text>
            </View>
          </View>
        </View>

        {/* ── Narrative ── */}
        {(narrative.formTeacher || narrative.principal) ? (
          <>
            <Text style={styles.sectionLabelMt}>TEACHER NARRATIVE</Text>
            <View style={styles.remarksBox}>
              {narrative.formTeacher ? (
                <View style={narrative.principal ? styles.remarkEntry : styles.remarkEntryLast}>
                  <Text style={styles.remarkLabel}>Form Teacher</Text>
                  <Text style={styles.remarkText}>{narrative.formTeacher}</Text>
                </View>
              ) : null}
              {narrative.principal ? (
                <View style={styles.remarkEntryLast}>
                  <Text style={styles.remarkLabel}>Principal</Text>
                  <Text style={styles.remarkText}>{narrative.principal}</Text>
                </View>
              ) : null}
            </View>
          </>
        ) : null}

        {/* ── Principal Signature ── */}
        {school.principalSignatureUrl ? (
          <View style={styles.signatureSection}>
            <Image src={school.principalSignatureUrl} style={styles.signatureImage} />
            <Text style={styles.signatureLabel}>Principal's Signature</Text>
          </View>
        ) : null}

        {/* ── Footer ── */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {school.name} · {term.label}
          </Text>
          <View style={styles.footerMid}>
            <Text style={styles.footerText}>Early Years Developmental Report</Text>
          </View>
          <Text style={styles.footerText}>
            Printed: {new Date().toLocaleDateString("en-GB")}
          </Text>
        </View>

      </Page>
    </Document>
  );
}

// ---------------------------------------------------------------------------
// Standard document component
// ---------------------------------------------------------------------------

export function ReportCardPdf({ payload }: { payload: StandardReportCardPayload }) {
  const {
    school,
    student,
    className,
    term,
    entries,
    average,
    position,
    classSize,
    gradeKey,
    verificationCode,
    skills,
    scaleKey,
    remarks,
    attendance,
    config,
  } = payload;

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* ── Header ── */}
        <View style={styles.header}>
          {school.logoUrl ? <Image src={school.logoUrl} style={styles.logo} /> : null}
          <View style={styles.headerText}>
            <Text style={styles.schoolName}>{school.name}</Text>
            {school.motto ? <Text style={styles.motto}>{school.motto}</Text> : null}
            <Text style={styles.reportTitle}>ACADEMIC REPORT CARD</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.headerRightLabel}>Term</Text>
            <Text style={styles.headerRightValue}>{term.label}</Text>
          </View>
        </View>

        {/* ── Student Info Bar ── */}
        <View style={styles.infoBar}>
          <View style={styles.infoCell}>
            <Text style={styles.infoCellLabel}>Student</Text>
            <Text style={styles.infoCellValue}>{student.name}</Text>
          </View>
          <View style={styles.infoCell}>
            <Text style={styles.infoCellLabel}>Admission No.</Text>
            <Text style={styles.infoCellValue}>{student.admissionNo}</Text>
          </View>
          <View style={styles.infoCell}>
            <Text style={styles.infoCellLabel}>Class</Text>
            <Text style={styles.infoCellValue}>{className}</Text>
          </View>
          <View style={styles.infoCell}>
            <Text style={styles.infoCellLabel}>Released</Text>
            <Text style={styles.infoCellValue}>{payload.releasedAt.slice(0, 10)}</Text>
          </View>
        </View>

        {/* ── Subjects Table ── */}
        <Text style={styles.sectionLabel}>SUBJECTS &amp; SCORES</Text>
        <SubjectsTable entries={entries} />

        {/* ── Summary Row ── */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryCell}>
            <Text style={styles.summaryLabel}>Average</Text>
            <Text style={styles.summaryValue}>{average !== null ? average.toFixed(1) : "–"}</Text>
          </View>
          <View style={styles.summaryCell}>
            <Text style={styles.summaryLabel}>Position</Text>
            <Text style={styles.summaryValue}>{position !== null ? ordinal(position) : "–"}</Text>
          </View>
          <View style={styles.summaryCell}>
            <Text style={styles.summaryLabel}>Class Size</Text>
            <Text style={styles.summaryValue}>{classSize}</Text>
          </View>
        </View>

        {/* ── Skills or Grade Key ── */}
        {config.showSkills && skills.length > 0 ? (
          <>
            <Text style={styles.sectionLabelMt}>SKILLS ASSESSMENT</Text>
            <SkillsSection skills={skills} scaleKey={scaleKey} gradeKey={gradeKey} />
          </>
        ) : gradeKey.length > 0 ? (
          <>
            <Text style={styles.sectionLabelMt}>GRADE KEY</Text>
            <GradeKeyOnly gradeKey={gradeKey} />
          </>
        ) : null}

        {/* ── Attendance ── */}
        {config.showAttendance ? (
          <>
            <Text style={styles.sectionLabelMt}>ATTENDANCE</Text>
            <View style={styles.attendanceBox}>
              <View style={styles.attendanceRow}>
                <View style={styles.attendanceCell}>
                  <Text style={styles.attendanceCellLabel}>Days Present</Text>
                  <Text style={styles.attendanceCellValue}>{attendance.present}</Text>
                </View>
                <View style={styles.attendanceCell}>
                  <Text style={styles.attendanceCellLabel}>Days Absent</Text>
                  <Text style={styles.attendanceCellValue}>{attendance.absent}</Text>
                </View>
                <View style={styles.attendanceCellLast}>
                  <Text style={styles.attendanceCellLabel}>Total Days</Text>
                  <Text style={styles.attendanceCellValue}>{attendance.total}</Text>
                </View>
              </View>
            </View>
          </>
        ) : null}

        {/* ── Remarks ── */}
        {config.showRemarks && (remarks.formTeacher || remarks.principal) ? (
          <>
            <Text style={styles.sectionLabelMt}>REMARKS</Text>
            <View style={styles.remarksBox}>
              {remarks.formTeacher ? (
                <View style={remarks.principal ? styles.remarkEntry : styles.remarkEntryLast}>
                  <Text style={styles.remarkLabel}>Form Teacher</Text>
                  <Text style={styles.remarkText}>{remarks.formTeacher}</Text>
                </View>
              ) : null}
              {remarks.principal ? (
                <View style={styles.remarkEntryLast}>
                  <Text style={styles.remarkLabel}>Principal</Text>
                  <Text style={styles.remarkText}>{remarks.principal}</Text>
                </View>
              ) : null}
            </View>
          </>
        ) : null}

        {/* ── Principal Signature ── */}
        {config.showRemarks && school.principalSignatureUrl ? (
          <View style={styles.signatureSection}>
            <Image src={school.principalSignatureUrl} style={styles.signatureImage} />
            <Text style={styles.signatureLabel}>Principal's Signature</Text>
          </View>
        ) : null}

        {/* ── Footer ── */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {school.name} · {term.label}
          </Text>
          <View style={styles.footerMid}>
            <Text style={styles.footerText}>Verification Code</Text>
            <Text style={styles.verificationCode}>{verificationCode}</Text>
          </View>
          <Text style={styles.footerText}>
            Printed: {new Date().toLocaleDateString("en-GB")}
          </Text>
        </View>

      </Page>
    </Document>
  );
}

// ---------------------------------------------------------------------------
// Render helper — exported for controller + tests
// ---------------------------------------------------------------------------

export async function renderReportCardPdf(payload: ReportCardPayload): Promise<Buffer> {
  if (payload.mode === "early_years") {
    return renderToBuffer(<EarlyYearsReportCardPdf payload={payload} />);
  }
  return renderToBuffer(<ReportCardPdf payload={payload} />);
}
