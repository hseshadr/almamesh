/**
 * OnDeviceTierCard — capability gating, disclosure-before-download, the
 * download progress state machine, enable-on-success, and the delete flow
 * (Spec 063 D3).
 *
 * probe/preload/delete are injected via props (deterministic, no GPU or
 * network); settings writes hit the REAL localStorage pipeline so the tests
 * prove `{engine:'webllm'}` lands exactly as the enabling contract says.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, act } from '@testing-library/react';

import '../../../i18n/config';
import {
  BLESSED_ONDEVICE_MODELS,
  DEFAULT_ONDEVICE_MODEL,
  LLM_SETTINGS_KEY,
  type LlmStatus,
  type OnDeviceProgress,
  type OnDeviceProgressCallback,
} from '@almamesh/llm';
import { OnDeviceTierCard } from './OnDeviceTierCard';

const NONE_STATUS: LlmStatus = { kind: 'none', label: 'Not set', configured: false };
const ON_DEVICE_STATUS: LlmStatus = { kind: 'on_device', label: 'On-device', configured: true };

const LIGHTER = BLESSED_ONDEVICE_MODELS.find((m) => m.lighter);
if (!LIGHTER) throw new Error('fixture: expected a lighter blessed model');

function readSaved(): Record<string, unknown> {
  const raw = window.localStorage.getItem(LLM_SETTINGS_KEY);
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

const supportedProbe = vi.fn(async () => ({ supported: true }) as const);

describe('OnDeviceTierCard', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });
  afterEach(() => window.localStorage.clear());

  // ── Capability states ─────────────────────────────────────────────────────

  it.each([
    ['no_webgpu', 'no WebGPU'],
    ['no_adapter', 'no graphics adapter'],
    ['adapter_error', 'graphics-adapter check failed'],
  ] as const)('unsupported (%s) → honest reason copy, no download button', async (reason, phrase) => {
    render(
      <OnDeviceTierCard
        status={NONE_STATUS}
        onChanged={vi.fn()}
        probeFn={vi.fn(async () => ({ supported: false, reason }) as const)}
        preloadFn={vi.fn()}
        deleteFn={vi.fn()}
      />,
    );
    const card = await screen.findByTestId('ondevice-unsupported');
    expect(card.textContent).toContain("On-device AI isn't available");
    expect(card.textContent).toContain(phrase);
    expect(screen.queryByTestId('ondevice-download')).toBeNull();
  });

  it('supported → blessed-model picker with sizes, Qwen3 default-selected', async () => {
    render(
      <OnDeviceTierCard
        status={NONE_STATUS}
        onChanged={vi.fn()}
        probeFn={supportedProbe}
        preloadFn={vi.fn()}
        deleteFn={vi.fn()}
      />,
    );
    const defaultRadio = (await screen.findByTestId(
      `ondevice-model-${DEFAULT_ONDEVICE_MODEL}`,
    )) as HTMLInputElement;
    expect(defaultRadio.checked).toBe(true);
    // Both blessed models are offered, with their download sizes.
    for (const m of BLESSED_ONDEVICE_MODELS) {
      expect(screen.getByTestId(`ondevice-model-${m.id}`)).toBeTruthy();
      expect(screen.getByText(new RegExp(`${m.downloadMB} MB download`))).toBeTruthy();
    }
  });

  // ── Disclosure BEFORE download ────────────────────────────────────────────

  it('renders the size-interpolated disclosure while the download button is still idle', async () => {
    render(
      <OnDeviceTierCard
        status={NONE_STATUS}
        onChanged={vi.fn()}
        probeFn={supportedProbe}
        preloadFn={vi.fn()}
        deleteFn={vi.fn()}
      />,
    );
    const disclosure = await screen.findByTestId('ondevice-disclosure');
    // The default pick (Qwen3 968 MB), the source host, and the offline promise
    // are all disclosed BEFORE any byte moves.
    expect(disclosure.textContent).toContain('968');
    expect(disclosure.textContent).toContain('huggingface.co');
    expect(disclosure.textContent).toMatch(/offline/i);
    expect(screen.getByTestId('ondevice-download')).toBeTruthy();
  });

  it('the disclosure re-interpolates when the lighter model is selected', async () => {
    render(
      <OnDeviceTierCard
        status={NONE_STATUS}
        onChanged={vi.fn()}
        probeFn={supportedProbe}
        preloadFn={vi.fn()}
        deleteFn={vi.fn()}
      />,
    );
    fireEvent.click(await screen.findByTestId(`ondevice-model-${LIGHTER.id}`));
    expect(screen.getByTestId('ondevice-disclosure').textContent).toContain(String(LIGHTER.downloadMB));
  });

  it('states the v1 scope honestly: chat + interview, reading needs cloud/local', async () => {
    render(
      <OnDeviceTierCard
        status={NONE_STATUS}
        onChanged={vi.fn()}
        probeFn={supportedProbe}
        preloadFn={vi.fn()}
        deleteFn={vi.fn()}
      />,
    );
    const scope = await screen.findByTestId('ondevice-scope');
    expect(scope.textContent).toContain('chat and the interview');
    expect(scope.textContent).toMatch(/cloud or local endpoint/);
  });

  // ── Download state machine ────────────────────────────────────────────────

  it('download: progress phases + %, then success writes {engine:"webllm", model} and notifies', async () => {
    const onChanged = vi.fn();
    let emit: OnDeviceProgressCallback = () => {};
    let finish: () => void = () => {};
    const preloadFn = vi.fn(
      (_id: string, onProgress?: OnDeviceProgressCallback) =>
        new Promise<void>((resolve) => {
          emit = onProgress ?? emit;
          finish = resolve;
        }),
    );
    render(
      <OnDeviceTierCard
        status={NONE_STATUS}
        onChanged={onChanged}
        probeFn={supportedProbe}
        preloadFn={preloadFn}
        deleteFn={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByTestId('ondevice-download'));
    await waitFor(() => expect(preloadFn).toHaveBeenCalledWith(DEFAULT_ONDEVICE_MODEL, expect.any(Function)));

    // download phase at 42%
    act(() => emit({ phase: 'download', progress: 0.42, text: 'Fetching param cache' } satisfies OnDeviceProgress));
    const progressEl = screen.getByTestId('ondevice-progress');
    expect(progressEl.textContent).toContain('Downloading model');
    expect(screen.getByTestId('ondevice-progress-percent').textContent).toBe('42%');
    // a11y: the bar is a real progressbar with a live value for screen readers.
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('42');
    // the button is gone while downloading — no double-start
    expect(screen.queryByTestId('ondevice-download')).toBeNull();

    // load phase at 90%
    act(() => emit({ phase: 'load', progress: 0.9, text: 'Loading GPU' } satisfies OnDeviceProgress));
    expect(screen.getByTestId('ondevice-progress').textContent).toContain('Loading into GPU memory');
    expect(screen.getByTestId('ondevice-progress-percent').textContent).toBe('90%');

    // success → the enabling write is exactly {engine:'webllm', model:<id>}
    await act(async () => {
      finish();
      await Promise.resolve();
    });
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    const saved = readSaved();
    expect(saved.engine).toBe('webllm');
    expect(saved.model).toBe(DEFAULT_ONDEVICE_MODEL);
    // Belt-and-braces vs a stale per-tier chatModel (writeLlmSettings MERGES,
    // so a leftover cloud/Ollama chatModel would otherwise survive and target a
    // nonexistent MLC record): enabling on-device pins the chat tier too.
    expect(saved.chatModel).toBe(DEFAULT_ONDEVICE_MODEL);
  });

  it('downloads the LIGHTER model when it is the selected one', async () => {
    const preloadFn = vi.fn(async () => {});
    render(
      <OnDeviceTierCard
        status={NONE_STATUS}
        onChanged={vi.fn()}
        probeFn={supportedProbe}
        preloadFn={preloadFn}
        deleteFn={vi.fn()}
      />,
    );
    fireEvent.click(await screen.findByTestId(`ondevice-model-${LIGHTER.id}`));
    fireEvent.click(screen.getByTestId('ondevice-download'));
    await waitFor(() => expect(preloadFn).toHaveBeenCalledWith(LIGHTER.id, expect.any(Function)));
    await waitFor(() => expect(readSaved().model).toBe(LIGHTER.id));
    expect(readSaved().chatModel).toBe(LIGHTER.id);
  });

  it('requests persistent storage when the download starts', async () => {
    const persist = vi.fn(async () => true);
    Object.defineProperty(window.navigator, 'storage', {
      configurable: true,
      value: { persist },
    });
    try {
      render(
        <OnDeviceTierCard
          status={NONE_STATUS}
          onChanged={vi.fn()}
          probeFn={supportedProbe}
          preloadFn={vi.fn(async () => {})}
          deleteFn={vi.fn()}
        />,
      );
      fireEvent.click(await screen.findByTestId('ondevice-download'));
      await waitFor(() => expect(persist).toHaveBeenCalled());
    } finally {
      // jsdom has no navigator.storage by default — restore that.
      delete (window.navigator as { storage?: unknown }).storage;
    }
  });

  it('download failure → honest error copy, NOTHING enabled', async () => {
    const onChanged = vi.fn();
    render(
      <OnDeviceTierCard
        status={NONE_STATUS}
        onChanged={onChanged}
        probeFn={supportedProbe}
        preloadFn={vi.fn(async () => {
          throw new Error('network down');
        })}
        deleteFn={vi.fn()}
      />,
    );
    fireEvent.click(await screen.findByTestId('ondevice-download'));
    const error = await screen.findByTestId('ondevice-error');
    expect(error.textContent).toMatch(/Nothing was enabled/);
    // a11y: a failure note interrupts (alert), it does not whisper (status).
    expect(error.getAttribute('role')).toBe('alert');
    expect(readSaved().engine).toBeUndefined();
    expect(onChanged).not.toHaveBeenCalled();
    // The button is back for a retry.
    expect(screen.getByTestId('ondevice-download')).toBeTruthy();
  });

  // ── Enabled + delete flow ─────────────────────────────────────────────────

  it('enabled state shows the active model and the remove action', async () => {
    window.localStorage.setItem(
      LLM_SETTINGS_KEY,
      JSON.stringify({ engine: 'webllm', model: DEFAULT_ONDEVICE_MODEL }),
    );
    render(
      <OnDeviceTierCard
        status={ON_DEVICE_STATUS}
        onChanged={vi.fn()}
        probeFn={supportedProbe}
        preloadFn={vi.fn()}
        deleteFn={vi.fn()}
        hasCachedFn={vi.fn(async () => true)}
      />,
    );
    const enabledEl = await screen.findByTestId('ondevice-enabled');
    expect(enabledEl.textContent).toContain('On-device AI is active');
    expect(enabledEl.textContent).toContain('Qwen3 1.7B');
    expect(screen.getByTestId('tier-ondevice-active')).toBeTruthy();
    expect(screen.getByTestId('ondevice-remove')).toBeTruthy();
  });

  // ── F2: the flag can exist WITHOUT the weights (Backup & Restore into a
  //    fresh browser) — the enabled copy must never claim offline readiness
  //    it cannot deliver. ─────────────────────────────────────────────────

  it('enabled + weights VERIFIED in cache → the offline-ready claim stands', async () => {
    window.localStorage.setItem(
      LLM_SETTINGS_KEY,
      JSON.stringify({ engine: 'webllm', model: DEFAULT_ONDEVICE_MODEL }),
    );
    render(
      <OnDeviceTierCard
        status={ON_DEVICE_STATUS}
        onChanged={vi.fn()}
        probeFn={supportedProbe}
        preloadFn={vi.fn()}
        deleteFn={vi.fn()}
        hasCachedFn={vi.fn(async () => true)}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('ondevice-enabled-body').textContent).toMatch(
        /cached on this device/,
      ),
    );
  });

  it('enabled + weights MISSING (restored backup) → honest copy + re-download affordance', async () => {
    window.localStorage.setItem(
      LLM_SETTINGS_KEY,
      JSON.stringify({ engine: 'webllm', model: DEFAULT_ONDEVICE_MODEL }),
    );
    const preloadFn = vi.fn(async () => {});
    render(
      <OnDeviceTierCard
        status={ON_DEVICE_STATUS}
        onChanged={vi.fn()}
        probeFn={supportedProbe}
        preloadFn={preloadFn}
        deleteFn={vi.fn()}
        hasCachedFn={vi.fn(async () => false)}
      />,
    );
    const redownload = await screen.findByTestId('ondevice-redownload');
    const body = screen.getByTestId('ondevice-enabled-body');
    expect(body.textContent).toMatch(/aren't downloaded on this device yet/);
    // The false "even offline" promise is gone in this state.
    expect(body.textContent).not.toMatch(/even offline/);
    // Recovery: the affordance re-downloads the SAVED model...
    fireEvent.click(redownload);
    await waitFor(() =>
      expect(preloadFn).toHaveBeenCalledWith(DEFAULT_ONDEVICE_MODEL, expect.any(Function)),
    );
    // ...and success restores the verified offline-ready copy.
    await waitFor(() =>
      expect(screen.getByTestId('ondevice-enabled-body').textContent).toMatch(
        /cached on this device/,
      ),
    );
  });

  it('enabled + cache check unavailable → neutral "selected" copy, no offline claim', async () => {
    window.localStorage.setItem(
      LLM_SETTINGS_KEY,
      JSON.stringify({ engine: 'webllm', model: DEFAULT_ONDEVICE_MODEL }),
    );
    render(
      <OnDeviceTierCard
        status={ON_DEVICE_STATUS}
        onChanged={vi.fn()}
        probeFn={supportedProbe}
        preloadFn={vi.fn()}
        deleteFn={vi.fn()}
        hasCachedFn={vi.fn(async () => {
          throw new Error('cache API unavailable');
        })}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('ondevice-enabled-body').textContent).toMatch(
        /is selected for on-device AI/,
      ),
    );
    expect(screen.getByTestId('ondevice-enabled-body').textContent).not.toMatch(/even offline/);
    // Unknown ≠ missing: no re-download nag when we simply could not check.
    expect(screen.queryByTestId('ondevice-redownload')).toBeNull();
  });

  it('remove: deletes the cached weights AND turns the tier off', async () => {
    window.localStorage.setItem(
      LLM_SETTINGS_KEY,
      JSON.stringify({ engine: 'webllm', model: DEFAULT_ONDEVICE_MODEL }),
    );
    const onChanged = vi.fn();
    const deleteFn = vi.fn(async () => {});
    render(
      <OnDeviceTierCard
        status={ON_DEVICE_STATUS}
        onChanged={onChanged}
        probeFn={supportedProbe}
        preloadFn={vi.fn()}
        deleteFn={deleteFn}
        hasCachedFn={vi.fn(async () => true)}
      />,
    );
    fireEvent.click(await screen.findByTestId('ondevice-remove'));
    await waitFor(() => expect(deleteFn).toHaveBeenCalledWith(DEFAULT_ONDEVICE_MODEL));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    const saved = readSaved();
    expect(saved.engine).toBe('');
    expect(saved.model).toBe('');
  });

  it('remove failure: tier still turns off, honest note about the cache', async () => {
    window.localStorage.setItem(
      LLM_SETTINGS_KEY,
      JSON.stringify({ engine: 'webllm', model: DEFAULT_ONDEVICE_MODEL }),
    );
    render(
      <OnDeviceTierCard
        status={ON_DEVICE_STATUS}
        onChanged={vi.fn()}
        probeFn={supportedProbe}
        preloadFn={vi.fn()}
        deleteFn={vi.fn(async () => {
          throw new Error('cache locked');
        })}
        hasCachedFn={vi.fn(async () => true)}
      />,
    );
    fireEvent.click(await screen.findByTestId('ondevice-remove'));
    const error = await screen.findByTestId('ondevice-error');
    expect(error.textContent).toMatch(/turned off/);
    // a11y: failure notes are alerts.
    expect(error.getAttribute('role')).toBe('alert');
    expect(readSaved().engine).toBe('');
  });
});
