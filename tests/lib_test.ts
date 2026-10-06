// SPDX-License-Identifier: GPL-3.0-or-later
import { assertEquals, assertThrows } from "@std/assert";
import {
  decodeEucJis2004,
  escape,
  expand,
  hira,
  isOkuri,
  parseSkk,
  parseTsv,
  render,
  toKana,
  toLong,
} from "../scripts/lib.ts";

Deno.test("toLong: お段・う段＋う、え段＋い を ー にする", () => {
  assertEquals(toLong("ちゅうれんぽうとう"), "ちゅーれんぽーとー");
  assertEquals(toLong("ほうていらおゆい"), "ほーてーらおゆい");
  assertEquals(toLong("すうぱい"), "すーぱい");
  assertEquals(toLong("れんかいほう"), "れんかいほー"); // あ段＋い はそのまま
});

Deno.test("toKana: い段＋ー と「うー」は残す", () => {
  assertEquals(toKana("ちゅーれんぽーとー"), "ちゅうれんぽうとう");
  assertEquals(toKana("いーぺーこー"), "いーぺいこう");
  assertEquals(toKana("うーぴん"), "うーぴん");
  assertEquals(toKana("まーじゃん"), "まーじゃん");
});

Deno.test("expand", () => {
  assertEquals(expand(["ほうら"], true), ["ほうら", "ほーら"]);
  assertEquals(expand(["ほうら"], false), ["ほうら"]);
  assertEquals(expand(["ほーてい"], true), ["ほーてい", "ほうてい", "ほーてー"]);
});

Deno.test("hira / isOkuri", () => {
  assertEquals(hira("ベタオリ"), "べたおり");
  assertEquals(isOkuri("あがr"), true);
  assertEquals(isOkuri("#まん"), false);
  assertEquals(isOkuri("ぽん"), false);
});

Deno.test("parseTsv: 「#まん」は注釈ではない", () => {
  const rows = parseTsv("# 注釈\n## 節\n#まん\t#3萬\n\nぽん\tポン\n");
  assertEquals(rows.map((r) => r.cols.slice(0, 2)), [["#まん", "#3萬"], ["ぽん", "ポン"]]);
});

Deno.test("parseSkk", () => {
  assertEquals(parseSkk("かん /缶/槓;[麻雀]/\n"), [
    { reading: "かん", cand: "缶", annot: "" },
    { reading: "かん", cand: "槓", annot: "[麻雀]" },
  ]);
});

Deno.test("render: 送りありは降順、送りなしは昇順", () => {
  const d = new Map([["つもr", ["自摸"]], ["あがr", ["和了"]], ["ぽん", ["ポン", "碰"]], ["#まん", ["#3萬"]]]);
  assertEquals(render(d, () => true), [
    ";; okuri-ari entries.",
    "つもr /自摸;[麻雀]/",
    "あがr /和了;[麻雀]/",
    ";; okuri-nasi entries.",
    "#まん /#3萬;[麻雀]/",
    "ぽん /ポン;[麻雀]/碰;[麻雀]/",
  ]);
});

Deno.test("render: 重複は (読み, 候補) の組で判定する", () => {
  const d = new Map([["はいてい", ["海底", "海底摸月"]]]);
  const out = render(d, (r, c) => !(r === "はいてい" && c === "海底"));
  assertEquals(out.includes("はいてい /海底摸月;[麻雀]/"), true);
});

Deno.test("escape", () => {
  assertEquals(escape("1/2"), '(concat "1\\0572")');
  assertEquals(escape("牌"), "牌");
});

Deno.test("decodeEucJis2004: 0213 固有の字は表で読み、未知なら例外", () => {
  assertEquals(decodeEucJis2004(new Uint8Array([0xa4, 0xdd, 0xa4, 0xf3, 0x20, 0x2f, 0xf9, 0xa8, 0x2f])), "ぽん /碰/");
  assertEquals(decodeEucJis2004(new Uint8Array([0x8f, 0xa1, 0xaa])), "么");
  assertThrows(() => decodeEucJis2004(new Uint8Array([0xf9, 0xa9])));
  assertThrows(() => decodeEucJis2004(new Uint8Array([0x8f, 0xa1, 0xab])));
});

Deno.test("release notes: 追加・削除・注釈の変更を組単位で数える", async () => {
  const { notes } = await import("../scripts/release_notes.ts");
  const m = (xs: [string, string, string][]) =>
    new Map(xs.map(([reading, cand, annot]) => [`${reading}\t${cand}`, { reading, cand, annot }]));
  const prev = m([["ぽん", "碰", "[麻雀]"], ["かん", "槓", "[麻雀]"], ["ぴんふ", "平和", "[麻雀]"]]);
  const cur = m([["ぽん", "碰", "[麻雀]"], ["ぽん", "ポン", "[麻雀]"], ["ぴんふ", "平和", "[麻雀][requested]"]]);
  const out = notes("v0.0.2", cur, prev, "v0.0.1");
  assertEquals(out.includes("- 追加: 1 組"), true);
  assertEquals(out.includes("ぽん /ポン;[麻雀]/"), true);
  assertEquals(out.includes("- 削除: 1 組"), true);
  assertEquals(out.includes("かん /槓;[麻雀]/"), true);
  assertEquals(out.includes("- 注釈の変更: 1 組"), true);
});
