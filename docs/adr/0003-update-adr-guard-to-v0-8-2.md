# ADR 0003: adr-guard を v0.8.2 に上げ、コミット済みの ADR のリンクだけの変更を許可する

ステータス: 採択→adr-guard の版は[ADR 0004](0004-update-adr-guard-to-v0-8-3.md)

## 文脈

[ADR 0001](0001-adopt-adr-and-adr-guard.md) で、adr-guard（v0.8.1）を導入した。
pre-commit hook と CI には `--allow-status --allow-links` を付け、コミット済みの ADR はステータスの行と ADR の参照のリンクを除いて変更しないことにした。

その後、tett23/adr-guard は v0.8.2 になった。このリポジトリに関わる変更は次のとおり（tett23/adr-guard の [ADR 0015](https://github.com/tett23/adr-guard/blob/main/docs/adr/0015-allow-link-changes.md)、[リリース](https://github.com/tett23/adr-guard/releases/tag/v0.8.2)）。

- `--allow-links` が、ADR の参照のリンクに限らず、コミット済みの ADR の「リンクだけの変更」全般を許可する。インラインリンクと参照形式のリンクの追加・削除・リンク先の変更、画像のリンク先の変更、リンクの参照定義の行（`[1]: url`）の変更が通る
- リンクのテキストの変更、画像の追加・削除、自動リンク（`<url>`）や本文の URL の変更は、引き続き拒否する
- 記録のディレクトリ（`docs/audit/` など）は、引き続き完全に保護する

このリポジトリでは、hook と CI がすでに `--allow-links` を付けているので、オプションを変えずに許可の範囲だけが広がる。
手元の adr-guard はすでに v0.8.2 である。

## 実装すること

- `.github/workflows/ci.yml` の `adr` ジョブの action を `uses: tett23/adr-guard@v0.8.2` にする。ほかの入力（`base`、`head`、`allow-status: true`、`allow-links: true`）はそのまま
- `.githooks/pre-commit` のコマンド（`exec adr-guard pre-commit --allow-status --allow-links`）は変えない
- `README.md` の adr-guard の版を v0.8.2 にし、コミット済みの ADR で許される変更を「ステータスの行とリンクだけの変更」にする
- `docs/specifications.md` の ADR の一覧にこの ADR を加え、[ADR 0001](0001-adopt-adr-and-adr-guard.md) のステータスを新しいステータスの行に合わせる
- [ADR 0001](0001-adopt-adr-and-adr-guard.md) のステータスを `採択→adr-guard の版と --allow-links で許可する変更は[ADR 0003](0003-update-adr-guard-to-v0-8-2.md)` にする
- `adr-guard links --fix --include-committed` で、ADR の参照をリンクにする

## 実装しないこと

- action のほかの入力と、pre-commit hook のコマンドの変更
- 既存の ADR の本文のリンクの付けかえ。v0.8.2 で許可されるようになったが、いま直す必要のあるリンクはない
- 手元の adr-guard の更新の自動化

## テスト設計

自動テストを書く対象のコードは変えない。変更の後に、次を実際に動かして確かめる。

- `adr-guard links` と `adr-guard check-status` が終了コード 0 で終わること
- `.github/workflows/ci.yml` が YAML として読めること
- `deno fmt --check`、`deno lint`、`deno task test` が今までどおり通ること
- 各コミットで `.githooks/pre-commit`（手元の adr-guard v0.8.2）が通り、`adr-guard check-range origin/main HEAD --allow-status --allow-links` が終了コード 0 で終わること
- 変更のプルリクエストの CI で、`adr` ジョブが v0.8.2 の action で実行され、成功すること

## トレードオフ

- 手元の adr-guard が v0.8.1 のままだと、v0.8.2 で許可されたリンクの変更（ADR の参照以外のリンクの付けかえなど）を手元の hook が拒否する。README の adr-guard の版を v0.8.2 に上げて補う
- コミット済みの ADR のリンク先を変えられるようになるので、リンク先の差しかえで ADR の参照先の意味が変わりうる。リンクのテキストは変えられないこと、変更はレビューを経ることで補う

## 参考文献

- tett23/adr-guard [ADR 0015](https://github.com/tett23/adr-guard/blob/main/docs/adr/0015-allow-link-changes.md)
- tett23/adr-guard [リリース v0.8.2](https://github.com/tett23/adr-guard/releases/tag/v0.8.2)
