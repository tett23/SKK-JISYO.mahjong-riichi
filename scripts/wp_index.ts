// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Wikipedia の麻雀関連記事から「見出し語と読み」だけの索引を作る。説明文は取り込まない。
 * 出力は data/index/wikipedia.tsv。取得する版は data/index/wikipedia-revisions.tsv に固定する。
 *
 *   deno task index            固定した版を取得して索引を作り直す
 *   deno task index --latest   最新版の revid に更新してから作り直す
 */
import { hira, parseTsv, ROOT } from "./lib.ts";
import { fetchRevisions } from "./wikipedia.ts";

const REVS = `${ROOT}/data/index/wikipedia-revisions.tsv`;
const OUT = `${ROOT}/data/index/wikipedia.tsv`;
const KANA = /^[ぁ-ゖァ-ヺー]+$/;

type Pair = [head: string, reading: string, how: string];

export function unmarkup(s: string): string {
  return s
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<ref[^>]*\/>|<ref[^>]*>[\s\S]*?<\/ref>/g, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\{\{(?:Visible anchor|Anchors)\|([^}|]*)[^}]*\}\}/gi, "$1")
    .replace(/\{\{Nowrap begin\}\}|\{\{Nowrap end\}\}/g, "")
    .replaceAll("{{Wrapj}}", "")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, "$1")
    .replace(/\[\[([^\]]*)\]\]/g, "$1")
    .replace(/<br\s*\/?>/g, "、")
    .replaceAll("'''", "")
    .replaceAll("''", "")
    .trim();
}

const splitWords = (s: string) => s.split(/[、,，・]/).map((w) => w.trim()).filter(Boolean);

/** 見出しと読みの対応を作る。数が合えば位置で、合わなければ全組み合わせ（要確認）。 */
function pairs(heads: string[], reads: string[]): Pair[] {
  if (!reads.length) return heads.filter((h) => KANA.test(h)).map((h) => [h, hira(h), "kana"]);
  if (heads.length === reads.length) return heads.map((h, i) => [h, hira(reads[i]), "pos"]);
  return heads.flatMap((h) => reads.map((r): Pair => [h, hira(r), "cross"]));
}

/** 麻雀用語一覧: トップレベルの箇条書き「* 見出し（読み）」 */
function parseGlossary(text: string): Pair[] {
  const out: Pair[] = [];
  for (const line of text.split("\n")) {
    if (!/^\*\s*[^:*]/.test(line)) continue;
    const body = unmarkup(line.replace(/^[*\s]+/, "").split("→")[0]);
    const m = body.match(/^([^（(]+)(?:[（(]([^）)]*)[）)])?/);
    if (!m) continue;
    out.push(...pairs(splitWords(m[1]), splitWords(m[2] ?? "")));
  }
  return out;
}

/** 麻雀の役一覧: wikitable の 役名 | 読み仮名 | 略称 | 条件 | 備考 */
function parseYakuTable(text: string): Pair[] {
  const out: Pair[] = [];
  for (const row of text.split("\n|-")) {
    const cells = ("\n" + row.trim()).split(/\n\|/).slice(1);
    if (cells.length < 2 || /^\s*(!|\{|style)/.test(cells[0])) continue;
    const heads = splitWords(unmarkup(cells[0]));
    out.push(...pairs(heads, splitWords(unmarkup(cells[1]))));
    if (cells.length > 2) {
      for (const a of splitWords(unmarkup(cells[2]))) {
        if (!KANA.test(a)) continue;
        out.push([a, hira(a), "abbr"]);
        // 略称の読みに正式な役名を当てる組（当て読みの判定材料）
        if (heads[0]) out.push([heads[0], hira(a), "abbr"]);
      }
    }
    if (cells.length > 4) {
      // 備考欄の「漢字（カナ）」形の別名
      for (const m of unmarkup(cells[4]).matchAll(/([一-龥々]{2,})（([ァ-ヶー]+)）/g)) {
        out.push([m[1], hira(m[2]), "note"]);
      }
    }
  }
  return out;
}

/** 麻雀のローカル役: 各節の「'''見出し'''（読み）」 */
function parseSections(text: string): Pair[] {
  const out: Pair[] = [];
  for (const m of text.matchAll(/'''([^']+)'''[（(]([^）)]+)[）)]/g)) {
    const reads = splitWords(unmarkup(m[2])).filter((r) => KANA.test(r));
    out.push(...pairs(splitWords(unmarkup(m[1])), reads));
  }
  return out;
}

const PARSERS: Record<string, (t: string) => Pair[]> = {
  "麻雀用語一覧": parseGlossary,
  "麻雀の役一覧": parseYakuTable,
  "麻雀のローカル役": parseSections,
};

if (import.meta.main) {
  const latest = Deno.args.includes("--latest");
  const revs = parseTsv(Deno.readTextFileSync(REVS), 3).filter((r) => r.cols[0] !== "title").map((r) => r.cols);
  const fetched = latest
    ? await fetchRevisions({ titles: revs.map((r) => r[0]) })
    : await fetchRevisions({ revids: revs.map((r) => Number(r[1])) });
  const rows: string[][] = [];
  for (const rev of fetched) {
    let n = 0;
    for (const [head, reading, how] of PARSERS[rev.title](rev.content)) {
      const r = reading.replace(/[^ぁ-ゖー]/g, "");
      if (head && r && !head.startsWith("#") && [...head].length <= 12) {
        rows.push([rev.title, String(rev.revid), head, r, how]);
        n++;
      }
    }
    console.error(`${rev.title} rev ${rev.revid}: ${n} pairs`);
  }
  Deno.writeTextFileSync(
    REVS,
    ["title\trevid\ttimestamp", ...fetched.map((r) => `${r.title}\t${r.revid}\t${r.timestamp}`)].join("\n") + "\n",
  );
  const seen = new Set<string>();
  const lines = [
    "# Wikipedia 日本語版から抽出した見出し語と読みの索引（説明文は含まない）。",
    "# 出典: data/index/wikipedia-revisions.tsv の各版。CC BY-SA 4.0。",
    "# how: pos=位置で対応 / cross=総当たり（要確認） / kana=見出しがかな / abbr=略称欄 / note=備考欄の別名",
    "page\trevid\theadword\treading\thow",
  ];
  for (const row of rows) {
    const k = `${row[2]}\t${row[3]}`;
    if (seen.has(k)) continue;
    seen.add(k);
    lines.push(row.join("\t"));
  }
  Deno.writeTextFileSync(OUT, lines.join("\n") + "\n");
}
