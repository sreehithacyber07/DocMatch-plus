/** Joins class names, dropping empty values. */
export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

/** Joins the ids of the elements that describe a control, or undefined when none apply. */
export function describedBy(...ids: Array<string | false | null | undefined>): string | undefined {
  const joined = ids.filter(Boolean).join(' ');
  return joined || undefined;
}
