/**
 * MeshPage — `/mesh`, AlmaMesh's namesake surface: the anchor ("you") at the
 * centre of a radial constellation of the people whose charts weave into
 * yours. Node/thread click opens the pair's edge view (`/mesh/:memberId`).
 *
 * States, honestly rendered:
 *  - profiles still rehydrating → quiet spinner (no false "empty mesh");
 *  - mesh not ready (no anchor or no members) → an elegant invitation routing
 *    to Settings → People;
 *  - a person without a generated chart → muted node with a "generate chart"
 *    affordance that reuses the established flow (switch profile → onboarding).
 */

import type { ReactElement } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import {
  useAnchorProfile,
  useChartLibraryStore,
  useMembers,
  useMeshReady,
  useProfilesStore,
  type Profile,
} from '@almamesh/store';

import { buttonVariants, Spinner } from '../components/ui';
import { MeshConstellation, type MeshNodeVM } from '../components/features/mesh';
import { hasBirthChart, lagnaSignOf, profileChartOf } from '../lib/mesh';

/** The mesh has no anchor or no members yet — invite, don't apologize. */
function MeshInvitation(): ReactElement {
  const { t } = useTranslation('mesh');
  return (
    <div className="mx-auto max-w-xl space-y-6 py-10 text-center" data-testid="mesh-invitation">
      {/* An empty orbit with one waiting star — you, before the mesh. */}
      <div className="relative mx-auto h-40 w-40" aria-hidden="true">
        <div className="absolute inset-0 rounded-full border border-dashed border-accent-gold/25" />
        <div className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-gold/80" />
      </div>
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-tertiary">
          {t('invitation.kicker')}
        </p>
        <h1 className="mt-1 font-display text-3xl leading-tight text-text-primary">
          {t('invitation.title')}
        </h1>
      </div>
      <p className="mx-auto max-w-prose text-sm leading-relaxed text-text-secondary">
        {t('invitation.body')}
      </p>
      <div className="space-y-3">
        <Link
          to="/settings/people"
          className={buttonVariants({ variant: 'primary' })}
          data-testid="mesh-invitation-cta"
        >
          {t('invitation.cta')}
        </Link>
        <p className="text-xs text-text-tertiary">{t('invitation.hint')}</p>
      </div>
    </div>
  );
}

function MeshGraph({ anchor, members }: { anchor: Profile; members: Profile[] }): ReactElement {
  const { t } = useTranslation('mesh');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const charts = useChartLibraryStore((s) => s.charts);
  const setActiveProfile = useProfilesStore((s) => s.setActiveProfile);

  const toNode = (profile: Profile): MeshNodeVM => ({
    profile,
    hasChart: hasBirthChart(charts, profile.id),
    lagnaSign: lagnaSignOf(profileChartOf(charts, profile.id)),
  });

  /**
   * The established add-a-chart flow (mirrors Settings → People): activate the
   * person, refresh the primary-chart query, and let onboarding compute the
   * chart — chart creation is never forked.
   */
  const handleGenerateChart = (profileId: string): void => {
    setActiveProfile(profileId);
    void queryClient.invalidateQueries({ queryKey: ['primary-chart'] });
    navigate('/onboarding');
  };

  return (
    <div className="space-y-8" data-testid="mesh-page">
      <header className="border-b border-ui-border pb-6">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-tertiary">
          {t('page.kicker')}
        </p>
        <h1 className="mt-1 font-display text-3xl leading-tight text-text-primary">
          {t('page.title')}
        </h1>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-text-secondary">
          {t('page.subtitle')}
        </p>
      </header>

      <MeshConstellation
        anchor={toNode(anchor)}
        members={members.map(toNode)}
        onGenerateChart={handleGenerateChart}
      />

      <footer className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-t border-ui-border pt-5">
        <p className="text-xs text-text-tertiary">
          {t('page.people_count', { count: members.length })}
          {' · '}
          {t('page.computed_note')}
        </p>
        <Link
          to="/settings/people"
          className="text-sm text-accent-gold transition-colors hover:text-accent-gold-bright"
          data-testid="mesh-manage-link"
        >
          {t('page.manage')}
        </Link>
      </footer>
    </div>
  );
}

export default function MeshPage(): ReactElement {
  const hydrated = useProfilesStore((s) => s.hydrated);
  const meshReady = useMeshReady();
  const anchor = useAnchorProfile();
  const members = useMembers();

  if (!hydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" />
      </div>
    );
  }
  if (!meshReady || !anchor) {
    return <MeshInvitation />;
  }
  return <MeshGraph anchor={anchor} members={members} />;
}
