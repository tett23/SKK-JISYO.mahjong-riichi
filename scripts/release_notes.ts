// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * リリースノートを作る（ADR 0002）。
 *
 * - 前のリリースのタグからのコミットを、件名の最初の単語で「追加」「変更」「削除」「修正」に分け、
 *   コミット・PR・ADR への絶対リンクを付ける
 * - 前のリリースの辞書と今回の辞書を (読み, 候補) の組で比べ、語彙の追加・削除・注釈の変更を列挙する
 *
 *   deno run --allow-read scripts/release_notes.ts --tag <tag> --repo <owner/repo> --dict <今回の辞書> \
 *     --commits <file> [--prev-tag <tag> --prev-dict <前回の辞書>]
 *
 * --commits のファイルは 1 行 1 コミットで `<SHA>\t<件名>`（git log --no-merges --format='%H%x09%s'）。
 * 前回の辞書を渡さなければ初回リリースとして、すべての組を追加として扱う。
 */
import { parseSkk, ROOT } from "./lib.ts";

export type Pair = { reading: string; cand: string; annot: string };
export type Commit = { sha: string; subject: string };
export type Section = "追加" | "変更" | "削除" | "修正";
type Ctx = { repo: string; tag: string; adrFiles: string[] };

const SECTIONS: Section[] = ["追加", "変更", "削除", "修正"];
const FIRST_WORD: Record<string, Section> = {
  add: "追加",
  introduce: "追加",
  create: "追加",
  support: "追加",
  remove: "削除",
  delete: "削除",
  drop: "削除",
  fix: "修正",
  correct: "修正",
};

// ---------------------------------------------------------------- コミット

/** 件名の最初の単語で節を決める */
export function classify(subject: string): Section {
  const word = subject.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  return FIRST_WORD[word] ?? "変更";
}

/** 件名が版番号だけか（v0.0.2、v0.0.1-rc2 など。リリースの準備のコミット） */
export const isVersionBump = (subject: string) => /^v\d+(\.\d+)*(-[0-9A-Za-z.]+)?$/.test(subject.trim());

export function parseCommits(text: string): Commit[] {
  return text.split("\n").filter(Boolean).map((line) => {
    const tab = line.indexOf("\t");
    return { sha: line.slice(0, tab), subject: line.slice(tab + 1) };
  });
}

/** 件名の (#123) と ADR NNNN を絶対リンクにする */
export function linkSubject(subject: string, { repo, tag, adrFiles }: Ctx): string {
  return subject
    .replace(/\(#(\d+)\)/g, (_, n) => `([#${n}](https://github.com/${repo}/pull/${n}))`)
    .replace(/ADR (\d{4})/g, (m, n) => {
      const file = adrFiles.find((f) => f.split("/").at(-1)!.startsWith(`${n}-`));
      return file ? `[${m}](https://github.com/${repo}/blob/${tag}/${file})` : m;
    });
}

export function commitLine(c: Commit, ctx: Ctx): string {
  return `- ${linkSubject(c.subject, ctx)} ([${c.sha.slice(0, 7)}](https://github.com/${ctx.repo}/commit/${c.sha}))`;
}

// ---------------------------------------------------------------- 語彙

export function vocabDiff(cur: Map<string, Pair>, prev?: Map<string, Pair>) {
  return {
    added: [...cur].filter(([k]) => !prev?.has(k)).map(([, p]) => p),
    removed: prev ? [...prev].filter(([k]) => !cur.has(k)).map(([, p]) => p) : [],
    changed: prev ? [...cur].filter(([k, p]) => prev.has(k) && prev.get(k)!.annot !== p.annot).map(([, p]) => p) : [],
    requested: [...cur.values()].filter((p) => p.annot.includes("[requested]")),
  };
}

/** 読みごとにまとめて SKK 辞書の行の形で書く */
function listing(ps: Pair[]): string[] {
  const by = Map.groupBy(ps, (p) => p.reading);
  return [...by].map(([r, cs]) => `${r} /${cs.map((c) => `${c.cand};${c.annot}`).join("/")}/`);
}

function details(title: string, ps: Pair[]): string[] {
  const summary = `<summary>${title}（${ps.length} 組）</summary>`;
  if (!ps.length) return ["<details>", summary, "", "なし", "", "</details>", ""];
  return ["<details>", summary, "", "```", ...listing(ps), "```", "", "</details>", ""];
}

// ---------------------------------------------------------------- 本文

export function notes(
  args: Ctx & {
    prevTag?: string;
    cur: Map<string, Pair>;
    prev?: Map<string, Pair>;
    commits: Commit[];
  },
): string {
  const { repo, tag, prevTag, cur, prev, commits } = args;
  const d = vocabDiff(cur, prev);
  const bySection = Map.groupBy(commits.filter((c) => !isVersionBump(c.subject)), (c) => classify(c.subject));
  const lines = [
    `## ${tag}`,
    "",
    prevTag ? `[${prevTag}](https://github.com/${repo}/releases/tag/${prevTag}) からの変更。` : "初回リリース。",
    "",
  ];
  for (const s of SECTIONS) {
    const cs = bySection.get(s);
    if (cs?.length) lines.push(`### ${s}`, "", ...cs.map((c) => commitLine(c, args)), "");
  }
  lines.push(
    "### 語彙",
    "",
    "比較の単位は (読み, 候補) の組。数と一覧は完全版についてのもの。",
    "",
    `- 収録数: ${cur.size} 組${prev ? `（${prevTag}: ${prev.size} 組）` : ""}`,
    `- 追加: ${d.added.length} 組 / 削除: ${d.removed.length} 組 / 注釈の変更: ${d.changed.length} 組`,
    `- \`[requested]\`（L にない役名）: ${d.requested.length} 組`,
    "",
    ...details("追加した組", d.added),
    ...(prev ? [...details("削除した組", d.removed), ...details("注釈を変えた組", d.changed)] : []),
    "出典は配布物の `provenance.tsv` を参照。",
    "",
    "### 配布物",
    "",
    "いずれも UTF-8。",
    "",
    "| ファイル | 内容 |",
    "|---|---|",
    "| `SKK-JISYO.mahjong-riichi` | 完全版（全収録） |",
    "| `SKK-JISYO.mahjong-riichi.L-unique` | SKK-JISYO.L と (読み, 候補) が重なる候補を除いた版 |",
    "| `provenance.tsv` | (読み, 候補) ごとの出典 |",
    "| `SKK-JISYO.mahjong-riichi-<版>.zip` | 上記と README・COPYING・NOTICE をまとめたもの |",
  );
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------- 入出力

function readPairs(path: string): Map<string, Pair> {
  const m = new Map<string, Pair>();
  for (const p of parseSkk(Deno.readTextFileSync(path))) m.set(`${p.reading}\t${p.cand}`, p);
  return m;
}

function arg(name: string): string | undefined {
  const i = Deno.args.indexOf(`--${name}`);
  return i >= 0 ? Deno.args[i + 1] : undefined;
}

if (import.meta.main) {
  const tag = arg("tag"), repo = arg("repo"), dict = arg("dict"), commits = arg("commits");
  const prevTag = arg("prev-tag"), prevDict = arg("prev-dict");
  if (!tag || !repo || !dict || !commits || !prevTag !== !prevDict) {
    console.error(
      "usage: release_notes.ts --tag <tag> --repo <owner/repo> --dict <file> --commits <file> [--prev-tag <tag> --prev-dict <file>]",
    );
    Deno.exit(2);
  }
  const adrFiles = [...Deno.readDirSync(`${ROOT}/docs/adr`)].filter((e) => e.isFile && e.name.endsWith(".md"))
    .map((e) => `docs/adr/${e.name}`).sort();
  console.log(notes({
    repo,
    tag,
    adrFiles,
    prevTag,
    cur: readPairs(dict),
    prev: prevDict ? readPairs(prevDict) : undefined,
    commits: parseCommits(Deno.readTextFileSync(commits)),
  }));
}
