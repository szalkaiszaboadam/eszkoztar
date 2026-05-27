// src/lib/formulaEngine.ts
import { CellData } from "./sheetStore";

export function evaluateCell(
  formula: string,
  cells: Record<string, CellData>
): string {
  if (!formula.startsWith("=")) return formula;

  const expr = formula.slice(1).toUpperCase().trim();

  try {
    // SUM(A1:B3)
    const sumMatch = expr.match(/^SUM\(([A-Z]+\d+):([A-Z]+\d+)\)$/);
    if (sumMatch) {
      return String(rangeSum(sumMatch[1], sumMatch[2], cells));
    }

    // AVERAGE(A1:B3)
    const avgMatch = expr.match(/^AVERAGE\(([A-Z]+\d+):([A-Z]+\d+)\)$/);
    if (avgMatch) {
      const vals = rangeValues(avgMatch[1], avgMatch[2], cells);
      return vals.length ? String(vals.reduce((a, b) => a + b, 0) / vals.length) : "0";
    }

    // MAX / MIN
    const maxMatch = expr.match(/^MAX\(([A-Z]+\d+):([A-Z]+\d+)\)$/);
    if (maxMatch) return String(Math.max(...rangeValues(maxMatch[1], maxMatch[2], cells)));

    const minMatch = expr.match(/^MIN\(([A-Z]+\d+):([A-Z]+\d+)\)$/);
    if (minMatch) return String(Math.min(...rangeValues(minMatch[1], minMatch[2], cells)));

    // COUNT(A1:B3)
    const countMatch = expr.match(/^COUNT\(([A-Z]+\d+):([A-Z]+\d+)\)$/);
    if (countMatch) return String(rangeValues(countMatch[1], countMatch[2], cells).length);

    // Cellahivatkozások cseréje (pl. A1+B2)
    const resolved = expr.replace(/([A-Z]+\d+)/g, (ref) => {
      const val = cells[ref]?.value ?? "0";
      return isNaN(Number(val)) ? "0" : val;
    });

    // Biztonságos kiértékelés
    const result = Function(`"use strict"; return (${resolved})`)();
    return String(result);
  } catch {
    return "#HIBA!";
  }
}

function parseCellRef(ref: string): [number, number] {
  const col = ref.match(/[A-Z]+/)?.[0] ?? "A";
  const row = parseInt(ref.match(/\d+/)?.[0] ?? "1");
  const colNum = col.split("").reduce((acc, c) => acc * 26 + c.charCodeAt(0) - 64, 0);
  return [colNum, row];
}

function rangeValues(from: string, to: string, cells: Record<string, CellData>): number[] {
  const [c1, r1] = parseCellRef(from);
  const [c2, r2] = parseCellRef(to);
  const values: number[] = [];
  for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
    for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
      const col = String.fromCharCode(64 + c);
      const val = cells[`${col}${r}`]?.value ?? "";
      if (!isNaN(Number(val)) && val !== "") values.push(Number(val));
    }
  }
  return values;
}

function rangeSum(from: string, to: string, cells: Record<string, CellData>): number {
  return rangeValues(from, to, cells).reduce((a, b) => a + b, 0);
}