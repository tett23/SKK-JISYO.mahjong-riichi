// SPDX-License-Identifier: GPL-3.0-or-later
// 配布用 zip を作る（zip コマンドを使う）。先に build を実行しておくこと。
import { NAME, ROOT } from "./lib.ts";

const version = Deno.readTextFileSync(`${ROOT}/VERSION`).trim();
const dir = `${NAME}-${version}`;
const dist = `${ROOT}/dist`;
await Deno.remove(`${dist}/${dir}`, { recursive: true }).catch(() => {});
await Deno.remove(`${dist}/${dir}.zip`).catch(() => {});
await Deno.mkdir(`${dist}/${dir}`);
for (const f of [NAME, `${NAME}.L-unique`, "provenance.tsv"]) {
  await Deno.copyFile(`${dist}/${f}`, `${dist}/${dir}/${f}`);
}
for (const f of ["README.md", "COPYING", "NOTICE"]) await Deno.copyFile(`${ROOT}/${f}`, `${dist}/${dir}/${f}`);
const { success } = await new Deno.Command("zip", { args: ["-qr", `${dir}.zip`, dir], cwd: dist }).output();
if (!success) Deno.exit(1);
console.log(`dist/${dir}.zip`);
