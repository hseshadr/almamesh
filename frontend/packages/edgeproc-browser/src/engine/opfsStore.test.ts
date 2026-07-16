import { describe, expect, it } from "vitest";
import { canPromotePointer, selectHighestPointer } from "./opfsStore";
import type { VersionPointer } from "./types";

const pointer = (sequence: number, manifestHash = "a".repeat(64)): VersionPointer => ({
	manifest_hash: manifestHash,
	version: `v${sequence}`,
	bundle_id: "bundle",
	channel: "stable",
	sequence,
	signature: "signed",
});

describe("durable OPFS active pointer selection", () => {
	it("keeps the newest valid slot when another slot is torn", () => {
		expect(
			selectHighestPointer([pointer(4), null, pointer(3)])?.sequence,
		).toBe(4);
	});

	it("rejects stale and equal-sequence equivocation during promotion", () => {
		const current = pointer(7);
		expect(canPromotePointer(current, pointer(6))).toBe(false);
		expect(canPromotePointer(current, pointer(7, "b".repeat(64)))).toBe(false);
		expect(canPromotePointer(current, pointer(8))).toBe(true);
	});
});
