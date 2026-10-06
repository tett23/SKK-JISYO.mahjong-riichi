// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * [requested] の付いた役名（標準の役で SKK-JISYO.L にない組）を、upstream（skk-dev/dict）へ送るための一覧にする。
 * 先に deno task build を実行しておくこと。
 *
 * 出力（upstream/。送った内容の記録としてリポジトリに入れる）:
 *   requested-yaku.tsv   組ごとの送り先・追加のしかた・現在の L の行・出典
 *   ChangeLog.txt        skk-dev/dict の ChangeLog に足す文面（真鵺道。UTF-8）
 *   PR.md                skk-dev/dict へのプルリクエストの本文の草案
 *
 *   deno task upstream                       一覧を作る
 *   deno task upstream --apply <dict の作業ツリー>   その作業ツリーの SKK-JISYO.L と ChangeLog を書き換える
 *
 * 送り先は SKK-JISYO.L（EUC-JP）。JIS X 0208 で書けない字（么 など）を含む組は L に入らないので、
 * 一覧には載せるが --apply では書き換えない（SKK-JISYO.JIS3_4 への追加は別途相談する）。
 */
import { ANNOT, JIS2004_EXTRA, NAME, parseSkk, parseTsv, readLock, REQUESTED, ROOT, splitLines } from "./lib.ts";

const OUT = `${ROOT}/upstream`;

// ---------------------------------------------------------------- EUC-JP（JIS X 0208 だけ）の符号化

/** JIS X 0208 の文字 → EUC-JP のバイト列。WHATWG のデコーダで 0208 の区（1〜8, 16〜84）だけを引いて作る */
function eucTable(): Map<string, Uint8Array> {
  const dec = new TextDecoder("euc-jp", { fatal: true });
  const m = new Map<string, Uint8Array>();
  for (let hi = 0xa1; hi <= 0xf4; hi++) {
    if (!((hi >= 0xa1 && hi <= 0xa8) || hi >= 0xb0)) continue;
    for (let lo = 0xa1; lo <= 0xfe; lo++) {
      const b = new Uint8Array([hi, lo]);
      try {
        const c = dec.decode(b);
        if (!m.has(c)) m.set(c, b);
      } catch { /* 空き */ }
    }
  }
  return m;
}
const EUC = eucTable();

/** JIS X 0208（と ASCII）だけで書けるなら EUC-JP のバイト列、書けなければ null */
export function encodeEucJp(s: string): Uint8Array | null {
  const out: number[] = [];
  for (const c of s) {
    const cp = c.codePointAt(0)!;
    if (cp < 0x80) out.push(cp);
    else {
      const b = EUC.get(c);
      if (!b) return null;
      out.push(...b);
    }
  }
  return new Uint8Array(out);
}

/** ISO-2022-JP（ChangeLog の文字コード）に符号化する。JIS X 0208 で書けない字があれば null */
export function encodeIso2022jp(s: string): Uint8Array | null {
  const out: number[] = [];
  let kanji = false;
  for (const c of s) {
    const cp = c.codePointAt(0)!;
    if (cp < 0x80) {
      if (kanji) out.push(0x1b, 0x28, 0x42), kanji = false;
      out.push(cp);
    } else {
      const b = EUC.get(c);
      if (!b) return null;
      if (!kanji) out.push(0x1b, 0x24, 0x42), kanji = true;
      out.push(b[0] & 0x7f, b[1] & 0x7f);
    }
  }
  if (kanji) out.push(0x1b, 0x28, 0x42);
  return new Uint8Array(out);
}

// ---------------------------------------------------------------- 一覧

type Item = {
  reading: string;
  cand: string;
  target: "SKK-JISYO.L" | "SKK-JISYO.JIS3_4";
  action: "new-entry" | "add-candidate" | "already-in-JIS3_4" | "needs-JIS3_4";
  inRequested: boolean;
  current: string; // 送り先の現在の行（なければ空）
  sources: string;
};

function compare(a: Uint8Array, b: Uint8Array): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}

function entriesByReading(text: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const line of text.split("\n")) {
    if (!line || line.startsWith(";")) continue;
    m.set(line.slice(0, line.indexOf(" ")), line);
  }
  return m;
}

function collect(): Item[] {
  const lock = readLock(Deno.readTextFileSync(`${ROOT}/sources.lock`));
  const skk = `${ROOT}/.cache/skk-dev-dict/${lock["skk-dev/dict"]}`;
  const L = new TextDecoder("euc-jp").decode(Deno.readFileSync(`${skk}/SKK-JISYO.L`));
  const requested = new TextDecoder("euc-jp").decode(Deno.readFileSync(`${skk}/SKK-JISYO.requested`));
  // JIS3_4 は EUC-JIS-2004。WHATWG では一部の字が化けるが、ここでは組の有無を見るだけなので、
  // JIS2004_EXTRA の字を含む組はバイト列で照合する
  const jis34 = Deno.readFileSync(`${skk}/SKK-JISYO.JIS3_4`);
  const lEntries = entriesByReading(L);
  const lPairs = new Set(parseSkk(L).map((p) => `${p.reading}\t${p.cand}`));
  const reqPairs = new Set(parseSkk(requested).map((p) => `${p.reading}\t${p.cand}`));
  const extraRev = new Map(Object.entries(JIS2004_EXTRA).map(([hex, c]) => [c, hex]));
  const jis34Has = (r: string, c: string) => {
    const hex = [...`${r} `].map((ch) =>
      [...(encodeEucJp(ch) ?? [])].map((x) => x.toString(16).padStart(2, "0")).join("")
    )
      .join("");
    const candHex = [...c].map((ch) =>
      extraRev.get(ch) ?? [...(encodeEucJp(ch) ?? [])].map((x) => x.toString(16).padStart(2, "0")).join("")
    ).join("");
    for (const line of splitLines(jis34)) {
      const h = [...line].map((x) => x.toString(16).padStart(2, "0")).join("");
      if (h.startsWith(hex) && h.includes(`2f${candHex}`)) return true;
    }
    return false;
  };

  const prov = new Map(
    parseTsv(Deno.readTextFileSync(`${ROOT}/dist/provenance.tsv`), 6).filter((r) => r.cols[0] !== "reading").map((
      r,
    ) => [`${r.cols[0]}\t${r.cols[1]}`, r.cols[5]]),
  );
  const items: Item[] = [];
  for (const p of parseSkk(Deno.readTextFileSync(`${ROOT}/dist/${NAME}`))) {
    if (p.annot !== `${ANNOT}${REQUESTED}`) continue;
    const k = `${p.reading}\t${p.cand}`;
    if (lPairs.has(k)) continue;
    const inL0208 = encodeEucJp(p.reading + p.cand) !== null;
    const current = lEntries.get(p.reading) ?? "";
    const sources = (prov.get(k) ?? "").split(" ").filter((s) => s && !s.startsWith("via:")).join(" ");
    items.push({
      reading: p.reading,
      cand: p.cand,
      target: inL0208 ? "SKK-JISYO.L" : "SKK-JISYO.JIS3_4",
      action: !inL0208
        ? (jis34Has(p.reading, p.cand) ? "already-in-JIS3_4" : "needs-JIS3_4")
        : current
        ? "add-candidate"
        : "new-entry",
      inRequested: reqPairs.has(k),
      current: inL0208 ? current : "",
      sources,
    });
  }
  return items;
}

// ---------------------------------------------------------------- ChangeLog（真鵺道）

/** 送り先ごとに、読みでまとめた真鵺道の行 */
function manued(items: Item[]): string[] {
  const out: string[] = [];
  const byReading = Map.groupBy(items, (i) => i.reading);
  for (const [r, is] of [...byReading].sort((a, b) => compare(encodeEucJp(a[0])!, encodeEucJp(b[0])!))) {
    const add = is.map((i) => `${i.cand};${ANNOT}/`).join("");
    out.push(is[0].current ? `\t${is[0].current}{->${add}}` : `\t{->${r} /${add}}`);
  }
  return out;
}

export function changelog(items: Item[], date: string, author: string): string {
  const L = items.filter((i) => i.target === "SKK-JISYO.L");
  return [
    `${date}  ${author}`,
    "",
    "\t* SKK-JISYO.L: Add entries.",
    "\t麻雀の役名（Wikipedia「麻雀の役一覧」の「主な役」）のうち、L にないものを追加。",
    ...manued(L),
    "",
    "",
  ].join("\n");
}

// ---------------------------------------------------------------- PR の本文

export function prBody(items: Item[], lock: Record<string, string>, yakuRev: string): string {
  const L = items.filter((i) => i.target === "SKK-JISYO.L");
  const jis = items.filter((i) => i.action === "needs-JIS3_4");
  const newLines = new Set(L.filter((i) => i.action === "new-entry").map((i) => i.reading)).size;
  const addLines = new Set(L.filter((i) => i.action === "add-candidate").map((i) => i.reading)).size;
  const src = (i: Item) =>
    [
      i.sources.includes("wikipedia:麻雀の役一覧") ? "役一覧" : "",
      i.sources.includes("wikipedia:麻雀用語一覧") ? "用語一覧" : "",
      i.sources.includes("mozc:") ? "Mozc" : "",
      i.inRequested ? "requested" : "",
    ].filter(Boolean).join("・") || "役一覧（別表記）";
  const row = (i: Item) =>
    `| ${i.reading} | ${i.cand} | ${i.action === "new-entry" ? "新しい行" : "既存の行に追加"} | ${src(i)} |`;
  return [
    "# SKK-JISYO.L: 麻雀の役名を追加",
    "",
    "## 概要",
    "",
    `麻雀の役名のうち、SKK-JISYO.L にないものを ${L.length} 組追加します（新しい行 ${newLines}、既存の行への候補の追加 ${addLines}）。`,
    "注釈は L の既存の麻雀用語（`りーち /立直;[麻雀]/` など）に合わせて `[麻雀]` だけを付けています。",
    "",
    "## 選んだ基準",
    "",
    `- Wikipedia 日本語版「麻雀の役一覧」（[版 ${yakuRev}](https://ja.wikipedia.org/w/index.php?oldid=${yakuRev})）の「主な役」にある漢字の役名と、その表の略称欄・備考欄にある読みと別名（海底撈月、十三么九、四喜和）`,
    "- 異体表記の 槍槓（搶槓）",
    "- ローカル役（三連刻、大車輪 など）、カタカナ表記（タンヤオ など）、漢字の略称（一通、七対、清一 など）は含めていません",
    "",
    "## 読み",
    "",
    "- 中国語由来の音で読む役名は、L の既存の行（`りんしゃんかいほう` と `りんしゃんかいほー`、`すーあんこ`、`ちゅーれんぱおとう` など）に倣い、「う・い」の形と「ー」の形の両方を立てています（例: `ちゅうれんぽうとう` と `ちゅーれんぽーとー`）",
    "- 略称の読みに正式な役名を当てる組（`ちんいつ /清一色/`、`ほんいつ /混一色/` など）は、Wikipedia「麻雀の役一覧」の略称欄と Mozc の同じ組を根拠にしています",
    "- 読みの形が多すぎるようでしたら削ります。ご指摘ください",
    "",
    "## 候補の位置",
    "",
    "既存の行（`ほんいつ /奔逸/`、`れんほう /蓮舫/連舫/` など）には、既存の候補の後ろに足しています。",
    "",
    "## 根拠",
    "",
    "- Wikipedia「麻雀の役一覧」「麻雀用語一覧」の見出しと読み（説明文は使っていません）",
    `- Mozc の OSS 辞書（google/mozc@${
      lock["google/mozc"].slice(0, 12)
    } の \`src/data/dictionary_oss\`）に同じ (読み, 表記) の組があるもの`,
    "- 3 組（`さんあんこ /三暗刻/`、`ちーといつ /七対子/`、`れんほー /人和/`）は SKK-JISYO.requested に登録希望として既にあるものです",
    "",
    "語と読みの組だけを追加しており、文章は取り込んでいません。この PR の追加分は SKK-JISYO.L と同じ GPL-2.0-or-later で提供します。",
    "",
    "## ライセンスについて",
    "",
    "CC BY-SA 4.0 由来のデータは GPLv2 とは互換性がないとされているので、Wikipedia を出典とするエントリを L に送ると、ライセンスの面で問題になる可能性があります。",
    "ただし、一方で、見出し語と読みの対応は事実に近く、個々のエントリには著作権が及ばないという見方もあります。ここは解釈が分かれるところです。問題があれば修正します。",
    "Wikipedia 以外から見出し語を収集する場合は検討します。",
    "",
    "<details>",
    `<summary>追加する組の一覧（${L.length} 組）</summary>`,
    "",
    "| 読み | 候補 | 追加のしかた | 根拠 |",
    "|---|---|---|---|",
    ...L.map(row),
    "",
    "</details>",
    "",
    "## この PR に含めていないもの",
    "",
    `么（JIS X 0208 にない字）を含む役名は L（EUC-JP）に入らないため含めていません。SKK-JISYO.JIS3_4 への追加を別途ご相談させてください（${jis.length} 組）。`,
    "",
    ...jis.map((i) => `- \`${i.reading} /${i.cand};[麻雀]/\``),
    "",
    "## 確認したこと",
    "",
    "- `SKK-JISYO.L` の送りなしエントリが EUC-JP のバイト順に並んでいること（既存の `がいひ` の重複行以外に順序の乱れがないこと）",
    "- `ChangeLog` は ISO-2022-JP、真鵺道（older-first）で書いています",
    "- `SKK-JISYO.L.unannotated` は `make archive` で生成されるため含めていません",
    "",
    "出典: [SKK-JISYO.mahjong-riichi](https://github.com/tett23/SKK-JISYO.mahjong-riichi)（麻雀用語の SKK 辞書）で集めた語のうち、upstream に送る価値があるものを抜き出しました。",
    "",
  ].join("\n");
}

// ---------------------------------------------------------------- --apply

/** SKK-JISYO.L のバイト列に組を足す（既存の行は末尾に候補を足し、ない読みは昇順の位置に行を挿入する） */
export function applyToL(bytes: Uint8Array, items: Item[]): Uint8Array {
  const lines = splitLines(bytes).map((l) => l.slice());
  const nasi = lines.findIndex((l) => new TextDecoder().decode(l) === ";; okuri-nasi entries.");
  const byReading = Map.groupBy(items, (i) => i.reading);
  for (const [r, is] of byReading) {
    const key = encodeEucJp(`${r} `)!;
    const add = encodeEucJp(is.map((i) => `${i.cand};${ANNOT}/`).join(""))!;
    const idx = lines.findIndex((l, i) => i > nasi && compare(l.subarray(0, key.length), key) === 0);
    if (idx >= 0) {
      const merged = new Uint8Array(lines[idx].length + add.length);
      merged.set(lines[idx]);
      merged.set(add, lines[idx].length);
      lines[idx] = merged;
    } else {
      const line = encodeEucJp(`${r} /`)!;
      const full = new Uint8Array(line.length + add.length);
      full.set(line);
      full.set(add, line.length);
      let at = nasi + 1;
      while (
        at < lines.length && lines[at].length &&
        compare(lines[at].subarray(0, lines[at].indexOf(0x20)), key.subarray(0, key.length - 1)) < 0
      ) at++;
      lines.splice(at, 0, full);
    }
  }
  const total = lines.reduce((n, l) => n + l.length + 1, -1);
  const out = new Uint8Array(total);
  let o = 0;
  lines.forEach((l, i) => {
    out.set(l, o);
    o += l.length;
    if (i < lines.length - 1) out[o++] = 0x0a;
  });
  return out;
}

if (import.meta.main) {
  const items = collect();
  await Deno.mkdir(OUT, { recursive: true });
  const header = "target\taction\treading\tcandidate\tin_SKK-JISYO.requested\tcurrent_entry\tsources";
  Deno.writeTextFileSync(
    `${OUT}/requested-yaku.tsv`,
    [
      header,
      ...items.map((i) =>
        [i.target, i.action, i.reading, i.cand, Number(i.inRequested), i.current, i.sources].join("\t")
      ),
    ]
      .join("\n") + "\n",
  );
  const date = new Date().toISOString().slice(0, 10);
  const author = Deno.env.get("CHANGELOG_AUTHOR") ?? "Your Name  <you@example.com>";
  const log = changelog(items, date, author);
  Deno.writeTextFileSync(`${OUT}/ChangeLog.txt`, log);

  const lock = readLock(Deno.readTextFileSync(`${ROOT}/sources.lock`));
  const yakuRev = parseTsv(Deno.readTextFileSync(`${ROOT}/data/index/wikipedia-revisions.tsv`), 3)
    .find((r) => r.cols[0] === "麻雀の役一覧")!.cols[1];
  Deno.writeTextFileSync(`${OUT}/PR.md`, prBody(items, lock, yakuRev));

  const count = (f: (i: Item) => boolean) => items.filter(f).length;
  const readings = (a: Item["action"]) => new Set(items.filter((i) => i.action === a).map((i) => i.reading)).size;
  console.error(
    `L へ ${count((i) => i.target === "SKK-JISYO.L")} 組（新しい行 ${readings("new-entry")}, 既存の行に追加 ${
      readings("add-candidate")
    }）, JIS3_4 が必要 ${count((i) => i.target === "SKK-JISYO.JIS3_4")} 組（うち JIS3_4 に既にある ${
      count((i) => i.action === "already-in-JIS3_4")
    }）`,
  );

  const at = Deno.args.indexOf("--apply");
  if (at >= 0) {
    const dir = Deno.args[at + 1];
    const L = items.filter((i) => i.target === "SKK-JISYO.L");
    Deno.writeFileSync(`${dir}/SKK-JISYO.L`, applyToL(Deno.readFileSync(`${dir}/SKK-JISYO.L`), L));
    const enc = encodeIso2022jp(log);
    if (!enc) throw new Error("ChangeLog に ISO-2022-JP で書けない字がある");
    const old = Deno.readFileSync(`${dir}/ChangeLog`);
    const merged = new Uint8Array(enc.length + old.length);
    merged.set(enc);
    merged.set(old, enc.length);
    Deno.writeFileSync(`${dir}/ChangeLog`, merged);
    console.error(`${dir} の SKK-JISYO.L と ChangeLog を書き換えた`);
  }
}
