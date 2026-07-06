/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StatementLine {
  name: string;
  amountKobo: number;
}

interface StatementDiscount {
  name: string;
  amountKobo: number;
}

interface StatementInstallment {
  order: number;
  label: string | null;
  amountKobo: number;
  dueDate: Date | string;
  paidKobo: number;
  status: string;
}

interface StatementPayment {
  paidAt: Date | string | null;
  amountKobo: number;
  channel: string;
  reference: string;
  receiptCode: string | null;
}

export interface StatementInvoice {
  invoiceId: string;
  termLabel: string;
  lines: StatementLine[];
  discounts: StatementDiscount[];
  installments: StatementInstallment[];
  payments: StatementPayment[];
  grossKobo: number;
  discountKobo: number;
  totalKobo: number;
  paidKobo: number;
  balanceKobo: number;
  status?: string;
}

export interface StatementData {
  school: { name: string };
  student: { name: string; admissionNo: string };
  invoices: StatementInvoice[];
  overall: { totalKobo: number; paidKobo: number; balanceKobo: number };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEAL = "#066666";
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
  headerText: { flex: 1 },
  schoolName: { fontSize: 14, fontFamily: "Helvetica-Bold", color: TEAL, marginBottom: 2 },
  reportTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", color: TEAL, marginTop: 3 },

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

  invoiceSection: {
    marginBottom: 14,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 3,
    padding: 8,
  },
  invoiceTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  invoiceTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", color: TEAL },
  invoiceStatus: { fontSize: 8, fontFamily: "Helvetica-Bold", color: TEAL },

  sectionLabel: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: WHITE,
    backgroundColor: TEAL,
    paddingHorizontal: 5,
    paddingVertical: 2,
    marginBottom: 3,
    marginTop: 6,
    borderRadius: 2,
  },

  table: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 2,
    overflow: "hidden",
  },
  tableHeader: { flexDirection: "row", backgroundColor: TEAL },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: BORDER },
  tableRowAlt: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: BORDER, backgroundColor: LIGHT_GRAY },
  tableRowLast: { flexDirection: "row" },
  thCell: { paddingVertical: 4, paddingHorizontal: 5, fontSize: 7, fontFamily: "Helvetica-Bold", color: WHITE },
  tdCell: { paddingVertical: 3, paddingHorizontal: 5, fontSize: 8 },
  colName: { flex: 3 },
  colAmount: { flex: 1, textAlign: "right" },
  colDue: { flex: 1.5, textAlign: "center" },
  colStatus: { flex: 1, textAlign: "center" },

  summaryRow: {
    flexDirection: "row",
    backgroundColor: "#e8f4f4",
    padding: 5,
    borderTopWidth: 1.5,
    borderTopColor: TEAL,
    marginTop: 6,
  },
  summaryCell: { flex: 1, alignItems: "center" },
  summaryLabel: { fontSize: 6.5, color: GRAY, textTransform: "uppercase", marginBottom: 1 },
  summaryValue: { fontSize: 9, fontFamily: "Helvetica-Bold", color: TEAL },

  overallBox: {
    marginTop: 8,
    borderWidth: 1.5,
    borderColor: TEAL,
    borderRadius: 3,
    padding: 10,
    flexDirection: "row",
    backgroundColor: "#e8f4f4",
  },
  overallCell: { flex: 1, alignItems: "center" },
  overallLabel: { fontSize: 7, color: GRAY, textTransform: "uppercase", marginBottom: 2 },
  overallValue: { fontSize: 12, fontFamily: "Helvetica-Bold", color: TEAL },

  emptyText: { fontSize: 8, color: GRAY, fontStyle: "italic", paddingVertical: 4 },

  footer: {
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
  },
  footerText: { fontSize: 7, color: GRAY },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(d: Date | string | null): string {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
}

const AnyView = View as any;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LinesTable({ lines }: { lines: StatementLine[] }) {
  if (lines.length === 0) return null;
  return (
    <>
      <Text style={styles.sectionLabel}>FEE LINES</Text>
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <View style={[styles.thCell, styles.colName] as any}>
            <Text>Item</Text>
          </View>
          <View style={[styles.thCell, styles.colAmount] as any}>
            <Text>Amount</Text>
          </View>
        </View>
        {lines.map((line, i) => {
          const isLast = i === lines.length - 1;
          const isAlt = i % 2 === 1;
          const rowStyle = isLast ? styles.tableRowLast : isAlt ? styles.tableRowAlt : styles.tableRow;
          return (
            <AnyView key={`${line.name}-${i}`} style={rowStyle}>
              <Text style={[styles.tdCell, styles.colName] as any}>{line.name}</Text>
              <Text style={[styles.tdCell, styles.colAmount] as any}>{formatNaira(line.amountKobo)}</Text>
            </AnyView>
          );
        })}
      </View>
    </>
  );
}

function DiscountsTable({ discounts }: { discounts: StatementDiscount[] }) {
  if (discounts.length === 0) return null;
  return (
    <>
      <Text style={styles.sectionLabel}>DISCOUNTS</Text>
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <View style={[styles.thCell, styles.colName] as any}>
            <Text>Discount</Text>
          </View>
          <View style={[styles.thCell, styles.colAmount] as any}>
            <Text>Amount</Text>
          </View>
        </View>
        {discounts.map((d, i) => {
          const isLast = i === discounts.length - 1;
          const isAlt = i % 2 === 1;
          const rowStyle = isLast ? styles.tableRowLast : isAlt ? styles.tableRowAlt : styles.tableRow;
          return (
            <AnyView key={`${d.name}-${i}`} style={rowStyle}>
              <Text style={[styles.tdCell, styles.colName] as any}>{d.name}</Text>
              <Text style={[styles.tdCell, styles.colAmount] as any}>-{formatNaira(d.amountKobo)}</Text>
            </AnyView>
          );
        })}
      </View>
    </>
  );
}

function InstallmentsTable({ installments }: { installments: StatementInstallment[] }) {
  if (installments.length === 0) return null;
  return (
    <>
      <Text style={styles.sectionLabel}>INSTALLMENTS</Text>
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <View style={[styles.thCell, styles.colName] as any}>
            <Text>Installment</Text>
          </View>
          <View style={[styles.thCell, styles.colDue] as any}>
            <Text>Due</Text>
          </View>
          <View style={[styles.thCell, styles.colAmount] as any}>
            <Text>Amount</Text>
          </View>
          <View style={[styles.thCell, styles.colAmount] as any}>
            <Text>Paid</Text>
          </View>
          <View style={[styles.thCell, styles.colStatus] as any}>
            <Text>Status</Text>
          </View>
        </View>
        {installments.map((inst, i) => {
          const isLast = i === installments.length - 1;
          const isAlt = i % 2 === 1;
          const rowStyle = isLast ? styles.tableRowLast : isAlt ? styles.tableRowAlt : styles.tableRow;
          return (
            <AnyView key={`${inst.order}-${i}`} style={rowStyle}>
              <Text style={[styles.tdCell, styles.colName] as any}>{inst.label ?? `Installment ${inst.order + 1}`}</Text>
              <Text style={[styles.tdCell, styles.colDue] as any}>{formatDate(inst.dueDate)}</Text>
              <Text style={[styles.tdCell, styles.colAmount] as any}>{formatNaira(inst.amountKobo)}</Text>
              <Text style={[styles.tdCell, styles.colAmount] as any}>{formatNaira(inst.paidKobo)}</Text>
              <Text style={[styles.tdCell, styles.colStatus] as any}>{inst.status}</Text>
            </AnyView>
          );
        })}
      </View>
    </>
  );
}

function PaymentsTable({ payments }: { payments: StatementPayment[] }) {
  if (payments.length === 0) return null;
  return (
    <>
      <Text style={styles.sectionLabel}>PAYMENTS</Text>
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <View style={[styles.thCell, styles.colDue] as any}>
            <Text>Paid At</Text>
          </View>
          <View style={[styles.thCell, styles.colName] as any}>
            <Text>Reference / Receipt</Text>
          </View>
          <View style={[styles.thCell, styles.colStatus] as any}>
            <Text>Channel</Text>
          </View>
          <View style={[styles.thCell, styles.colAmount] as any}>
            <Text>Amount</Text>
          </View>
        </View>
        {payments.map((p, i) => {
          const isLast = i === payments.length - 1;
          const isAlt = i % 2 === 1;
          const rowStyle = isLast ? styles.tableRowLast : isAlt ? styles.tableRowAlt : styles.tableRow;
          return (
            <AnyView key={`${p.reference}-${i}`} style={rowStyle}>
              <Text style={[styles.tdCell, styles.colDue] as any}>{formatDate(p.paidAt)}</Text>
              <Text style={[styles.tdCell, styles.colName] as any}>{p.receiptCode ?? p.reference}</Text>
              <Text style={[styles.tdCell, styles.colStatus] as any}>{p.channel}</Text>
              <Text style={[styles.tdCell, styles.colAmount] as any}>{formatNaira(p.amountKobo)}</Text>
            </AnyView>
          );
        })}
      </View>
    </>
  );
}

function InvoiceSection({ invoice }: { invoice: StatementInvoice }) {
  return (
    <View style={styles.invoiceSection} wrap={false}>
      <View style={styles.invoiceTitleRow}>
        <Text style={styles.invoiceTitle}>{invoice.termLabel}</Text>
        {invoice.status ? <Text style={styles.invoiceStatus}>{invoice.status}</Text> : null}
      </View>

      <LinesTable lines={invoice.lines} />
      <DiscountsTable discounts={invoice.discounts} />
      <InstallmentsTable installments={invoice.installments} />
      <PaymentsTable payments={invoice.payments} />

      <View style={styles.summaryRow}>
        <View style={styles.summaryCell}>
          <Text style={styles.summaryLabel}>Total</Text>
          <Text style={styles.summaryValue}>{formatNaira(invoice.totalKobo)}</Text>
        </View>
        <View style={styles.summaryCell}>
          <Text style={styles.summaryLabel}>Paid</Text>
          <Text style={styles.summaryValue}>{formatNaira(invoice.paidKobo)}</Text>
        </View>
        <View style={styles.summaryCell}>
          <Text style={styles.summaryLabel}>Balance</Text>
          <Text style={styles.summaryValue}>{formatNaira(invoice.balanceKobo)}</Text>
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Document component
// ---------------------------------------------------------------------------

export function StatementPdf({ data }: { data: StatementData }) {
  const { school, student, invoices, overall } = data;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.schoolName}>{school.name}</Text>
            <Text style={styles.reportTitle}>FEE STATEMENT</Text>
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
        </View>

        {/* ── Per-term invoices ── */}
        {invoices.length === 0 ? (
          <Text style={styles.emptyText}>No invoices found for this student.</Text>
        ) : (
          invoices.map((invoice) => <InvoiceSection key={invoice.invoiceId} invoice={invoice} />)
        )}

        {/* ── Overall balance ── */}
        <View style={styles.overallBox}>
          <View style={styles.overallCell}>
            <Text style={styles.overallLabel}>Overall Total</Text>
            <Text style={styles.overallValue}>{formatNaira(overall.totalKobo)}</Text>
          </View>
          <View style={styles.overallCell}>
            <Text style={styles.overallLabel}>Overall Paid</Text>
            <Text style={styles.overallValue}>{formatNaira(overall.paidKobo)}</Text>
          </View>
          <View style={styles.overallCell}>
            <Text style={styles.overallLabel}>Overall Balance</Text>
            <Text style={styles.overallValue}>{formatNaira(overall.balanceKobo)}</Text>
          </View>
        </View>

        {/* ── Footer ── */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>{school.name}</Text>
          <Text style={styles.footerText}>Printed: {new Date().toLocaleDateString("en-GB")}</Text>
        </View>
      </Page>
    </Document>
  );
}

// ---------------------------------------------------------------------------
// Render helper — exported for controller + tests
// ---------------------------------------------------------------------------

export async function renderStatementPdf(data: StatementData): Promise<Buffer> {
  return renderToBuffer(<StatementPdf data={data} />);
}
