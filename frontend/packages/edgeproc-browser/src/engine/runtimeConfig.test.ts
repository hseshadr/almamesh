import { afterEach, describe, expect, it } from "vitest";

import { configFromEnv } from "./runtime";

/**
 * REGRESSION: the pinned verify key must resolve to the app origin's ROOT
 * (`/public.key`) regardless of the route the document loaded on. Resolving
 * against `document.baseURI` turned a hard load of a nested route into a
 * request for `/<route>/public.key`, which an SPA fallback answers with
 * index.html — so bundle signature verification fails closed and the engine
 * never boots from a deep link.
 */
describe("configFromEnv pubkeyUrl", () => {
	afterEach(() => {
		window.history.pushState({}, "", "/");
	});

	it("resolves the verify key to /public.key from a nested route", () => {
		window.history.pushState({}, "", "/rectify/some-profile-id");
		const url = new URL(configFromEnv().pubkeyUrl);
		expect(url.pathname).toBe("/public.key");
		expect(url.origin).toBe(window.location.origin);
	});

	it("resolves the verify key to /public.key from the root route", () => {
		const url = new URL(configFromEnv().pubkeyUrl);
		expect(url.pathname).toBe("/public.key");
		expect(url.origin).toBe(window.location.origin);
	});
});
