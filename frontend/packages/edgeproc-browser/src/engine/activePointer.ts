import type { VersionPointer } from "./types";

const SHA256 = /^[0-9a-f]{64}$/u;

export function parseStoredPointer(value: unknown): VersionPointer | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return null;
	}
	const pointer = value as VersionPointer;
	return safeSequence(pointer) && signedIdentity(pointer) ? pointer : null;
}

function safeSequence(pointer: VersionPointer): boolean {
	return Number.isSafeInteger(pointer.sequence) && pointer.sequence >= 0;
}

function signedIdentity(pointer: VersionPointer): boolean {
	return (
		SHA256.test(pointer.manifest_hash) &&
		boundedString(pointer.version, 200) &&
		boundedString(pointer.signature, 512) &&
		optionalString(pointer.bundle_id) &&
		optionalString(pointer.channel)
	);
}

function boundedString(value: unknown, maximum: number): boolean {
	return typeof value === "string" && value.length > 0 && value.length <= maximum;
}

function optionalString(value: unknown): boolean {
	return value == null || typeof value === "string";
}
