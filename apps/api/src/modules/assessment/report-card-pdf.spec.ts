import { renderReportCardPdf } from "./report-card-pdf";

const samplePayload = {
  school: {
    name: "Greenfield Academy",
    logoUrl: null,
    motto: "Excellence in Education",
    principalSignatureUrl: null,
  },
  student: { name: "Amina Yusuf", admissionNo: "GFA/2024/001" },
  className: "JSS 1A",
  term: { label: "2023/2024 · Term 1" },
  entries: [
    { subjectId: "sub-1", subjectName: "Mathematics", total: 85, grade: "A" },
    { subjectId: "sub-2", subjectName: "English Language", total: 78, grade: "B" },
    { subjectId: "sub-3", subjectName: "Basic Science", total: 92, grade: "A+" },
  ],
  average: 85,
  position: 3,
  classSize: 30,
  releasedAt: "2024-03-15T10:00:00.000Z",
  gradeKey: [
    { grade: "A+", minScore: 90, remark: "Excellent" },
    { grade: "A", minScore: 80, remark: "Very Good" },
    { grade: "B", minScore: 70, remark: "Good" },
    { grade: "C", minScore: 60, remark: "Average" },
    { grade: "F", minScore: 0, remark: "Fail" },
  ],
  verificationCode: "GFA-ABC123",
  skills: [
    {
      domain: "Affective",
      items: [
        { name: "Punctuality", value: 4 },
        { name: "Neatness", value: 3 },
      ],
    },
    {
      domain: "Psychomotor",
      items: [
        { name: "Handwriting", value: 5 },
        { name: "Drawing", value: 3 },
      ],
    },
  ],
  scaleKey: [
    { value: 5, label: "Excellent" },
    { value: 4, label: "Very Good" },
    { value: 3, label: "Good" },
    { value: 2, label: "Fair" },
    { value: 1, label: "Poor" },
  ],
  remarks: {
    formTeacher: "Amina has shown great improvement this term.",
    principal: "Keep up the excellent work.",
  },
  attendance: { present: 55, absent: 5, total: 60 },
  config: {
    id: "cfg-1",
    schoolId: "school-1",
    showSkills: true,
    showAttendance: true,
    showRemarks: true,
    showSignature: false,
    layout: "classic",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

describe("renderReportCardPdf", () => {
  it("renders a non-empty PDF", async () => {
    const buf = await renderReportCardPdf(samplePayload);
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
    expect(buf.length).toBeGreaterThan(1000);
  });
});
