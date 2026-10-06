// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * SKK-JISYO.mahjong-riichi を生成する。
 *
 * 入力:
 *   data/mahjong.tsv            手入力データ
 *   data/refs.tsv               手入力の出典
 *   data/exclude.tsv            skk-dev/dict から取り込まない組
 *   data/index/wikipedia.tsv    Wikipedia 索引（scripts/wp_index.ts）
 *   data/index/corpus.tsv       Wikipedia 麻雀記事コーパスのカタカナ語頻度（scripts/corpus.ts）
 *   .cache/                     sources.lock の版（scripts/fetch_sources.ts）
 * 出力（dist/）:
 *   SKK-JISYO.mahjong-riichi            全収録版（UTF-8）
 *   SKK-JISYO.mahjong-riichi.L-unique   L との重複除去版（UTF-8）
 *   provenance.tsv                      (読み, 候補) ごとの出典
 */
import {
  ANNOT,
  decodeEucJis2004,
  expand,
  hira,
  isKatakana,
  isOkuri,
  NAME,
  parseSkk,
  parseTsv,
  readLock,
  render,
  REQUESTED,
  ROOT,
  type SkkPair,
  splitLines,
  toLong,
} from "./lib.ts";

const DIST = `${ROOT}/dist`;
/** コーパスを出典として認める最小の出現数 */
const CORPUS_MIN = 3;

type Entry = { reading: string; cand: string; refs: string[]; basis: string; where: string; yaku: boolean };
type Imported = { reading: string; cand: string; src: string };
type Prov = { src: string[]; basis: string; where: string };

const read = (p: string) => Deno.readTextFileSync(`${ROOT}/${p}`);
const exists = (p: string) => {
  try {
    Deno.statSync(p);
    return true;
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------- 外部データ

function readSkkFile(path: string, encoding: "euc-jp" | "euc-jis-2004"): SkkPair[] {
  const bytes = Deno.readFileSync(path);
  if (encoding === "euc-jp") return parseSkk(new TextDecoder("euc-jp").decode(bytes));
  // EUC-JIS-2004 は WHATWG では読めない。[麻雀] 注釈の行だけを自前で読む
  const marker = new Uint8Array([0x5b, 0xcb, 0xe3, 0xbf, 0xfd, 0x5d]); // "[麻雀]" の EUC-JP
  const out: SkkPair[] = [];
  for (const line of splitLines(bytes)) {
    if (!includes(line, marker)) continue;
    out.push(...parseSkk(decodeEucJis2004(line)));
  }
  return out;
}

function includes(hay: Uint8Array, needle: Uint8Array): boolean {
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

function collect(lock: Record<string, string>) {
  const skk = `${ROOT}/.cache/skk-dev-dict/${lock["skk-dev/dict"]}`;
  if (!exists(skk)) throw new Error("外部データがない。先に deno task fetch を実行する");
  const exclude = new Set(parseTsv(read("data/exclude.tsv")).map((r) => `${r.cols[0]}\t${r.cols[1]}`));
  const L = readSkkFile(`${skk}/SKK-JISYO.L`, "euc-jp");
  const files: [string, SkkPair[]][] = [
    ["SKK-JISYO.L", L],
    ["SKK-JISYO.requested", readSkkFile(`${skk}/SKK-JISYO.requested`, "euc-jp")],
    ["SKK-JISYO.JIS3_4", readSkkFile(`${skk}/SKK-JISYO.JIS3_4`, "euc-jis-2004")],
  ];
  const imported: Imported[] = [];
  for (const [fname, pairs] of files) {
    for (const p of pairs) {
      if (p.annot.includes("麻雀") && !exclude.has(`${p.reading}\t${p.cand}`)) {
        imported.push({ reading: p.reading, cand: p.cand, src: `skk-dev/dict:${fname}` });
      }
    }
  }
  const lPairs = new Set(L.map((p) => `${p.reading}\t${p.cand}`));
  return { imported, lPairs };
}

/** Mozc の (読み, 表記)。読みは toLong で正規化する。okuri は「あがる/和了る」から作った語幹の組（あが/和了）。 */
function mozcPairs(commit: string) {
  const plain = new Set<string>(), okuri = new Set<string>();
  for (let i = 0; i < 10; i++) {
    const text = Deno.readTextFileSync(`${ROOT}/.cache/mozc/${commit}/dictionary0${i}.txt`);
    for (const line of text.split("\n")) {
      if (!line) continue;
      const x = line.split("\t");
      const r = x[0], c = x[4];
      plain.add(`${toLong(r)}\t${c}`);
      let k = 0;
      while (k < Math.min(r.length, c.length) - 1 && r.at(-1 - k) === c.at(-1 - k) && /[ぁ-ゖ]/.test(c.at(-1 - k)!)) {
        k++;
      }
      if (k) okuri.add(`${toLong(r.slice(0, -k))}\t${c.slice(0, -k)}`);
    }
  }
  return { plain, okuri };
}

function wpPairs(): Map<string, string> {
  const d = new Map<string, string>();
  for (const { cols } of parseTsv(read("data/index/wikipedia.tsv"))) {
    const [page, revid, head, reading] = cols;
    if (page === "page") continue;
    const k = `${toLong(reading)}\t${head}`;
    if (!d.has(k)) d.set(k, `wikipedia:${page}@${revid}`);
  }
  return d;
}

/** カタカナ語 → 出典文字列（コーパスで CORPUS_MIN 回以上出たもの） */
function corpusTerms(): Map<string, string> {
  const d = new Map<string, string>();
  if (!exists(`${ROOT}/data/index/corpus.tsv`)) return d;
  for (const { cols } of parseTsv(read("data/index/corpus.tsv"))) {
    const [term, count, example] = cols;
    if (term === "term" || Number(count) < CORPUS_MIN) continue;
    d.set(term, `corpus:wikipedia-mahjong(${count}回; ${example})`);
  }
  return d;
}

// ---------------------------------------------------------------- 手入力データ

function loadManual(path: string, refs: Map<string, string>) {
  const entries: Entry[] = [];
  const errors: string[] = [];
  const name = path.split("/").at(-1);
  for (const { line, cols } of parseTsv(read(path))) {
    const [readings, cand, flags, basis, ref] = cols;
    if (!cand) {
      errors.push(`${name}:${line}: 候補がない`);
      continue;
    }
    if (!basis) errors.push(`${name}:${line}: 収録基準(basis)がない`);
    const ids = ref.split(",").filter(Boolean);
    for (const i of ids) if (!refs.has(i)) errors.push(`${name}:${line}: 未定義の出典 ${i}`);
    for (const token of readings.split(" ").filter(Boolean)) {
      if (!/^#?[ぁ-ゖー]+[a-z]?$/.test(token)) errors.push(`${name}:${line}: 読みにひらがな以外がある: ${token}`);
      for (const reading of expand([token], flags.split(",").includes("lv"))) {
        entries.push({
          reading,
          cand,
          refs: ids,
          basis,
          where: `${name}:${line}:${token}`,
          yaku: flags.split(",").includes("yaku"),
        });
      }
    }
  }
  return { entries, errors };
}

/**
 * (読み, 候補) ごとに裏付けを集める。
 * 長音の機械展開で生じた読みは、展開元の読み（data の 1 行の 1 トークン）が持つ裏付けを引き継ぐ（via:）。
 */
function provenance(
  entries: Entry[],
  imported: Imported[],
  refs: Map<string, string>,
  moz: ReturnType<typeof mozcPairs>,
  wp: Map<string, string>,
  corpus: Map<string, string>,
): Map<string, Prov> {
  const skk = new Map<string, string[]>();
  for (const { reading, cand, src } of imported) {
    const k = `${reading}\t${cand}`;
    skk.set(k, [...(skk.get(k) ?? []), src]);
  }
  const lookup = (r: string, c: string): string[] => {
    const found = [...(skk.get(`${r}\t${c}`) ?? [])];
    const key = `${toLong(isOkuri(r) ? r.slice(0, -1) : r)}\t${c}`;
    if (wp.has(key)) found.push(wp.get(key)!);
    if ((isOkuri(r) ? moz.okuri : moz.plain).has(key)) found.push("mozc:dictionary_oss");
    // カタカナ語は読みが表記から決まるので、コーパスでの出現を出典にできる
    if (isKatakana(c) && toLong(hira(c)) === toLong(r) && corpus.has(c)) found.push(corpus.get(c)!);
    return found;
  };
  const byToken = Map.groupBy(entries, (e) => e.where);
  const prov = new Map<string, Prov>();
  for (const [where, es] of byToken) {
    const shared = es.flatMap((e) => lookup(e.reading, e.cand));
    for (const e of es) {
      const own = [...lookup(e.reading, e.cand), ...e.refs.map((i) => `${i}:${refs.get(i)}`)];
      const k = `${e.reading}\t${e.cand}`;
      const p = prov.get(k) ?? { src: [], basis: e.basis, where };
      p.src.push(...own, ...shared.filter((s) => !own.includes(s)).map((s) => `via:${s}`));
      prov.set(k, p);
    }
  }
  for (const { reading, cand, src } of imported) {
    const k = `${reading}\t${cand}`;
    if (!prov.has(k)) prov.set(k, { src: skk.get(k)!, basis: "", where: src });
  }
  return prov;
}

/** 読みごとに候補を並べる: 手入力データの順 → skk-dev/dict 取り込み分。 */
function order(entries: Entry[], imported: Imported[]): Map<string, string[]> {
  const d = new Map<string, string[]>();
  for (const { reading, cand } of [...entries, ...imported]) {
    const cs = d.get(reading) ?? [];
    if (!cs.includes(cand)) cs.push(cand);
    d.set(reading, cs);
  }
  return d;
}

// ---------------------------------------------------------------- 出力

function header(title: string, lock: Record<string, string>, extra: string[] = []): string[] {
  return [
    ";; -*- mode: fundamental; coding: utf-8 -*-",
    `;; ${title}`,
    ";;",
    ";; Copyright (C) 2026 tett23 and the SKK-JISYO.mahjong-riichi contributors",
    ";;",
    ";; This dictionary is free software: you can redistribute it and/or modify",
    ";; it under the terms of the GNU General Public License as published by",
    ";; the Free Software Foundation, either version 3 of the License, or",
    ";; (at your option) any later version.",
    ";;",
    ";; This dictionary is distributed in the hope that it will be useful,",
    ";; but WITHOUT ANY WARRANTY; without even the implied warranty of",
    ";; MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the",
    ";; GNU General Public License for more details.",
    ";;",
    ";; You should have received a copy of the GNU General Public License",
    ";; along with this dictionary.  If not, see <https://www.gnu.org/licenses/>.",
    ";;",
    ";; SPDX-License-Identifier: GPL-3.0-or-later",
    ";;",
    ";;; 原データと著作権表示（全文は配布物の NOTICE を参照）:",
    ";;",
    `;;  - SKK-JISYO.L / SKK-JISYO.requested / SKK-JISYO.JIS3_4 (skk-dev/dict@${lock["skk-dev/dict"].slice(0, 12)})`,
    ";;    Copyright (C) 1988-1995, 1997, 1999-2014 Masahiko Sato, Hironobu Takahashi,",
    ";;    Masahiro Doteguchi, Miki Inooka, Yukiyoshi Kameyama, Akihiko Sasaki,",
    ";;    Dai Ando, Junichi Okukawa, Katsushi Sato, Nobuhiro Yamagishi,",
    ";;    NAKAJIMA Mikio, MITA Yuusuke, SKK Development Team (SKK-JISYO.L)",
    ";;    Copyright (C) 2003-2005 SKK Development Team (SKK-JISYO.requested)",
    ";;    Copyright (C) 1993 Wnn Consortium, 2000 KAWABATA Taichi,",
    ";;    2000 もりみつじゅんじ (SKK-JISYO.JIS3_4)",
    ";;    いずれも GPL version 2 or (at your option) any later version.",
    `;;  - Mozc dictionary_oss (google/mozc@${lock["google/mozc"].slice(0, 12)}) の読みと表記の組`,
    ";;    IPAdic: Copyright 2000, 2001, 2002, 2003 Nara Institute of Science",
    ";;    and Technology.  All Rights Reserved.",
    ";;    Use, reproduction, and distribution of this software is permitted.",
    ";;    Any copy of this software, whether in its original form or modified,",
    ";;    must include both the above copyright notice and the following",
    ";;    paragraphs.",
    ";;    Nara Institute of Science and Technology (NAIST),",
    ";;    the copyright holders, disclaims all warranties with regard to this",
    ";;    software, including all implied warranties of merchantability and",
    ";;    fitness, in no event shall NAIST be liable for",
    ";;    any special, indirect or consequential damages or any damages",
    ";;    whatsoever resulting from loss of use, data or profits, whether in an",
    ";;    action of contract, negligence or other tortuous action, arising out",
    ";;    of or in connection with the use or performance of this software.",
    ";;    (ICOT Free Software の条件と Okinawa dictionary の表示は NOTICE を参照)",
    ";;  - Wikipedia 日本語版の見出し語と読み、麻雀記事でのカタカナ語の出現数（説明文は使っていない）。",
    ";;    CC BY-SA 4.0。版は data/index/ と data/refs.tsv を参照。",
    ";;  - そのほかの Web 上の出典（data/refs.tsv）は語の存在と読みの確認にだけ使っている。",
    ";;",
    ...extra,
    ";; 生成: scripts/build.ts。手で編集しないこと。",
    ";;",
  ];
}

function main() {
  const lock = readLock(read("sources.lock"));
  const refs = new Map(
    parseTsv(read("data/refs.tsv")).filter((r) => r.cols[0] !== "id").map((r) => [r.cols[0], r.cols[2]]),
  );
  const { imported, lPairs } = collect(lock);
  const moz = mozcPairs(lock["google/mozc"]);
  const wp = wpPairs();
  const corpus = corpusTerms();
  Deno.mkdirSync(DIST, { recursive: true });

  const { entries, errors } = loadManual(`data/mahjong.tsv`, refs);
  const prov = provenance(entries, imported, refs, moz, wp, corpus);
  for (const [k, p] of prov) {
    if (!p.src.length) errors.push(`${p.where}: 出典がない: ${k.replace("\t", " /")}/`);
  }
  if (errors.length) {
    console.error(errors.join("\n"));
    Deno.exit(1);
  }

  const byReading = order(entries, imported);
  const notInL = (r: string, c: string) => !lPairs.has(`${r}\t${c}`);
  // 役名（data で yaku を付けた候補）は、どの読みでも L にない組なら [requested] を足す
  const yaku = new Set(entries.filter((e) => e.yaku).map((e) => e.cand));
  const annot = (r: string, c: string) => (yaku.has(c) && notInL(r, c) ? `${ANNOT}${REQUESTED}` : ANNOT);
  const write = (name: string, lines: string[]) => Deno.writeTextFileSync(`${DIST}/${name}`, lines.join("\n") + "\n");
  write(NAME, [...header(NAME, lock), ...render(byReading, () => true, annot)]);
  write(`${NAME}.L-unique`, [
    ...header(`${NAME}.L-unique`, lock, [
      `;; 重複除去版: SKK-JISYO.L (skk-dev/dict@${lock["skk-dev/dict"]})`,
      ";; に (読み, 候補) の組で既にある候補を除いている。",
      ";;",
    ]),
    ...render(byReading, notInL, annot),
  ]);

  const rows = [...prov].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, p]) =>
    [k, Number(lPairs.has(k)), p.basis, p.where, [...new Set(p.src)].join(" ")].join("\t")
  );
  write("provenance.tsv", ["reading\tcandidate\tin_L\tbasis\tdefined_at\tsources", ...rows]);

  const all = [...byReading].flatMap(([r, cs]) => cs.map((c) => [r, c]));
  const unique = all.filter(([r, c]) => notInL(r, c));
  console.error(`${NAME}: ${all.length} 組（L 重複除去後 ${unique.length} 組）, 見出し ${byReading.size}`);
}

main();
