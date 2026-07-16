import { describe, expect, it, vi } from 'vitest';

import { safeError, safeWarn } from './safeDiagnostics';

describe('privacy-safe diagnostics', () => {
  it('emits only an allowlisted code and never serializes a raw cause', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const secret = new Error('Asha private narrative sk-live-secret');

    safeError('feedback.turnstile_init_failed', secret);
    safeWarn('geo.online_lookup_failed', secret);

    expect(error).toHaveBeenCalledWith('[almamesh:error:feedback.turnstile_init_failed]');
    expect(warn).toHaveBeenCalledWith('[almamesh:warn:geo.online_lookup_failed]');
    expect(JSON.stringify([...error.mock.calls, ...warn.mock.calls])).not.toMatch(
      /Asha|private narrative|sk-live-secret/,
    );
  });
});
