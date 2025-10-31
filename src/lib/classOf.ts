export function currentAcademicYearStart(date = new Date(), rolloverMonth = 7 /* Juli */) {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  return (m >= rolloverMonth) ? y : (y - 1);
}

export function cohortToClass(
  cohortYear: number,
  date = new Date(),
  rolloverMonth = 7 // Juli
): 10|11|12|"alumni" {
  const ayStart = currentAcademicYearStart(date, rolloverMonth); // contoh 2025
  const diff = ayStart - cohortYear; // 0 -> kelas 10, 1 -> kelas 11, 2 -> kelas 12, >=3 alumni
  const k = 10 + diff;
  if (k < 10) return 10;
  if (k > 12) return "alumni";
  return k as 10|11|12;
}
