import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const functionSource = resolve(import.meta.dirname, '../feedback.ts');

describe('closed Pages Function source', () => {
  it('has no runtime module imports', () => {
    const source = readFileSync(functionSource, 'utf8');
    const imports = source.match(/^\s*import(?:\s|\()/gmu) ?? [];

    expect(imports).toEqual([]);
  });

  it('does not depend on an AlmaMesh workspace package', () => {
    const source = readFileSync(functionSource, 'utf8');

    expect(source).not.toContain('@almamesh/');
  });
});
