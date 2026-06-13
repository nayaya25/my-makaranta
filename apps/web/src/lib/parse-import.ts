"use client";

import type { ImportRow } from "./api";

const HEADER_MAP: Record<string, keyof ImportRow> = {
  // admissionNo
  admissionno: "admissionNo",
  "admission no": "admissionNo",
  "admission number": "admissionNo",
  admission_no: "admissionNo",
  admno: "admissionNo",
  // firstName
  firstname: "firstName",
  "first name": "firstName",
  first_name: "firstName",
  // middleName
  middlename: "middleName",
  "middle name": "middleName",
  middle_name: "middleName",
  // lastName
  lastname: "lastName",
  "last name": "lastName",
  last_name: "lastName",
  surname: "lastName",
  // gender
  gender: "gender",
  sex: "gender",
  // dateOfBirth
  dateofbirth: "dateOfBirth",
  "date of birth": "dateOfBirth",
  date_of_birth: "dateOfBirth",
  dob: "dateOfBirth",
  birthdate: "dateOfBirth",
  "birth date": "dateOfBirth",
  // stateOfOrigin
  stateoforigin: "stateOfOrigin",
  "state of origin": "stateOfOrigin",
  state_of_origin: "stateOfOrigin",
  state: "stateOfOrigin",
  // parentPhone
  parentphone: "parentPhone",
  "parent phone": "parentPhone",
  parent_phone: "parentPhone",
  "parent mobile": "parentPhone",
  parentmobile: "parentPhone",
  // parentFirstName
  parentfirstname: "parentFirstName",
  "parent first name": "parentFirstName",
  parent_first_name: "parentFirstName",
  // parentLastName
  parentlastname: "parentLastName",
  "parent last name": "parentLastName",
  parent_last_name: "parentLastName",
  // guardianRelationship
  guardianrelationship: "guardianRelationship",
  "guardian relationship": "guardianRelationship",
  guardian_relationship: "guardianRelationship",
  relationship: "guardianRelationship",
  guardiantype: "guardianRelationship",
};

function normalizeKey(raw: string): keyof ImportRow | null {
  const key = raw.trim().toLowerCase();
  return HEADER_MAP[key] ?? null;
}

function mapRecord(raw: Record<string, string>): ImportRow {
  const row: Partial<ImportRow> = {};
  for (const [header, value] of Object.entries(raw)) {
    const field = normalizeKey(header);
    if (field && value !== undefined) {
      (row as Record<string, string>)[field] = value.trim();
    }
  }
  return row as ImportRow;
}

async function parseCsv(file: File): Promise<ImportRow[]> {
  const Papa = (await import("papaparse")).default;
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        resolve(results.data.map(mapRecord));
      },
      error: (err) => reject(new Error(err.message)),
    });
  });
}

async function parseXlsx(file: File): Promise<ImportRow[]> {
  const ExcelJS = (await import("exceljs")).default;
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("No worksheet found in file.");

  const rows: ImportRow[] = [];
  const headerMap = new Map<number, keyof ImportRow>();

  worksheet.eachRow((row, rowIndex) => {
    if (rowIndex === 1) {
      row.eachCell((cell, colIndex) => {
        const raw = String(cell.value ?? "").trim();
        const field = normalizeKey(raw);
        if (field) headerMap.set(colIndex, field);
      });
      return;
    }

    const record: Partial<ImportRow> = {};
    row.eachCell({ includeEmpty: false }, (cell, colIndex) => {
      const field = headerMap.get(colIndex);
      if (field) {
        const val = cell.value;
        const str = val instanceof Date
          ? val.toISOString().slice(0, 10)
          : String(val ?? "").trim();
        (record as Record<string, string>)[field] = str;
      }
    });

    if (Object.keys(record).length > 0) {
      rows.push(record as ImportRow);
    }
  });

  return rows;
}

export async function parseImportFile(file: File): Promise<ImportRow[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) return parseCsv(file);
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return parseXlsx(file);
  throw new Error(`Unsupported file type. Please upload a .csv or .xlsx file.`);
}
