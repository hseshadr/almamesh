/**
 * AiModelSettings — the AI model configuration card (Spec 063).
 *
 * Renders `LlmModelSettings`: None (the default — no AI at all) and Cloud AI
 * (stronger; the one-click OpenRouter preset or any OpenAI-compatible
 * endpoint, e.g. a local Ollama). The same resolved `ProviderConfig` drives
 * both interpretation and chat. The enclosing page supplies the heading.
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
