import { formatDateTime, formatRelative } from "@/lib/office/format";

/** One timestamp, shown either relatively or in full, as the founder chose. */
export function WorkspaceTime({ value, relative }: { value: string; relative: boolean }) {
  return <time dateTime={value}>{relative ? formatRelative(value) : formatDateTime(value)}</time>;
}
