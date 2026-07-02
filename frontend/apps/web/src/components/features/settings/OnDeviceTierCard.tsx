/**
 * OnDeviceTierCard — the "On-device AI (private, beta)" tier (Spec 063 D3).
 *
 * Capability-probed: WebGPU feature detection decides between an honest
 * "not available on this device" state (typed reason copy, no dead buttons)
 * and the blessed-model picker. The download is disclosed BEFORE it starts
 * (size + huggingface.co source + cached-on-device + offline-afterwards) and
 * streams typed progress (phase + %). Success writes `{engine:'webllm'}` via
 * writeLlmSettings — selecting the tier IS enabling it. "Remove downloaded
 * model" frees the WebLLM cache and turns the tier off.
 *
 * Scope honesty: the card states plainly that on-device AI serves chat + the
 * rectification interview; the full written reading needs a cloud or local
 * endpoint (the v1 scope fence).
 *
 * INJECTION — probe/preload/delete default to the real @almamesh/llm
 * implementations but are replaceable via props for deterministic tests
 * (mirrors ConversationalAccelerator's streamFn/gatherFn pattern).
 */
import type { ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BLESSED_ONDEVICE_MODELS,
  DEFAULT_ONDEVICE_MODEL,
  deleteCachedModel as defaultDeleteFn,
  preloadOnDeviceModel as defaultPreloadFn,
  probeOnDeviceCapability as defaultProbeFn,
  readLlmSettings,
  writeLlmSettings,
  type LlmStatus,
  type OnDeviceCapability,
  type OnDeviceProgress,
} from '@almamesh/llm';

export interface OnDeviceTierCardProps {
  /** The saved provider status (drives the Active/enabled state). */
  readonly status: LlmStatus;
  /** Invoked after settings change (enable / remove) so the parent refreshes. */
  readonly onChanged: () => void;
  /** Injectable capability probe — defaults to the real WebGPU detection. */
  readonly probeFn?: typeof defaultProbeFn;
  /** Injectable model preloader — defaults to the real WebLLM download. */
  readonly preloadFn?: typeof defaultPreloadFn;
  /** Injectable cache remover — defaults to the real WebLLM cache delete. */
  readonly deleteFn?: typeof defaultDeleteFn;
}

type CardBusy = 'idle' | 'downloading' | 'removing';

/** The saved on-device model id (blessed default when none picked yet). */
function savedModelId(): string {
  return readLlmSettings().model || DEFAULT_ONDEVICE_MODEL;
}

/** Human label for a model id — the blessed label, or the raw id. */
function modelLabel(id: string): string {
  return BLESSED_ONDEVICE_MODELS.find((m) => m.id === id)?.label ?? id;
}

/**
 * Best-effort persistent-storage request so the browser does not evict the
 * ~1 GB of cached weights under storage pressure. Failure is non-fatal.
 */
async function requestPersistentStorage(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    // Best-effort only; WebLLM still caches without the persistence grant.
  }
}

export function OnDeviceTierCard({
  status,
  onChanged,
  probeFn = defaultProbeFn,
  preloadFn = defaultPreloadFn,
  deleteFn = defaultDeleteFn,
}: OnDeviceTierCardProps): ReactElement {
  const { t } = useTranslation('settings');

  const [capability, setCapability] = useState<OnDeviceCapability | null>(null);
  const [selectedId, setSelectedId] = useState<string>(() =>
    status.kind === 'on_device' ? savedModelId() : DEFAULT_ONDEVICE_MODEL,
  );
  const [busy, setBusy] = useState<CardBusy>('idle');
  const [progress, setProgress] = useState<OnDeviceProgress | null>(null);
  const [errorKey, setErrorKey] = useState<'download_error' | 'remove_error' | null>(null);

  // Guard state writes after unmount (the download outlives quick navigation).
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Feature-detect once on mount; the probe never throws.
  useEffect(() => {
    let cancelled = false;
    void probeFn().then((result) => {
      if (!cancelled && mountedRef.current) setCapability(result);
    });
    return () => {
      cancelled = true;
    };
  }, [probeFn]);

  const enabled = status.kind === 'on_device';
  const selected =
    BLESSED_ONDEVICE_MODELS.find((m) => m.id === selectedId) ?? BLESSED_ONDEVICE_MODELS[0];

  const startDownload = async (): Promise<void> => {
    if (busy !== 'idle') return;
    setBusy('downloading');
    setErrorKey(null);
    setProgress(null);
    // Ask for persistent storage BEFORE the ~1 GB lands in the cache.
    await requestPersistentStorage();
    try {
      await preloadFn(selected.id, (p) => {
        if (mountedRef.current) setProgress(p);
      });
      // Download + load succeeded → enabling the tier is exactly this write.
      writeLlmSettings({ engine: 'webllm', model: selected.id });
      if (mountedRef.current) {
        setBusy('idle');
        setProgress(null);
      }
      onChanged();
    } catch {
      if (mountedRef.current) {
        setBusy('idle');
        setProgress(null);
        setErrorKey('download_error');
      }
    }
  };

  const removeModel = async (): Promise<void> => {
    if (busy !== 'idle') return;
    setBusy('removing');
    setErrorKey(null);
    const id = savedModelId();
    // The user's intent is "turn this off" — honor it even if freeing the
    // cache fails (then say so honestly instead of pretending).
    let deleteFailed = false;
    try {
      await deleteFn(id);
    } catch {
      deleteFailed = true;
    }
    writeLlmSettings({ engine: '', model: '' });
    if (mountedRef.current) {
      setBusy('idle');
      if (deleteFailed) setErrorKey('remove_error');
    }
    onChanged();
  };

  const percent = Math.round((progress?.progress ?? 0) * 100);

  return (
    <section
      data-testid="tier-ondevice"
      className={`rounded-lg border p-4 ${
        enabled ? 'border-accent-gold/40 bg-accent-gold/5' : 'border-ui-border bg-background-secondary'
      }`}
    >
      {/* Tier header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-text-primary text-sm font-medium">
          {t('tiers.ondevice_title')}
          <span className="ml-2 rounded-full border border-accent-lapis/40 bg-accent-lapis/10 px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-text-secondary">
            {t('tiers.ondevice_badge')}
          </span>
        </p>
        {enabled && (
          <span
            data-testid="tier-ondevice-active"
            className="rounded-full bg-accent-gold/15 px-2 py-0.5 text-xs font-medium text-accent-gold"
          >
            {t('tiers.active_badge')}
          </span>
        )}
      </div>
      <p className="text-text-secondary text-xs mt-1">{t('tiers.ondevice_body')}</p>

      {/* Capability probing */}
      {capability === null && (
        <p className="mt-3 text-xs text-text-muted" data-testid="ondevice-probing">
          {t('model.probing')}
        </p>
      )}

      {/* Honest unsupported state — a typed reason, no dead buttons. */}
      {capability !== null && !capability.supported && (
        <div className="mt-3" data-testid="ondevice-unsupported">
          <p className="text-text-primary text-sm">{t('model.unsupported_title')}</p>
          <p className="text-text-secondary text-xs mt-1">
            {t(`model.reason_${capability.reason}`)}
          </p>
        </div>
      )}

      {/* Enabled: which model, and the way out. Rendered regardless of the
          probe so "Remove" is never unreachable (e.g. the tier was enabled in
          another browser profile that HAD WebGPU). */}
      {enabled && (
        <div className="mt-3 space-y-3" data-testid="ondevice-enabled">
          <p className="text-text-primary text-sm">{t('model.enabled_title')}</p>
          <p className="text-text-secondary text-xs">
            {t('model.enabled_body', { model: modelLabel(savedModelId()) })}
          </p>
          <p className="text-text-muted text-xs" data-testid="ondevice-scope">
            {t('model.scope_note')}
          </p>
          <button
            type="button"
            onClick={() => void removeModel()}
            disabled={busy !== 'idle'}
            className="rounded-md border border-ui-border px-3 py-1.5 text-sm text-text-secondary transition-colors hover:border-status-error/50 hover:text-status-error disabled:opacity-50"
            data-testid="ondevice-remove"
          >
            {busy === 'removing' ? t('model.removing') : t('model.remove')}
          </button>
        </div>
      )}

      {/* Supported + not enabled: picker → disclosure → download → progress. */}
      {capability?.supported && !enabled && (
        <div className="mt-3 space-y-3">
          <fieldset disabled={busy !== 'idle'}>
            <legend className="text-text-primary text-sm font-medium">
              {t('model.picker_label')}
            </legend>
            <div className="mt-2 space-y-2">
              {BLESSED_ONDEVICE_MODELS.map((m) => (
                <label
                  key={m.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                    selectedId === m.id
                      ? 'border-accent-gold/50 bg-accent-gold/5'
                      : 'border-ui-border hover:border-accent-gold/30'
                  }`}
                >
                  <input
                    type="radio"
                    name="ondevice-model"
                    checked={selectedId === m.id}
                    onChange={() => setSelectedId(m.id)}
                    className="mt-0.5 border-ui-border text-accent-gold focus:ring-accent-gold/50"
                    data-testid={`ondevice-model-${m.id}`}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm text-text-primary">{m.label}</span>
                    <span className="block text-xs text-text-muted">
                      {t('model.model_size', { size: m.downloadMB, vram: m.vramMB })}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* The explicit disclosure — ALWAYS visible before the download
              button can be pressed; interpolates the selected model's size. */}
          <p className="text-text-secondary text-xs" data-testid="ondevice-disclosure">
            {t('model.disclosure', { size: selected.downloadMB })}
          </p>
          <p className="text-text-muted text-xs" data-testid="ondevice-scope">
            {t('model.scope_note')}
          </p>

          {busy === 'downloading' ? (
            <div className="space-y-1.5" data-testid="ondevice-progress" role="status">
              <p className="text-text-secondary text-xs">
                {t(`model.phase_${progress?.phase ?? 'download'}`)}
                {' — '}
                <span data-testid="ondevice-progress-percent">{percent}%</span>
              </p>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-background-tertiary">
                <div
                  className="h-full rounded-full bg-accent-gold transition-all"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void startDownload()}
              className="rounded-md bg-accent-gold px-4 py-2 text-sm font-medium text-background-primary transition-colors hover:bg-accent-gold-bright"
              data-testid="ondevice-download"
            >
              {t('model.download_cta')}
            </button>
          )}
        </div>
      )}

      {/* Honest failure notes (download / cache removal). */}
      {errorKey && (
        <p className="mt-3 text-xs text-status-error" data-testid="ondevice-error" role="status">
          {t(`model.${errorKey}`)}
        </p>
      )}
    </section>
  );
}

export default OnDeviceTierCard;
