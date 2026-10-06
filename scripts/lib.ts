// SPDX-License-Identifier: GPL-3.0-or-later
// 生成スクリプトが共有する純粋な関数。

export const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
export const NAME = "SKK-JISYO.mahjong-riichi";
export const ANNOT = "[麻雀]";
/** 役名で SKK-JISYO.L にない組に足す注釈（upstream の SKK-JISYO.requested へ送る候補の目印） */
export const REQUESTED = "[requested]";

// ---------------------------------------------------------------- かな

const O_ROW = new Set("おこごそぞとどのほぼぽもよょろをぉ");
const U_ROW = new Set("うくぐすずつづぬふぶぷむゆゅるぅ");
const E_ROW = new Set("えけげせぜてでねへべぺめれぇ");

/** お段・う段＋う、え段＋い を ー にする。 */
export function toLong(r: string): string {
  const out: string[] = [];
  for (const c of r) {
    const p = out.at(-1) ?? "";
    if ((c === "う" && (O_ROW.has(p) || U_ROW.has(p))) || (c === "い" && E_ROW.has(p))) out.push("ー");
    else out.push(c);
  }
  return out.join("");
}

/** お段・う段＋ー を う、え段＋ー を い にする。あ段・い段と「うー」（五）の ー は残す。 */
export function toKana(r: string): string {
  const out: string[] = [];
  for (const c of r) {
    const p = out.at(-1) ?? "";
    if (c === "ー" && p !== "う" && (O_ROW.has(p) || U_ROW.has(p))) out.push("う");
    else if (c === "ー" && E_ROW.has(p)) out.push("い");
    else out.push(c);
  }
  return out.join("");
}

/** 読みの一覧を長音展開する（lv が偽なら何もしない）。順序を保ち重複を除く。 */
export function expand(readings: string[], lv: boolean): string[] {
  const out: string[] = [];
  for (const r of readings) {
    for (const v of lv ? [r, toKana(r), toLong(r)] : [r]) {
      if (!out.includes(v)) out.push(v);
    }
  }
  return out;
}

/** カタカナをひらがなにする。 */
export function hira(s: string): string {
  return [...s].map((c) => (c >= "ァ" && c <= "ヶ" ? String.fromCodePoint(c.codePointAt(0)! - 0x60) : c)).join("");
}

export const isKatakana = (s: string) => /^[ァ-ヺー]+$/.test(s);
export const isOkuri = (r: string) => /^[ぁ-ゖー]+[a-z]$/.test(r);

// ---------------------------------------------------------------- TSV

export type Row = { line: number; cols: string[] };

/** 手入力 TSV を読む。「# 」「##」で始まる行と空行は注釈。「#まん」のような数値変換の見出しは注釈ではない。 */
export function parseTsv(text: string, width = 5): Row[] {
  const rows: Row[] = [];
  text.split("\n").forEach((line, i) => {
    if (!line.trim() || line.startsWith("# ") || line.startsWith("##") || line === "#") return;
    const cols = line.split("\t");
    while (cols.length < width) cols.push("");
    rows.push({ line: i + 1, cols });
  });
  return rows;
}

// ---------------------------------------------------------------- SKK 辞書

export type SkkPair = { reading: string; cand: string; annot: string };

/** SKK 辞書の本文（UTF-8 に直したもの）を (読み, 候補, 注釈) に分解する。 */
export function parseSkk(text: string): SkkPair[] {
  const out: SkkPair[] = [];
  for (const line of text.split("\n")) {
    if (!line || line.startsWith(";")) continue;
    const sp = line.indexOf(" ");
    const reading = line.slice(0, sp);
    for (const c of line.slice(sp + 1).replace(/^\/|\/$/g, "").split("/")) {
      if (!c) continue;
      const semi = c.indexOf(";");
      out.push(
        semi < 0 ? { reading, cand: c, annot: "" } : { reading, cand: c.slice(0, semi), annot: c.slice(semi + 1) },
      );
    }
  }
  return out;
}

/** SKK 辞書の本文を描く。keep(読み, 候補) が偽の候補は落とす。annot(読み, 候補) が注釈。送りありは降順、送りなしは昇順（UTF-8 のバイト順）。 */
export function render(
  byReading: Map<string, string[]>,
  keep: (r: string, c: string) => boolean,
  annot: (r: string, c: string) => string = () => ANNOT,
): string[] {
  const ari: [string, string][] = [];
  const nasi: [string, string][] = [];
  for (const [r, cands] of byReading) {
    const cs = cands.filter((c) => keep(r, c));
    if (!cs.length) continue;
    const line = `${r} /` + cs.map((c) => `${escape(c)};${annot(r, c)}/`).join("");
    (isOkuri(r) ? ari : nasi).push([r, line]);
  }
  const cmp = (a: [string, string], b: [string, string]) => compareBytes(a[0], b[0]);
  return [
    ";; okuri-ari entries.",
    ...ari.sort(cmp).reverse().map((x) => x[1]),
    ";; okuri-nasi entries.",
    ...nasi.sort(cmp).map((x) => x[1]),
  ];
}

/** 候補に「/」「;」があれば SKK の (concat) 形式にする。 */
export function escape(c: string): string {
  if (!/[\/;]/.test(c)) return c;
  return `(concat "${c.replaceAll("/", "\\057").replaceAll(";", "\\073")}")`;
}

const enc = new TextEncoder();
export function compareBytes(a: string, b: string): number {
  const x = enc.encode(a), y = enc.encode(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
}

// ---------------------------------------------------------------- EUC-JP / EUC-JIS-2004

/**
 * EUC-JIS-2004 の文字のうち、WHATWG の euc-jp デコーダで正しく読めないもの。
 * JIS X 0213 の第 1 面の拡張部分（0208 の空き区）と第 2 面（0x8F）は、WHATWG では
 * IBM 拡張文字や JIS X 0212 として別の字に化けるので、ここに書いたものだけを読む。
 * 取り込む行に未知の文字があれば decodeEucJis2004 は例外を投げる。
 */
export const JIS2004_EXTRA: Record<string, string> = {
  "8fa1aa": "么",
  "f9a8": "碰",
};

const eucjp = new TextDecoder("euc-jp", { fatal: false });

/** JIS X 0208 で割り当てのある区（1〜8, 16〜84）か */
const in0208Row = (b: number) => (b >= 0xa1 && b <= 0xa8) || (b >= 0xb0 && b <= 0xf4);

/** EUC-JIS-2004 の 1 行を読む。JIS2004_EXTRA にない 0213 固有の文字は例外。 */
export function decodeEucJis2004(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i];
    if (b < 0x80) {
      out += String.fromCharCode(b);
      i++;
      continue;
    }
    const len = b === 0x8f ? 3 : 2;
    const seq = bytes.slice(i, i + len);
    const hex = [...seq].map((x) => x.toString(16).padStart(2, "0")).join("");
    if (hex in JIS2004_EXTRA) out += JIS2004_EXTRA[hex];
    else if (b === 0x8e || (len === 2 && in0208Row(b))) {
      const s = eucjp.decode(seq);
      if (s.includes("�")) throw new Error(`EUC-JIS-2004 の未知の文字: ${hex}`);
      out += s;
    } else throw new Error(`EUC-JIS-2004 の未知の文字: ${hex}（JIS2004_EXTRA に足す）`);
    i += len;
  }
  return out;
}

/** バイト列を行に分ける */
export function splitLines(bytes: Uint8Array): Uint8Array[] {
  const out: Uint8Array[] = [];
  let s = 0;
  for (let i = 0; i <= bytes.length; i++) {
    if (i === bytes.length || bytes[i] === 0x0a) {
      out.push(bytes.subarray(s, i));
      s = i + 1;
    }
  }
  return out;
}

// ---------------------------------------------------------------- sources.lock

export function readLock(text: string): Record<string, string> {
  const d: Record<string, string> = {};
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const [k, v] = line.split("\t");
    d[k] = v;
  }
  return d;
}
