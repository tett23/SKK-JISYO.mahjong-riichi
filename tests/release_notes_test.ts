// SPDX-License-Identifier: GPL-3.0-or-later
// ADR 0002 のテスト設計に対応する。
import { assertEquals } from "@std/assert";
import {
  classify,
  commitLine,
  isVersionBump,
  linkSubject,
  notes,
  type Pair,
  parseCommits,
  vocabDiff,
} from "../scripts/release_notes.ts";

const ctx = { repo: "o/r", tag: "v1.0.0", adrFiles: ["docs/adr/0001-x.md"] };
const pairs = (xs: [string, string, string][]) =>
  new Map<string, Pair>(xs.map(([reading, cand, annot]) => [`${reading}\t${cand}`, { reading, cand, annot }]));

Deno.test("1. 件名の最初の単語で分類する", () => {
  assertEquals(classify("Add foo"), "追加");
  assertEquals(classify("add foo"), "追加");
  assertEquals(classify("Introduce foo"), "追加");
  assertEquals(classify("Create foo"), "追加");
  assertEquals(classify("Support foo"), "追加");
  assertEquals(classify("Remove foo"), "削除");
  assertEquals(classify("Delete foo"), "削除");
  assertEquals(classify("Drop foo"), "削除");
  assertEquals(classify("Fix foo"), "修正");
  assertEquals(classify("Correct foo"), "修正");
  assertEquals(classify("Bump actions"), "変更");
  assertEquals(classify("Adding is not Add"), "変更");
  assertEquals(classify("シャボ・シャンポンの漢字表記を足す"), "変更");
});

Deno.test("2. 版番号だけの件名を除く", () => {
  assertEquals(isVersionBump("v0.0.2"), true);
  assertEquals(isVersionBump("v0.0.1-rc2"), true);
  assertEquals(isVersionBump("v2 support"), false);
  assertEquals(isVersionBump("Add v0.0.2 notes"), false);
});

Deno.test("3. コミットへの絶対リンクを付ける", () => {
  const [c] = parseCommits("abcdef1234567890\tAdd foo\n");
  assertEquals(commitLine(c, ctx), "- Add foo ([abcdef1](https://github.com/o/r/commit/abcdef1234567890))");
});

Deno.test("4. PR の番号を絶対リンクにする", () => {
  assertEquals(linkSubject("Add foo (#12)", ctx), "Add foo ([#12](https://github.com/o/r/pull/12))");
});

Deno.test("5. ADR の参照をタグ時点のファイルへの絶対リンクにする", () => {
  assertEquals(
    linkSubject("Adopt bar (ADR 0001)", ctx),
    "Adopt bar ([ADR 0001](https://github.com/o/r/blob/v1.0.0/docs/adr/0001-x.md))",
  );
  assertEquals(linkSubject("Follow ADR 0099", ctx), "Follow ADR 0099");
});

Deno.test("6. 前のリリースがあるときの本文", () => {
  const out = notes({
    ...ctx,
    prevTag: "v0.9.0",
    cur: pairs([["ぽん", "ポン", "[麻雀]"]]),
    prev: pairs([]),
    commits: parseCommits("1111111aaaa\tAdd foo\n2222222bbbb\tv1.0.0\n3333333cccc\tBump bar\n"),
  });
  const lines = out.split("\n");
  assertEquals(lines[0], "## v1.0.0");
  assertEquals(lines.includes("[v0.9.0](https://github.com/o/r/releases/tag/v0.9.0) からの変更。"), true);
  assertEquals(lines.includes("### 追加"), true);
  assertEquals(lines.includes("### 変更"), true);
  assertEquals(lines.includes("### 削除"), false);
  assertEquals(lines.includes("### 修正"), false);
  assertEquals(lines.includes("### 語彙"), true);
  assertEquals(lines.includes("### 配布物"), true);
  assertEquals(out.includes("v1.0.0 ([2222222]"), false);
  // 節の順序
  const order = ["### 追加", "### 変更", "### 語彙", "### 配布物"].map((h) => lines.indexOf(h));
  assertEquals([...order].sort((a, b) => a - b), order);
});

Deno.test("7. 前のリリースがないときの本文", () => {
  const out = notes({
    ...ctx,
    cur: pairs([["ぽん", "ポン", "[麻雀]"], ["かん", "槓", "[麻雀]"]]),
    commits: parseCommits("1111111aaaa\tAdd foo\n"),
  });
  assertEquals(out.split("\n").includes("初回リリース。"), true);
  assertEquals(out.includes("<summary>追加した組（2 組）</summary>"), true);
  assertEquals(out.includes("ぽん /ポン;[麻雀]/"), true);
  assertEquals(out.includes("かん /槓;[麻雀]/"), true);
});

Deno.test("8. 語彙の差分を (読み, 候補) の組で数える", () => {
  const prev = pairs([["ぽん", "碰", "[麻雀]"], ["かん", "槓", "[麻雀]"], ["ぴんふ", "平和", "[麻雀]"]]);
  const cur = pairs([["ぽん", "碰", "[麻雀]"], ["ぽん", "ポン", "[麻雀]"], ["ぴんふ", "平和", "[麻雀][requested]"]]);
  const d = vocabDiff(cur, prev);
  assertEquals(d.added.map((p) => p.cand), ["ポン"]);
  assertEquals(d.removed.map((p) => p.cand), ["槓"]);
  assertEquals(d.changed.map((p) => p.cand), ["平和"]);
  assertEquals(d.requested.length, 1);
  const out = notes({ ...ctx, prevTag: "v0.9.0", cur, prev, commits: [] });
  assertEquals(out.includes("- 収録数: 3 組（v0.9.0: 3 組）"), true);
  assertEquals(out.includes("- 追加: 1 組 / 削除: 1 組 / 注釈の変更: 1 組"), true);
  assertEquals(out.includes("- `[requested]`（L にない役名）: 1 組"), true);
});
