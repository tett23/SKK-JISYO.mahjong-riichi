# SKK-JISYO.mahjong-riichi

日本の麻雀（リーチ麻雀）の用語を集めた SKK 辞書。SKK-JISYO.L に入っていない見出し語を補う。

```
たんやおちゅう /断么九;[麻雀]/
しゃんてん /向聴;[麻雀]/
くいたん /喰いタン;[麻雀]/喰い断;[麻雀]/食いタン;[麻雀]/食い断;[麻雀]/
あがr /和了;[麻雀]/
#ぴん /#3筒;[麻雀]/
ぽん /ポン;[麻雀]/碰;[麻雀]/
```

## 配布物

すべて UTF-8。EUC-JP 版は配布しない（么・碰 など JIS X 0208 にない字を含む用語が多いため）。

| ファイル | 内容 |
|---|---|
| `SKK-JISYO.mahjong-riichi` | 全収録版 |
| `SKK-JISYO.mahjong-riichi.L-unique` | SKK-JISYO.L と (読み, 候補) が重なる候補を除いた版 |
| `provenance.tsv` | (読み, 候補) ごとの出典 |

SKK-JISYO.L と併用するなら `.L-unique` を、単独で使うなら全収録版を使う。
天鳳・雀魂・Mリーグなどの固有名詞、ポン・ベタオリなどのカタカナ語も本体に入っている。

役名で SKK-JISYO.L にない候補には `[麻雀][requested]` の注釈が付く（upstream へ送る候補の目印）。

## 生成

[Deno](https://deno.com/) 2 が要る。

```bash
deno task build
```

`dist/` に辞書ができる。配布用 zip は `deno task zip`（`zip` コマンドを使う）、テストは `deno task test`。

## リリース

`VERSION` を更新してコミットし、`v` で始まるタグ（`v0.0.1-rc1` など）を push すると、GitHub Actions が
辞書を生成して GitHub Releases に公開する。`-` を含むタグはプレリリースになる。

リリースノートは日本語で、直前のリリースからのコミットを「追加」「変更」「削除」「修正」に分けて、
コミット・PR・ADR への絶対リンクを付けて載せる。あわせて、直前のリリースの辞書と比べて追加・削除した
(読み, 候補) の組を「語彙」に載せる（`scripts/release_notes.ts`。詳細は
[docs/specifications.md](docs/specifications.md) の「リリースノート」、[ADR 0002](docs/adr/0002-categorized-release-notes.md)）。

外部データは `sources.lock` に固定した版を `.cache/` に取得して使う。Wikipedia の索引とコーパスの集計
（`data/index/`）はリポジトリに入れてあり、作り直すときだけ `deno task index` / `deno task corpus` を使う
（`--latest` を付けると最新版に更新する）。

## upstream への還元

`[requested]` の付いた役名を skk-dev/dict へ送るための材料を `upstream/` に置いている。

```bash
CHANGELOG_AUTHOR="名前  <メール>" deno task upstream
```

- `upstream/requested-yaku.tsv` — 送る組の一覧（送り先、新しい行か既存の行への追加か、出典）
- `upstream/ChangeLog.txt` — skk-dev/dict の ChangeLog に足す文面（真鵺道）
- `upstream/PR.md` — プルリクエストの本文の草案
- `upstream/skk-dev-dict.patch` — skk-dev/dict の master に当てるパッチ（`--apply <作業ツリー>` で作業ツリーを直接書き換えたものの差分）

么 を含む役名は SKK-JISYO.L（EUC-JP）に入らないので、パッチには含めず PR.md に別途相談として載せる。

## 仕様と ADR

- [docs/specifications.md](docs/specifications.md) — 仕様の全体。収録基準（何を収録し、何を収録しないか、出典の扱い）と、
  設計（長音、重複除去、文字コード、カタカナ語、固有名詞、送りあり、数値変換など）
- [docs/adr/](docs/adr/) — 設計判断の記録（ADR）。運用は [ADR 0001](docs/adr/0001-adopt-adr-and-adr-guard.md) による

仕様を変えるときは、先に ADR を書いてレビューを受ける。一度コミットした ADR はステータスの行とリンクだけの変更を除いて変更できず、
仕様を変える場合は新しい ADR を作る。ADR で仕様が変わったら、同じ変更で `docs/specifications.md` とこの README も直す。
語の追加・削除は収録基準に従う限り ADR は要らない。

### 開発の準備

コミット済みの ADR を守るため、[adr-guard](https://github.com/tett23/adr-guard)（v0.8.2）をインストールし
（[インストール方法](https://github.com/tett23/adr-guard#インストール)）、clone ごとに git の hook を有効にする。

```bash
git config core.hooksPath .githooks
```

CI でも同じ検査をする（`.github/workflows/ci.yml` の `adr` ジョブ）。

語を追加するときは `data/mahjong.tsv` に 1 行足す。出典を自動照合できない語は `data/refs.tsv` に出典を足す。
`deno task build` は出典のない組があると失敗する。

## ライセンス

GNU General Public License version 3 or later（[COPYING](COPYING)）。

SPDX-License-Identifier: GPL-3.0-or-later

本辞書は次の原データを利用している。著作権表示と利用条件の全文は [NOTICE](NOTICE) にあり、
辞書ファイルのヘッダーと配布 zip にも含めている。

- [skk-dev/dict](https://github.com/skk-dev/dict)（SKK-JISYO.L / requested / JIS3_4）— GPL-2.0-or-later
- [Mozc](https://github.com/google/mozc) の OSS 辞書（IPAdic ほか）— IPAdic のライセンス表示が必要
- [Wikipedia 日本語版](https://ja.wikipedia.org/)の見出し語と読み、麻雀記事でのカタカナ語の出現数（説明文は使っていない）— CC BY-SA 4.0
- そのほか語の存在と読みの確認に使った Web 上の出典は `data/refs.tsv` にある
