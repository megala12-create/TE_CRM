import { strFromU8, unzipSync } from "fflate";

/**
 * Reads the first worksheet of an .xlsx file into rows of strings. Date-formatted cells become
 * ISO dates (2026-04-09); numbers keep their plain value. Pure — no DB access.
 */
export function xlsxRows(bytes: Uint8Array): string[][] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (f) => (f.name.startsWith("xl/") && f.name.endsWith(".xml")) || f.name.endsWith(".rels") });
  } catch {
    throw new Error("This is not a valid .xlsx file. Save it again from Excel, or as CSV.");
  }
  const text = (p: string) => (files[p] ? strFromU8(files[p]!) : "");

  const sheetPath = firstSheetPath(text("xl/workbook.xml"), text("xl/_rels/workbook.xml.rels"));
  const sheet = text(sheetPath);
  if (!sheet) throw new Error("The workbook has no worksheet.");

  const shared = [...text("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => runsText(m[1]!));
  const dateStyles = dateStyleIndexes(text("xl/styles.xml"));

  const rows: string[][] = [];
  for (const m of sheet.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowNum = Number(/\br="(\d+)"/.exec(m[1]!)?.[1] ?? rows.length + 1);
    const row: string[] = [];
    for (const c of m[2]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1]!;
      const body = c[2] ?? "";
      const ref = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1];
      const type = /\bt="(\w+)"/.exec(attrs)?.[1];
      const style = Number(/\bs="(\d+)"/.exec(attrs)?.[1] ?? -1);
      const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "";
      let value: string;
      if (type === "s") value = shared[Number(raw)] ?? "";
      else if (type === "inlineStr") value = runsText(body);
      else if (type === "str" || type === "e") value = decode(raw);
      else if (type === "b") value = raw === "1" ? "TRUE" : "FALSE";
      else if (raw !== "" && dateStyles.has(style)) value = serialToIso(Number(raw));
      else value = raw;
      row[ref ? colIndex(ref) : row.length] = value;
    }
    rows[rowNum - 1] = Array.from(row, (v) => v ?? "");
  }
  return Array.from(rows, (r) => r ?? []);
}

function firstSheetPath(workbook: string, rels: string): string {
  const rid = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(workbook)?.[1];
  const target = rid ? new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] ?? new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${rid}"`).exec(rels)?.[1] : undefined;
  if (!target) return "xl/worksheets/sheet1.xml";
  return target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
}

/** Indexes into cellXfs whose number format is a date (built-in 14–22, 45–47 or a custom d/m/y format). */
function dateStyleIndexes(styles: string): Set<number> {
  const custom = new Map<number, string>();
  for (const m of styles.matchAll(/<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) custom.set(Number(m[1]), decode(m[2]!));
  const isDate = (id: number) => (id >= 14 && id <= 22) || (id >= 45 && id <= 47) || /(^|[^"\\])[dmy]/i.test((custom.get(id) ?? "").replace(/"[^"]*"|\[[^\]]*\]/g, ""));
  const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)?.[1] ?? "";
  const out = new Set<number>();
  [...xfs.matchAll(/<xf\b([^>]*)/g)].forEach((m, i) => {
    if (isDate(Number(/numFmtId="(\d+)"/.exec(m[1]!)?.[1] ?? 0))) out.add(i);
  });
  return out;
}

/** Excel serial day (1900 date system) → ISO date. */
export function serialToIso(serial: number): string {
  return new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 864e5).toISOString().slice(0, 10);
}

function colIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
}

function runsText(xml: string): string {
  return decode([...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(""));
}

function decode(s: string): string {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&");
}
