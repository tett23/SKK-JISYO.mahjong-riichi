# ADR 0004: adr-guard を v0.8.3 に上げ、採択（未実装）のステータスを使えるようにする

ステータス: 採択

## 文脈

[ADR 0003](0003-update-adr-guard-to-v0-8-2.md) で、adr-guard を v0.8.2 に上げた。

その後、tett23/adr-guard は v0.8.3 になった。このリポジトリに関わる変更は次のとおり（tett23/adr-guard の [ADR 0016「採択（未実装）のステータス」](https://github.com/tett23/adr-guard/blob/main/docs/adr/0016-accepted-not-implemented-status.md)、[リリース](https://github.com/tett23/adr-guard/releases/tag/v0.8.3)）。

- 新しいステータス `採択（未実装）`（括弧は全角・半角のどちらでもよい。英語では `Accepted (not implemented)`）。採択されたが、まだ実装されていない ADR を表す
- 新しいサブコマンド `adr-guard unimplemented [--status]`。ステータスが `採択（未実装）` の ADR を一覧する

pre-commit hook と CI のオプション（`--allow-status --allow-links`）は変わらない。
手元の adr-guard はすでに v0.8.3 である。

## 実装すること

- `.github/workflows/ci.yml` の `adr` ジョブの action を `uses: tett23/adr-guard@v0.8.3` にする。ほかの入力（`base`、`head`、`allow-status: true`、`allow-links: true`）はそのまま
- `.githooks/pre-commit` のコマンド（`exec adr-guard pre-commit --allow-status --allow-links`）は変えない
- `README.md` の adr-guard の版を v0.8.3 にする
- `docs/specifications.md` の ADR の一覧にこの ADR を加え、[ADR 0003](0003-update-adr-guard-to-v0-8-2.md) のステータスを新しいステータスの行に合わせる
- [ADR 0003](0003-update-adr-guard-to-v0-8-2.md) のステータスを `採択→adr-guard の版は[ADR 0004](0004-update-adr-guard-to-v0-8-3.md)` にする
- `adr-guard links --fix --include-committed` で、ADR の参照をリンクにする

## 実装しないこと

- action のほかの入力と、pre-commit hook のコマンドの変更
- ステータスの候補の一覧を README や仕様に書くこと。いまの文書はステータスの候補を列挙していないので、`採択（未実装）` を足す箇所がない
- ADR のステータスの書式を検査するテストの追加。このリポジトリには ADR のステータスを検査するテストがない
- 手元の adr-guard の更新の自動化

## テスト設計

自動テストを書く対象のコードは変えない。変更の後に、次を実際に動かして確かめる。

- `adr-guard links` と `adr-guard check-status` が終了コード 0 で終わること
- `.github/workflows/ci.yml` が YAML として読めること
- `deno fmt --check`、`deno lint`、`deno task test` が今までどおり通ること
- 各コミットで `.githooks/pre-commit`（手元の adr-guard v0.8.3）が通り、`adr-guard check-range origin/main HEAD --allow-status --allow-links` が終了コード 0 で終わること
- 変更のプルリクエストの CI で、`adr` ジョブが v0.8.3 の action で実行され、成功すること

## トレードオフ

- 手元の adr-guard が v0.8.2 以前のままだと、`採択（未実装）` のステータスや `adr-guard unimplemented` を使えない。README の adr-guard の版を v0.8.3 に上げて補う
- `採択` と `採択（未実装）` の使い分けが増える。このリポジトリでは ADR と実装を同じプルリクエストで入れることが多いので、当面は `採択` を使い、実装を後回しにする ADR にだけ `採択（未実装）` を使う

## 参考文献

- tett23/adr-guard [ADR 0016「採択（未実装）のステータス」](https://github.com/tett23/adr-guard/blob/main/docs/adr/0016-accepted-not-implemented-status.md)
- tett23/adr-guard [リリース v0.8.3](https://github.com/tett23/adr-guard/releases/tag/v0.8.3)
