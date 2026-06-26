# Security Policy

AlmaMesh is a **local-first, zero-egress** app: the chart engine runs entirely on
the user's device and makes no network calls to draw a chart. There is no server,
no database, and no account system, so the attack surface is deliberately small.
We still take security seriously and welcome responsible disclosure.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security problems.**

Report privately to the maintainer:

- **Email:** [harish.seshadri@gmail.com](mailto:harish.seshadri@gmail.com)
- Use a subject line beginning with `[AlmaMesh security]`.

Please include, as far as you can:

- a description of the issue and its impact,
- the affected component (engine, bundle/signing, in-browser runtime, optional
  LLM path, etc.),
- step-by-step reproduction, and
- any proof-of-concept, logs, or screenshots.

We aim to acknowledge a report within **5 business days** and to keep you updated
as we investigate and fix. Please give us a reasonable window to ship a fix before
any public disclosure; we're happy to credit reporters who would like
acknowledgement.

## Supported versions

AlmaMesh is shipped from `main` as a static PWA. Security fixes land on `main` and
are rolled into the next release; please report against the latest `main` /
released build.

## The signed-bundle / ed25519 trust surface (most security-relevant area)

The one place AlmaMesh trusts delivered bytes is the **signed, content-addressed
edge-proc bundle** (the DE421 ephemeris + the Skyfield/Pyodide wheels + the
`almamesh` wheel + provenance metadata) that the browser syncs once into OPFS.
Its integrity model:

- The bundle is **ed25519-signed** at build time by the `almamesh-bundle`
  publisher CLI.
- The client **pins the ed25519 public verification key** (`public.key`) as its
  trust root, verifies the signature and per-file SHA-256 content hashes, and
  **fails closed** on any mismatch or tampering — a bad bundle is rejected, not
  loaded.
- **The production signing private key is never committed to this repository.** It
  is generated locally (`almamesh-bundle keygen`) and held only by the publisher,
  off-repo and off-CI-by-value. If you ever find a private signing key, an
  `0o600` key file, or any secret committed to the tree or to CI logs, **treat it
  as a vulnerability and report it privately** as above.

Especially interesting reports include: a way to make the client accept an
unsigned, mis-signed, or tampered bundle; a content-hash/signature bypass; a
public-key-pin downgrade or substitution; or any path that turns the
"zero-egress" chart engine into one that exfiltrates birth data.

## Optional AI (LLM) path

AI interpretation and chat are **optional and opt-in**. When enabled they call a
user-configured OpenAI-compatible endpoint (e.g. OpenRouter or a local model),
with PII redaction and a fail-closed `local_only` mode for local endpoints. Any
report of PII leaking to an endpoint the user did not configure, or of the
redaction being bypassed, is in scope.

## Out of scope

- Vulnerabilities in third-party dependencies should be reported upstream
  (we'll happily help coordinate); see
  [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md).
- Issues that require a malicious browser extension, a compromised OS, or
  physical device access are generally out of scope.

Thank you for helping keep AlmaMesh and its users safe.
