// SPDX-License-Identifier: GPL-3.0-or-later
// Wikipedia 日本語版 API の小さなクライアント。

const API = "https://ja.wikipedia.org/w/api.php";
const UA = "SKK-JISYO.mahjong-riichi index builder (https://github.com/tett23/SKK-JISYO.mahjong-riichi)";

export type Revision = { title: string; revid: number; timestamp: string; content: string };

// deno-lint-ignore no-explicit-any
export async function api(params: Record<string, string>): Promise<any> {
  const q = new URLSearchParams({ ...params, format: "json", formatversion: "2" });
  for (let attempt = 0;; attempt++) {
    const res = await fetch(`${API}?${q}`, { headers: { "User-Agent": UA } });
    if (res.status === 429 && attempt < 5) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} ${q}`);
    return await res.json();
  }
}

/** revid を指定すればその版、title を指定すれば最新版。 */
export async function fetchRevisions(by: { revids: number[] } | { titles: string[] }): Promise<Revision[]> {
  const out: Revision[] = [];
  const keys = "revids" in by ? by.revids.map(String) : by.titles;
  for (let i = 0; i < keys.length; i += 20) {
    const chunk = keys.slice(i, i + 20).join("|");
    const d = await api({
      action: "query",
      prop: "revisions",
      rvprop: "ids|timestamp|content",
      rvslots: "main",
      ...("revids" in by ? { revids: chunk } : { titles: chunk }),
    });
    for (const p of d.query.pages) {
      if (p.missing || !p.revisions) continue;
      const r = p.revisions[0];
      out.push({ title: p.title, revid: r.revid, timestamp: r.timestamp, content: r.slots.main.content });
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return out;
}
