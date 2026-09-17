function formatInZone(date, timeZone) {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function isValidTimeZone(timeZone) {
  if (typeof timeZone !== "string" || !timeZone) return false;
  try {
    formatInZone(new Date(0), timeZone);
    return true;
  } catch {
    return false;
  }
}

/**
 * The {date} naming token: when the photo was taken (EXIF, already local to the
 * camera), otherwise when the file was created in Drive, in the process's time
 * zone. Falls back to today.
 */
export function fileDateString(file, timeZone = "UTC", now = new Date()) {
  const exif = file?.imageMediaMetadata?.time;
  const match = typeof exif === "string" ? /^(\d{4}):(\d{2}):(\d{2})/.exec(exif) : null;
  if (match && match[1] !== "0000" && match[2] !== "00" && match[3] !== "00") {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }

  const created = file?.createdTime ? new Date(file.createdTime) : now;
  const date = Number.isNaN(created.getTime()) ? now : created;
  return formatInZone(date, isValidTimeZone(timeZone) ? timeZone : "UTC");
}
