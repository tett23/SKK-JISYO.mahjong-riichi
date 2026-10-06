// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Wikipedia 日本語版の「Category:麻雀」配下の記事をコーパスにして、カタカナ語の出現数を数える。
 * 本文は保存せず、語・出現数・出現記事数・出現例の記事（版）だけを data/index/corpus.tsv に書く。
 *
 *   deno task corpus            data/index/corpus-revisions.tsv に固定した版で数え直す
 *   deno task corpus --latest   カテゴリを辿り直し、最新版に更新してから数える
 *
 * あわせて data/mahjong.tsv の各候補（文字種を問わない）の部分文字列としての出現数を data/index/corpus-terms.tsv に書く。
 * こちらは出典には使わず、同じ読みの候補の並び順を決める材料にする。
 *
 * 用途:
 *   - カタカナだけの候補（ポン、ベタオリ など）の出典（読みが表記から決まるため）。scripts/build.ts が使う
 *   - 収録漏れの発見（出現数の多いカタカナ語のうち、data/mahjong.tsv にないもの）
 */
import { parseTsv, ROOT } from "./lib.ts";
import { api, fetchRevisions, type Revision } from "./wikipedia.ts";
import { unmarkup } from "./wp_index.ts";

const REVS = `${ROOT}/data/index/corpus-revisions.tsv`;
const OUT = `${ROOT}/data/index/corpus.tsv`;
const OUT_TERMS = `${ROOT}/data/index/corpus-terms.tsv`;
/** 辿るカテゴリ。テンプレートとスタブのカテゴリは除く */
const ROOTS = ["Category:麻雀"];
const SKIP = /テンプレート|スタブ/;
const DEPTH = 2;
const MIN_COUNT = 2;

async function members(cat: string, type: "page" | "subcat"): Promise<string[]> {
  const out: string[] = [];
  let cont: Record<string, string> = {};
  do {
    const d = await api({
      action: "query",
      list: "categorymembers",
      cmtitle: cat,
      cmtype: type,
      cmlimit: "500",
      ...cont,
    });
    out.push(...d.query.categorymembers.map((m: { title: string }) => m.title));
    cont = d.continue ?? {};
  } while (cont.cmcontinue);
  return out;
}

async function crawl(): Promise<string[]> {
  const pages = new Set<string>();
  const seen = new Set<string>();
  let frontier = ROOTS;
  for (let depth = 0; depth <= DEPTH && frontier.length; depth++) {
    const next: string[] = [];
    for (const cat of frontier) {
      if (seen.has(cat) || SKIP.test(cat)) continue;
      seen.add(cat);
      for (const p of await members(cat, "page")) pages.add(p);
      next.push(...await members(cat, "subcat"));
    }
    frontier = next;
  }
  return [...pages].sort();
}

/** 本文から数える対象のテキストを取り出す（脚注・テンプレート・リンク先を除く） */
function plain(content: string): string {
  return unmarkup(content.replace(/\{\{(?:Cite|cite|Reflist|reflist)[\s\S]*?\}\}/g, ""))
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\[\[(?:File|ファイル|Category|画像):[^\]]*\]\]/g, "");
}

export function countKatakana(revs: Revision[]) {
  const count = new Map<string, number>();
  const docs = new Map<string, Set<string>>();
  for (const rev of revs) {
    for (const m of plain(rev.content).matchAll(/[ァ-ヺー]{2,}/g)) {
      const w = m[0];
      if (w.startsWith("ー")) continue;
      count.set(w, (count.get(w) ?? 0) + 1);
      const d = docs.get(w) ?? new Set();
      d.add(`${rev.title}@${rev.revid}`);
      docs.set(w, d);
    }
  }
  return { count, docs };
}

/** 候補ごとの部分文字列としての出現数と出現記事数 */
export function countTerms(revs: Revision[], terms: string[]) {
  const texts = revs.map((r) => plain(r.content));
  return terms.map((t) => {
    let n = 0, d = 0;
    for (const text of texts) {
      const k = text.split(t).length - 1;
      n += k;
      if (k) d++;
    }
    return [t, n, d] as const;
  });
}

if (import.meta.main) {
  let revs: Revision[];
  if (Deno.args.includes("--latest")) {
    const titles = await crawl();
    console.error(`${titles.length} 記事`);
    revs = await fetchRevisions({ titles });
  } else {
    const ids = parseTsv(Deno.readTextFileSync(REVS), 2).filter((r) => r.cols[0] !== "title").map((r) =>
      Number(r.cols[1])
    );
    revs = await fetchRevisions({ revids: ids });
  }
  revs.sort((a, b) => (a.title < b.title ? -1 : 1));
  Deno.writeTextFileSync(
    REVS,
    [
      "# scripts/corpus.ts のコーパスに使った Wikipedia 日本語版の記事と版（CC BY-SA 4.0）",
      "title\trevid",
      ...revs.map((r) => `${r.title}\t${r.revid}`),
    ].join("\n") + "\n",
  );
  const { count, docs } = countKatakana(revs);
  const rows = [...count].filter(([, n]) => n >= MIN_COUNT).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  Deno.writeTextFileSync(
    OUT,
    [
      "# Wikipedia 日本語版「Category:麻雀」配下の記事（data/index/corpus-revisions.tsv）でのカタカナ語の出現数。",
      `# 本文は含まない。出現数 ${MIN_COUNT} 以上の語だけ。example は出現した記事の一つ（版つき）。`,
      "term\tcount\tdocs\texample",
      ...rows.map(([w, n]) => `${w}\t${n}\t${docs.get(w)!.size}\t${[...docs.get(w)!][0]}`),
    ].join("\n") + "\n",
  );
  const terms = [
    ...new Set(
      parseTsv(Deno.readTextFileSync(`${ROOT}/data/mahjong.tsv`)).map((r) => r.cols[1]).filter((c) =>
        c && !c.startsWith("#")
      ),
    ),
  ];
  Deno.writeTextFileSync(
    OUT_TERMS,
    [
      "# data/mahjong.tsv の候補の、コーパス（data/index/corpus-revisions.tsv）での部分文字列としての出現数。",
      "# 出典には使わない。同じ読みの候補の並び順を決める材料。",
      "term\tcount\tdocs",
      ...countTerms(revs, terms).map((x) => x.join("\t")),
    ].join("\n") + "\n",
  );
  console.error(`${revs.length} 記事, ${rows.length} 語`);
}
