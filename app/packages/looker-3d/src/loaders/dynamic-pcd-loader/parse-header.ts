import { PCDFieldType, PCDHeader } from "./types";

/**
 * Parses the header of a PCD file.
 *
 * @param bin - The binary data of the PCD file.
 * @returns The header of the PCD file.
 */
export const parseHeader = (bin: ArrayBuffer): PCDHeader => {
  const text = new Uint8Array(bin);
  let header = "",
    line = "",
    i = 0,
    foundEnd = false;

  // read until after the DATA line (inclusive of its newline)
  while (i < text.length && !foundEnd) {
    const ch = String.fromCharCode(text[i++]);
    header += ch;
    if (ch === "\n" || ch === "\r") {
      if (/^\s*DATA\s/i.test(line)) foundEnd = true;
      line = "";
    } else {
      line += ch;
    }
  }

  // find DATA line and compute headerLen
  const dataMatch = header.match(/(?:^|\r?\n)DATA\s+(\S+)/i)!;
  const dmEnd = dataMatch.index! + dataMatch[0].length;
  const nextLF = header.indexOf("\n", dmEnd);
  const headerLen = nextLF !== -1 ? nextLF + 1 : dmEnd;

  // raw header string (without comments)
  const str = header.slice(0, headerLen).replace(/#.*/g, "");

  const getMatch = (re: RegExp): string | null => {
    const m = str.match(re);
    return m ? m[1] : null;
  };

  const fields = getMatch(/^FIELDS\s+(.*)/im)!
    .trim()
    .split(/\s+/);
  const size = getMatch(/^SIZE\s+(.*)/im)!
    .trim()
    .split(/\s+/)
    .map(Number);

  const rawTypeLine = getMatch(/^TYPE\s+(.*)/im)!;
  const types = rawTypeLine
    .trim()
    .split(/\s+/)
    .map((t) => {
      if (t === "F" || t === "I" || t === "U") return t as PCDFieldType;
      throw new Error(`Unsupported PCD TYPE code: ${t}`);
    });

  const countMatch = getMatch(/^COUNT\s+(.*)/im);
  const count = countMatch
    ? countMatch.trim().split(/\s+/).map(Number)
    : fields.map(() => 1);

  const width = Number(getMatch(/^WIDTH\s+(.*)/im));
  const height = Number(getMatch(/^HEIGHT\s+(.*)/im));
  const pointsMatch = getMatch(/^POINTS\s+(.*)/im);
  const points = pointsMatch ? Number(pointsMatch) : width * height;

  const data = getMatch(/(?:^|\r?\n)DATA\s+(\S+)/i)!;

  const offset: Record<string, number> = {};
  let sum = 0;
  fields.forEach((f, idx) => {
    offset[f] = data === "ascii" ? idx : sum;
    sum += size[idx] * count[idx];
  });

  return {
    data,
    headerLen,
    fields,
    size,
    type: types,
    count,
    width,
    height,
    points,
    offset,
    rowSize: sum,
    str,
  };
};
