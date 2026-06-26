import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import i18n from '../i18n/config';
import {
  ERROR_CODES,
  getChatErrorMessage,
  getEngineWarmingMessage,
  getUserFriendlyError,
} from './errors';

// The error helpers are a plain (non-React) TS module that localizes via the
// shared app i18n instance. Every test that changes the language must restore
// 'en' afterwards so the English assertions elsewhere hold.
beforeEach(async () => {
  await i18n.changeLanguage('en');
});

afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe('getUserFriendlyError', () => {
  it('returns English with the error code in en', async () => {
    await i18n.changeLanguage('en');
    expect(getUserFriendlyError('CHART_GEN_001')).toBe(
      "Sorry, we're experiencing technical difficulties. Error code: CHART_GEN_001",
    );
  });

  it('returns Spanish with the error code in es', async () => {
    await i18n.changeLanguage('es');
    const msg = getUserFriendlyError('CHART_GEN_001');
    expect(msg).toContain('dificultades técnicas');
    expect(msg).toContain('CHART_GEN_001');
    expect(msg).not.toContain('technical difficulties');
  });
});

describe('getChatErrorMessage', () => {
  it('returns English in en', async () => {
    await i18n.changeLanguage('en');
    expect(getChatErrorMessage('QA_001')).toBe(
      "Sorry, I couldn't process your request. Please try again. (Error: QA_001)",
    );
  });

  it('returns Spanish in es', async () => {
    await i18n.changeLanguage('es');
    const msg = getChatErrorMessage('QA_001');
    expect(msg).toContain('no pudimos procesar');
    expect(msg).toContain('QA_001');
  });
});

describe('getEngineWarmingMessage', () => {
  it('returns English in en', async () => {
    await i18n.changeLanguage('en');
    expect(getEngineWarmingMessage()).toBe(
      'The astrology engine is still warming up — please try again in a moment.',
    );
  });

  it('returns Spanish in es', async () => {
    await i18n.changeLanguage('es');
    const msg = getEngineWarmingMessage();
    expect(msg).toContain('motor astrológico');
    expect(msg).not.toContain('astrology engine');
  });
});

describe('ERROR_CODES default messages', () => {
  it('localize the human-readable code description by language', async () => {
    await i18n.changeLanguage('en');
    expect(ERROR_CODES('CHART_GEN_001')).toBe('Chart generation failed');
    await i18n.changeLanguage('es');
    expect(ERROR_CODES('CHART_GEN_001')).toBe('Error al generar la carta');
  });
});
