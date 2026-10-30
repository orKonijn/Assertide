/** One organization per deployment; invalid IANA zones fail startup. */
export function calendar(timeZone = "UTC") {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const day = (instant: string | number) => {
    const parts = formatter.formatToParts(new Date(instant));
    const value = (kind: string) =>
      parts.find((part) => part.type === kind)!.value;
    return `${value("year")}-${value("month")}-${value("day")}`;
  };
  // Find the first instant in a calendar date, including midnight offset changes.
  // Never assume that a civil day lasts 24 hours (DST can make it 23 or 25).
  const start = (date: string) => {
    const center = Date.parse(`${date}T00:00:00Z`);
    let low = center - 36 * 3600000,
      high = center + 36 * 3600000;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (day(middle) < date) low = middle + 1;
      else high = middle;
    }
    return new Date(low);
  };
  return { day, start, timeZone: formatter.resolvedOptions().timeZone };
}
export const organizationCalendar = calendar(
  process.env["ORGANIZATION_TIME_ZONE"] ?? "UTC",
);
