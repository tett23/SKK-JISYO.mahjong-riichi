// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * リリースノートを作る。前のリリースの辞書と今回の辞書を (読み, 候補) の組で比べ、追加・削除した語彙を列挙する。
 *
 *   deno run --allow-read scripts/release_notes.ts <tag> <今回の辞書> [前回の辞書 前回のタグ]
 *
 * 前回の辞書を渡さなければ初回リリースとして、すべての組を追加として扱う。
 */
import { parseSkk } from "./lib.ts";

type Pair = { reading: string; cand: string; annot: string };

function pairs(path: string): Map<string, Pair> {
  const m = new Map<string, Pair>();
  for (const p of parseSkk(Deno.readTextFileSync(path))) m.set(`${p.reading}\t${p.cand}`, p);
  return m;
}

/** 読みごとにまとめて SKK 辞書の行の形で書く */
function listing(ps: Pair[]): string[] {
  const by = Map.groupBy(ps, (p) => p.reading);
  return [...by].map(([r, cs]) => `${r} /${cs.map((c) => `${c.cand};${c.annot}`).join("/")}/`);
}

function section(title: string, ps: Pair[]): string[] {
  if (!ps.length) return [`### ${title}（0 組）`, "", "なし", ""];
  return [
    `### ${title}（${ps.length} 組）`,
    "",
    "<details>",
    "<summary>一覧</summary>",
    "",
    "```",
    ...listing(ps),
    "```",
    "",
    "</details>",
    "",
  ];
}

export function notes(tag: string, cur: Map<string, Pair>, prev?: Map<string, Pair>, prevTag?: string): string {
  const added = [...cur].filter(([k]) => !prev?.has(k)).map(([, p]) => p);
  const removed = prev ? [...prev].filter(([k]) => !cur.has(k)).map(([, p]) => p) : [];
  const changed = prev
    ? [...cur].filter(([k, p]) => prev.has(k) && prev.get(k)!.annot !== p.annot).map(([, p]) => p)
    : [];
  const requested = [...cur.values()].filter((p) => p.annot.includes("[requested]"));
  const lines = [
    `## ${tag}`,
    "",
    prev
      ? `${prevTag} からの語彙の変更。比較の単位は (読み, 候補) の組。`
      : "初回リリース。収録したすべての組を「追加」として載せる。",
    "",
    `- 収録数: ${cur.size} 組${prev ? `（${prevTag}: ${prev.size} 組）` : ""}`,
    `- 追加: ${added.length} 組`,
    `- 削除: ${removed.length} 組`,
    ...(prev ? [`- 注釈の変更: ${changed.length} 組`] : []),
    `- \`[requested]\`（L にない役名）: ${requested.length} 組`,
    "",
    ...section("追加した語彙", added),
    ...section("削除した語彙", removed),
    ...(prev ? section("注釈を変えた語彙", changed) : []),
    "出典は配布物の `provenance.tsv` を参照。",
  ];
  return lines.join("\n") + "\n";
}

if (import.meta.main) {
  const [tag, curPath, prevPath, prevTag] = Deno.args;
  if (!tag || !curPath) {
    console.error("usage: release_notes.ts <tag> <今回の辞書> [前回の辞書 前回のタグ]");
    Deno.exit(2);
  }
  console.log(notes(tag, pairs(curPath), prevPath ? pairs(prevPath) : undefined, prevTag));
}
