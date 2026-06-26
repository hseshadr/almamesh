/**
 * AiModelSettings — the AI model configuration card.
 *
 * OpenRouter / BYO build: this renders the BYO `LlmModelSettings` form directly
 * — a one-click OpenRouter cloud preset, or any OpenAI-compatible endpoint (e.g.
 * a local Ollama). The same resolved `ProviderConfig` drives both interpretation
 * and chat. The enclosing page supplies the "AI Model" heading.
 */

import { Card } from '../../ui';
import LlmModelSettings from './LlmModelSettings';

export function AiModelSettings() {
  return (
    <section data-testid="ai-model-settings">
      <Card className="p-5">
        <LlmModelSettings />
      </Card>
    </section>
  );
}
