import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { act } from 'react';

import { useChatScopeSync } from '../useChatScopeSync';
import { useProfilesStore, getActiveChatScope, setActiveChatScope } from '@almamesh/store';

describe('useChatScopeSync', () => {
  beforeEach(() => {
    setActiveChatScope(null);
    useProfilesStore.setState({ profiles: {}, activeProfileId: null });
  });

  afterEach(() => {
    setActiveChatScope(null);
    useProfilesStore.setState({ profiles: {}, activeProfileId: null });
  });

  it('pushes the current active profile into the chat scope on mount', () => {
    useProfilesStore.setState({ activeProfileId: 'profile-1' });

    renderHook(() => useChatScopeSync());

    expect(getActiveChatScope()).toBe('profile-1');
  });

  it('pushes the new active profile into the chat scope when it changes', () => {
    renderHook(() => useChatScopeSync());
    expect(getActiveChatScope()).toBeNull();

    act(() => {
      useProfilesStore.setState({ activeProfileId: 'profile-2' });
    });

    expect(getActiveChatScope()).toBe('profile-2');
  });
});
