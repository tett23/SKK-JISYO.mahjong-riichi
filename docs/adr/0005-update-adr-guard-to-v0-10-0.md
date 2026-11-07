# ADR 0005: adr-guard を v0.10.0 に上げ、ADR の番号の重複と修飾子付きの参照を検査する

ステータス: 採択

## 文脈

[ADR 0004](0004-update-adr-guard-to-v0-8-3.md) で、adr-guard を v0.8.3 に上げた。

その後、tett23/adr-guard は v0.9.0、v0.9.1、v0.10.0 になった。このリポジトリに関わる変更は次のとおり（[リリース v0.9.0](https://github.com/tett23/adr-guard/releases/tag/v0.9.0)、[リリース v0.9.1](https://github.com/tett23/adr-guard/releases/tag/v0.9.1)、[リリース v0.10.0](https://github.com/tett23/adr-guard/releases/tag/v0.10.0)）。

- v0.9.0: 同じディレクトリで番号が重複した ADR を報告する `adr-guard check-numbers` と、重複を直す `adr-guard renumber [--dry-run]` が加わった。action は既定で `check-numbers` を実行し、重複があると CI が失敗する。番号の付けかえを許す `--allow-renumber`（action の入力は `allow-renumber`、既定は false）も加わった（tett23/adr-guard の [ADR 0018「重複したADRの番号の修復」](https://github.com/tett23/adr-guard/blob/main/docs/adr/0018-repair-duplicate-adr-numbers.md)）
- v0.9.1: `renumber` の誤報を直した
- v0.10.0: `ADR NNNN` の直前の語を修飾子として読む。`/` を含む語はディレクトリ、`-` を含む語はモジュール、それ以外の語はそのモジュールがあるときだけ修飾子になる。`links` と pre-commit は、対象のない修飾子付きの参照、リンク先が修飾子の ADR と異なるリンク、リンクの外に出た修飾子を報告する（tett23/adr-guard の [ADR 0019「モジュールで修飾したADRの参照」](https://github.com/tett23/adr-guard/blob/main/docs/adr/0019-module-qualified-adr-references.md)）。シンボリックリンクの `.md` は検査しない（tett23/adr-guard の [ADR 0020「シンボリックリンクの文書を飛ばす」](https://github.com/tett23/adr-guard/blob/main/docs/adr/0020-skip-symlinked-documents.md)）

このリポジトリの ADR は `docs/adr/` だけにあり、モジュールごとの ADR はない。
pre-commit hook と CI のオプション（`--allow-status --allow-links`）は変わらない。
手元の adr-guard はすでに v0.10.0 である。

## 実装すること

- `.github/workflows/ci.yml` の `adr` ジョブの action を `uses: tett23/adr-guard@v0.10.0` にする。ほかの入力（`base`、`head`、`allow-status: true`、`allow-links: true`）はそのまま。`check-numbers` は既定の true のままにし、CI で番号の重複も検査する
- `.githooks/pre-commit` のコマンド（`exec adr-guard pre-commit --allow-status --allow-links`）は変えない
- `README.md` の adr-guard の版を v0.10.0 にし、CI が ADR の番号の重複も検査することを書く
- `docs/specifications.md` の ADR の一覧にこの ADR を加え、[ADR 0004](0004-update-adr-guard-to-v0-8-3.md) のステータスを新しいステータスの行に合わせる
- [ADR 0004](0004-update-adr-guard-to-v0-8-3.md) のステータスを `採択→adr-guard の版は[ADR 0005](0005-update-adr-guard-to-v0-10-0.md)` にする
- `adr-guard links --fix --include-committed` で、v0.10.0 の規則に合わないリンクを直す

## 実装しないこと

- action のほかの入力（`allow-renumber` など）と、pre-commit hook のコマンドの変更
- 修飾子付きの参照の規則を README や仕様に書くこと。このリポジトリにはモジュールごとの ADR がなく、ほかのリポジトリの ADR への参照は外部リンクの中に書いているので、規則が効く箇所がない
- 手元の adr-guard の更新の自動化

## テスト設計

自動テストを書く対象のコードは変えない。変更の後に、次を実際に動かして確かめる。

- `adr-guard links`、`adr-guard check-status`、`adr-guard check-numbers` が終了コード 0 で終わること
- `.github/workflows/ci.yml` が YAML として読めること
- `deno fmt --check`、`deno lint`、`deno task test` が今までどおり通ること
- 各コミットで `.githooks/pre-commit`（手元の adr-guard v0.10.0）が通り、`adr-guard check-range origin/main HEAD --allow-status --allow-links` が終了コード 0 で終わること
- 変更のプルリクエストの CI で、`adr` ジョブが v0.10.0 の action で実行され、成功すること

## トレードオフ

- CI が ADR の番号の重複で失敗するようになる。別々のブランチで同じ番号の ADR を作ると、後からマージする側の CI が失敗する。番号を付けかえる手間は増えるが、重複した番号の ADR が main に入るのを防げる
- 修飾子付きの参照の検査で、ほかのリポジトリの ADR を `owner/repo ADR NNNN` の形で裸に書くと報告される。ほかのリポジトリの ADR は外部リンクの中に書く
- 手元の adr-guard が v0.9.x 以前のままだと、pre-commit hook と CI の結果が食い違うことがある。README の adr-guard の版を v0.10.0 に上げて補う

## 参考文献

- tett23/adr-guard [ADR 0018「重複したADRの番号の修復」](https://github.com/tett23/adr-guard/blob/main/docs/adr/0018-repair-duplicate-adr-numbers.md)
- tett23/adr-guard [ADR 0019「モジュールで修飾したADRの参照」](https://github.com/tett23/adr-guard/blob/main/docs/adr/0019-module-qualified-adr-references.md)
- tett23/adr-guard [ADR 0020「シンボリックリンクの文書を飛ばす」](https://github.com/tett23/adr-guard/blob/main/docs/adr/0020-skip-symlinked-documents.md)
- tett23/adr-guard [リリース v0.9.0](https://github.com/tett23/adr-guard/releases/tag/v0.9.0)
- tett23/adr-guard [リリース v0.9.1](https://github.com/tett23/adr-guard/releases/tag/v0.9.1)
- tett23/adr-guard [リリース v0.10.0](https://github.com/tett23/adr-guard/releases/tag/v0.10.0)
