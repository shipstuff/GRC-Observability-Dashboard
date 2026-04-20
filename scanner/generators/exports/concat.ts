/**
 * CSV concatenation helper used by the dashboard's org-level export endpoints.
 * Lives in the scanner/generators/exports/ module so it sits next to the
 * emitters it operates on — and so it can be unit-tested independently of
 * the Cloudflare Worker runtime.
 */

/**
 * Split a CSV document into (header, body) at the first UNQUOTED newline.
 * RFC 4180 allows raw `\n` inside quoted fields — risk-register and
 * evidence columns commonly contain them. A naive `split("\n")` corrupts
 * those rows by turning one logical record into several broken ones, so
 * we walk the string character-by-character tracking in-quotes state.
 */
export function splitHeaderAndBody(csv: string): { header: string; body: string } {
  let inQuotes = false;
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (ch === '"') {
      // RFC 4180 escapes an embedded quote by doubling it. Skip the next
      // quote so we stay in the same in-quotes state across `""`.
      if (inQuotes && csv[i + 1] === '"') { i++; continue; }
      inQuotes = !inQuotes;
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      const header = csv.slice(0, i);
      const skip = ch === "\r" && csv[i + 1] === "\n" ? 2 : 1;
      return { header, body: csv.slice(i + skip) };
    }
  }
  return { header: csv, body: "" };
}

/** Concatenate multiple per-repo CSVs into one table keeping a single header. */
export function concatCsv(csvs: string[]): string {
  if (csvs.length === 0) return "";
  const first = splitHeaderAndBody(csvs[0]!);
  const bodies: string[] = [first.body];
  for (let i = 1; i < csvs.length; i++) {
    bodies.push(splitHeaderAndBody(csvs[i]!).body);
  }
  const cleaned = bodies.map(b => b.replace(/\n+$/, "")).filter(b => b.length > 0);
  return first.header + "\n" + cleaned.join("\n") + "\n";
}
