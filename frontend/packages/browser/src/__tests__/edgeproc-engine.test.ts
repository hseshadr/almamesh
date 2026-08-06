import { describe, expect, it } from "vitest";

import {
  canPromotePointer,
  EngineClient,
  IntegrityError,
  MemoryCacheStore,
  selectHighestPointer,
  sha256Hex,
  SignatureError,
  syncIndex,
  verifyEd25519,
  verifyPlaintext,
  type VersionPointer,
} from "@edgeproc/browser";

// Proves the published @edgeproc/browser dependency (the edge-proc sync
// substrate) resolves and runs from inside @almamesh/browser — the foundation
// P2.3+ build the Pyodide chart compute on top of.
describe("@edgeproc/browser package dependency", () => {
  it("exposes the worker-backed sync client and the sync state machine", () => {
    expect(typeof EngineClient.spawn).toBe("function");
    expect(typeof syncIndex).toBe("function");
  });

  it("runs the in-memory content-addressed store: a fresh store has no active version", async () => {
    const store = new MemoryCacheStore();

    expect(await store.readActive()).toBeNull();
  });
});

// AlmaMesh's whole "no backend" claim rests on the substrate REFUSING a bundle
// it cannot prove: sha256 content-addressing, ed25519 signatures, and
// anti-rollback. Until this PR those properties were covered by the vendored
// copy's own 27-file suite, which ran inside `frontend`'s gate. The substrate
// is now an external package whose suite runs in ITS repo, not here — so these
// tests exist to keep the properties AlmaMesh depends on asserted from
// AlmaMesh's side, against the real published artefact.
//
// Every case below breaks the property (flips a byte, forges a signature,
// replays an older sequence) rather than re-checking the happy path, because a
// guard nobody has watched refuse is not evidence that it refuses.
describe("@edgeproc/browser fail-closed guarantees (as consumed by AlmaMesh)", () => {
  const bytesOf = (text: string): Uint8Array => new TextEncoder().encode(text);

  it("computes the sha256 the content-address rule is built on", async () => {
    // Pinned against the published SHA-256 of the empty input, not against
    // another call to sha256Hex — a hash asserted only against itself would
    // pass even if this were a stub returning a constant.
    expect(await sha256Hex(new Uint8Array())).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("accepts plaintext whose sha256 matches its content address", async () => {
    const plaintext = bytesOf("almamesh signed bundle chunk");

    await expect(
      verifyPlaintext(await sha256Hex(plaintext), plaintext),
    ).resolves.toBeUndefined();
  });

  it("REFUSES plaintext with a single flipped byte (content-address check)", async () => {
    const plaintext = bytesOf("almamesh signed bundle chunk");
    const address = await sha256Hex(plaintext);
    const tampered = Uint8Array.from(plaintext);
    tampered[0] ^= 0x01;

    await expect(verifyPlaintext(address, tampered)).rejects.toBeInstanceOf(
      IntegrityError,
    );
  });

  it("REFUSES a malformed ed25519 signature rather than treating it as unverified-but-ok", async () => {
    const publicKey = new Uint8Array(32); // structurally valid length, not a real key
    const message = bytesOf("almamesh-constructs/stable");

    await expect(
      verifyEd25519(publicKey, message, "not-base64-at-all"),
    ).rejects.toBeInstanceOf(SignatureError);
  });

  const pointer = (over: Partial<VersionPointer>): VersionPointer =>
    ({
      manifest_hash: "a".repeat(64),
      version: "v2",
      bundle_id: "almamesh-constructs",
      channel: "stable",
      sequence: 2,
      signature: "",
      ...over,
    }) as VersionPointer;

  it("REFUSES promoting an older sequence over the active pointer (anti-rollback)", () => {
    const active = pointer({});
    const replayed = pointer({ sequence: 1, version: "v1" });

    expect(canPromotePointer(active, replayed)).toBe(false);
  });

  it("REFUSES a fork that equivocates at the SAME sequence", () => {
    const active = pointer({});
    const fork = pointer({ manifest_hash: "b".repeat(64) });

    expect(canPromotePointer(active, fork)).toBe(false);
  });

  it("allows a genuinely newer sequence, so the refusals above are not vacuous", () => {
    expect(canPromotePointer(pointer({}), pointer({ sequence: 3 }))).toBe(true);
  });

  it("ignores a torn/corrupt durable slot when choosing the newest pointer", () => {
    const good = pointer({ sequence: 5 });

    expect(
      selectHighestPointer([null, pointer({ sequence: -1 }), good]),
    ).toEqual(good);
  });
});
