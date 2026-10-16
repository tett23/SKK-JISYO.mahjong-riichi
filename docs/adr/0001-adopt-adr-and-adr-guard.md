# ADR 0001: ADR の運用と adr-guard を導入する

ステータス: 採択→adr-guard の版と --allow-links で許可する変更は[ADR 0003](0003-update-adr-guard-to-v0-8-2.md)

## 文脈

v0.0.2 までの設計と収録基準は、`docs/design.md` と `docs/criteria.md` に直接書き、必要に応じて書きかえてきた。
決定の経緯はコミットログと会話にしか残っておらず、どの時点で何を決めたかを文書から追えない。

今後は、設計判断を ADR（`docs/adr/`）として記録し、一度コミットした ADR はステータスの行を除いて変更しない運用にする。
この規則を手作業だけで守るのは難しいので、[adr-guard](https://github.com/tett23/adr-guard)（v0.8.1）で、
git の pre-commit hook と CI の二か所で強制する。Claude Code の hook は利用者の全体の設定（`~/.claude/settings.json`）で有効になっているので、このリポジトリには置かない。

あわせて、仕様の置き場所を `docs/specifications.md` の 1 つにまとめる。
ADR は決定の差分、`docs/specifications.md` はその時点の仕様の全体であり、main では常に最新に保つ。

## 実装すること

### ADR の置き場所と書式

- ADR は `docs/adr/` に置く。ファイル名は `0001-adopt-adr-and-adr-guard.md` のように、4 桁の連番と kebab-case の名前にする
- ADR は次の節を持つ。データ構造やアルゴリズムを変える場合はその節も立てる。仕様検討のログとして残すべきことがあれば節を足す
  - 見出し `# ADR NNNN: タイトル`
  - `ステータス:` の行（ちょうど 1 行。値は `提案`、`採択`、`採択→ADR NNNN`、`採択→○○（変更部分）は ADR NNNN`、`却下`、`破棄` など）
  - `## 文脈`、`## 実装すること`、`## 実装しないこと`、`## テスト設計`、`## トレードオフ`
- ADR は作成時点ではコミットせず、人間のレビューを受けてから、ステータスを `採択` にしてコミットする
- 一度コミットした ADR は、ステータスの行と ADR の参照のリンクを除いて変更しない。仕様を変える場合は新しい ADR を作る
- ADR を破棄する場合は、ステータスを `破棄` にし、理由を `docs/specifications.md` に書く

### 仕様（docs/specifications.md）

- `docs/design.md` と `docs/criteria.md` の内容を `docs/specifications.md` にまとめ、2 つのファイルは削除する。内容は変えず、見出しの階層だけを合わせる
- `docs/specifications.md` の冒頭に、v0.0.2 までの決定は ADR を経ていないこと、以後の変更は ADR で行うことを書く
- `docs/specifications.md` から ADR を示すときは、リンクを付ける
- ADR で仕様が変わったら、同じ変更で `docs/specifications.md` と `README.md` も直す
- `README.md` と `data/mahjong.tsv` の注釈など、`docs/design.md`・`docs/criteria.md` を参照している箇所を `docs/specifications.md` に向ける

### adr-guard

- `.githooks/pre-commit` を置き、実行権限を付ける

  ```sh
  #!/bin/sh
  exec adr-guard pre-commit --allow-status --allow-links
  ```

  ステータスの行の変更（採択など）とリンクの付けかえを許すため、`--allow-status --allow-links` を付ける
- `README.md` に、clone ごとに `git config core.hooksPath .githooks` を実行する手順と、adr-guard のインストール方法へのリンクを書く
- CI（`.github/workflows/ci.yml`）に `adr` ジョブを足す。adr-guard の README の例のとおり、`tett23/adr-guard@v0.8.1` を `fetch-depth: 0` のチェックアウトで使い、`allow-status: true`、`allow-links: true` を付ける

### GitHub Actions の版

- 利用者の規則（Node 24 以降で動く最新のメジャー版を使う）に合わせ、既存のワークフロー（`ci.yml`、`release.yml`）の action を上げる
  - `actions/checkout@v4` → `@v7`
  - `actions/cache@v4` → `@v6`
  - `actions/upload-artifact@v4` → `@v7`
  - `denoland/setup-deno@v2` はそのまま（v2 が Node 24 で動く最新のメジャー版）

## 実装しないこと

- v0.0.2 までの決定を、さかのぼって ADR にすること。`docs/specifications.md` をそのときの仕様の出発点とする
- Claude Code の hook（`.claude/settings.json`）。利用者の全体の設定で有効になっているため
- リリースノートの書式の変更（英語化、「追加」「変更」「削除」「修正」への分類、コミットへのリンク）。利用者の規則に合わせる必要があるが、`scripts/release_notes.ts` の仕様の変更になるので、別の ADR で扱う
- コミットログの英語化の規則を文書に書くこと。利用者の全体の規則であり、このリポジトリの仕様ではない

## テスト設計

自動テストを書く対象のコードは変えない（`deno task test` が今までどおり通ることだけを確かめる）。導入の後に、次を実際に動かして確かめる。

1. `adr-guard check-status` と `adr-guard links` が終了コード 0 で終わる
2. `git config core.hooksPath .githooks` の後、次がそれぞれ期待どおりになる（確かめた後、作業ツリーとインデックスは元に戻す）
   - コミット済みの ADR 0001 の本文を 1 行書きかえて `git commit` すると、pre-commit hook が拒否する
   - ADR 0001 のステータスの行だけを書きかえて `git commit` すると、通る（実際にはコミットせず、hook の終了コードだけを見る）
   - 新しい ADR（例：`docs/adr/0002-example.md`）を足すと、通る
3. `docs/specifications.md` にある `ADR NNNN` の参照がすべてリンクになっている（`adr-guard links` で確かめる）
4. push の後、CI の `build` と `adr` のジョブが成功する
5. `docs/design.md` と `docs/criteria.md` を参照する箇所が残っていない（`grep -rn "design.md\|criteria.md"` が、ADR 0001 自身を除いて何も出さない）

## トレードオフ

- 2 つの文書を `docs/specifications.md` の 1 つにまとめると、ファイルが長くなる（目安 400 行）。一方で、仕様の置き場所が 1 つに決まり、ADR から「どこを直すか」が迷わない
- adr-guard が手元に無いと、pre-commit hook はコミットを拒否する。導入の手順を README に書き、CI でも検査するので、hook を通らない変更（Web UI での編集など）も検出できる
- ADR をコミット前にレビューする運用は、語の追加のような小さな変更にも ADR が要るかという問題を生む。語の追加・削除は `docs/specifications.md` の収録基準に従う限り仕様の変更ではないので、ADR は要らないとする。収録基準そのものを変える場合は ADR を書く
