// SPDX-License-Identifier: GPL-3.0-or-later
// sources.lock に固定した版の外部辞書を .cache/ に取得する。
import { readLock, ROOT } from "./lib.ts";

const lock = readLock(Deno.readTextFileSync(`${ROOT}/sources.lock`));
const skk = lock["skk-dev/dict"], mozc = lock["google/mozc"];

async function dl(url: string, dest: string) {
  try {
    if (Deno.statSync(dest).size > 0) return;
  } catch { /* 未取得 */ }
  await Deno.mkdir(dest.replace(/\/[^/]+$/, ""), { recursive: true });
  console.error(`fetch ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  await Deno.writeFile(`${dest}.tmp`, new Uint8Array(await res.arrayBuffer()));
  await Deno.rename(`${dest}.tmp`, dest);
}

const jobs: Promise<void>[] = [];
for (const f of ["SKK-JISYO.L", "SKK-JISYO.requested", "SKK-JISYO.JIS3_4"]) {
  jobs.push(
    dl(`https://raw.githubusercontent.com/skk-dev/dict/${skk}/${f}`, `${ROOT}/.cache/skk-dev-dict/${skk}/${f}`),
  );
}
for (let i = 0; i < 10; i++) {
  jobs.push(dl(
    `https://raw.githubusercontent.com/google/mozc/${mozc}/src/data/dictionary_oss/dictionary0${i}.txt`,
    `${ROOT}/.cache/mozc/${mozc}/dictionary0${i}.txt`,
  ));
}
jobs.push(dl(
  `https://raw.githubusercontent.com/google/mozc/${mozc}/src/data/dictionary_oss/README.txt`,
  `${ROOT}/.cache/mozc/${mozc}/README.txt`,
));
await Promise.all(jobs);
