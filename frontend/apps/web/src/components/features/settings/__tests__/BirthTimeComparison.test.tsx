import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useLanguageStore } from '@almamesh/store';

import '../../../../i18n/config';
import { BirthTimeComparison } from '../BirthTimeComparison';

describe('BirthTimeComparison', () => {
  beforeEach(() => {
    useLanguageStore.setState({ language: 'en' });
  });

  it('renders nothing when the lagna sits mid-sign and the two times agree', () => {
    const { container } = render(
      <BirthTimeComparison
        recorded={{ time: '06:00', sign: 'Taurus', signDegrees: 15 }}
        rectified={{ time: '06:00', sign: 'Taurus', signDegrees: 15 }}
        cusp={null}
      />,
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('birth-time-comparison')).toBeNull();
  });

  it('near a cusp (not yet crossed) names the alternative sign and the stakes', () => {
    render(
      <BirthTimeComparison
        recorded={{ time: '06:44', sign: 'Leo', signDegrees: 0.3 }}
        rectified={{ time: '06:44', sign: 'Leo', signDegrees: 0.3 }}
        cusp={{ neighbourSign: 'Cancer', degrees: 0.3 }}
      />,
    );
    const block = screen.getByTestId('birth-time-comparison');
    expect(block.textContent).toMatch(/Leo/);
    expect(block.textContent).toMatch(/0\.3° from the Cancer cusp/);
    expect(block.textContent).toMatch(/shift every house/);
  });

  it('when the two candidate times land in DIFFERENT signs, shows BOTH rising signs side by side', () => {
    render(
      <BirthTimeComparison
        recorded={{ time: '06:44', sign: 'Leo', signDegrees: 0.1 }}
        rectified={{ time: '06:14', sign: 'Cancer', signDegrees: 23 }}
        cusp={null}
      />,
    );
    const block = screen.getByTestId('birth-time-comparison');
    // Both candidate columns, each anchored to its own time.
    expect(block.textContent).toContain('06:44');
    expect(block.textContent).toContain('06:14');
    expect(block.textContent).toContain('Leo');
    expect(block.textContent).toContain('Cancer');
    // The "same person, every house shifts" framing — one chart, two candidate times.
    expect(block.textContent).toMatch(/Leo → Cancer/);
    expect(block.textContent).toMatch(/every house/);
    expect(block.textContent).toMatch(/same person/i);
  });
});
