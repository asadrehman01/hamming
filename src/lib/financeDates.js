export const toMonthStartDateString = (value) => {
  if (!value) return null;

  const raw = String(value).trim();
  if (!raw) return null;

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const yearNum = Number(year);
    const monthNum = Number(month);
    const dayNum = Number(day);

    if (
      Number.isFinite(yearNum) &&
      Number.isFinite(monthNum) &&
      Number.isFinite(dayNum) &&
      monthNum >= 1 &&
      monthNum <= 12 &&
      dayNum >= 1 &&
      dayNum <= 31
    ) {
      const utcDate = new Date(Date.UTC(yearNum, monthNum - 1, dayNum));
      if (
        utcDate.getUTCFullYear() === yearNum &&
        utcDate.getUTCMonth() === monthNum - 1 &&
        utcDate.getUTCDate() === dayNum
      ) {
        return `${year}-${String(monthNum).padStart(2, "0")}-01`;
      }
    }
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;

  // Treat non-ISO inputs as local-time dates to avoid UTC rollover shifts.
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  return `${parsed.getFullYear()}-${month}-01`;
};