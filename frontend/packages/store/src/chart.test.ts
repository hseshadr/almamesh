import { describe, expect, it } from 'vitest';
import { useChartStore } from './chart';

const separatedChartKeys = [
  'isCalculatingChart',
  'isStreamingInterpretation',
  'streamedContent',
  'currentStreamingSection',
  'currentChartResult',
  'currentInterpretation',
  'interpretationVersions',
  'currentVersion',
  'interpretationViewMode',
  'chartError',
  'interpretationError',
  'calculateChart',
  'setInterpretationViewMode',
  'loadVersionHistory',
  'loadVersion',
  'clearStreamedContent',
  'clearErrors',
  'resetChartInterpretationState',
];

describe('chart store public surface', () => {
  it('keeps chart selection and style without separated-chart compatibility', () => {
    const store = useChartStore.getState();

    expect(store).toEqual(expect.objectContaining({
      selectedPersonName: null,
      selectedPlanet: null,
      viewMode: 'rasi',
      displayStyle: 'south',
      setSelectedPerson: expect.any(Function),
      setSelectedPlanet: expect.any(Function),
      setViewMode: expect.any(Function),
      setDisplayStyle: expect.any(Function),
    }));
    expect(Object.keys(store)).not.toEqual(expect.arrayContaining(separatedChartKeys));
  });
});
