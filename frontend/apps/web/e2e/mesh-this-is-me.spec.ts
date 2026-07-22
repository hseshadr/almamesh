import { test, expect } from '@playwright/test';

/**
 * Mesh reachability — LIVE end-to-end validation of the flagship
 * relationship-strength journey.
 *
 * The Mesh empty state instructs: mark your own profile as "this is me" and
 * add at least one person. This spec walks that exact journey through the
 * REAL UI, the way a cold user would — no store seeding, no engine hooks:
 *
 *   1. Fresh visit to /mesh → the invitation (empty state) renders.
 *   2. Create your own profile via the invitation's add-person dialog.
 *   3. Back on /mesh the invitation must offer a path to the "this is me"
 *      control it instructs the user to use (Settings → People). This is the
 *      reachability gap this spec exists to keep closed: commit d0e32f0
 *      removed the invitation's only link to Settings → People, stranding
 *      the anchor control.
 *   4. Mark yourself as the anchor ("This is me").
 *   5. Add one person with a relationship (Friend).
 *   6. /mesh renders the constellation — anchor + member + a woven thread —
 *      not the empty state.
 *
 * Charts are deliberately NOT generated: the mesh forms from the anchor +
 * member relationship alone (chartless members render muted with a generate
 * affordance), so the journey stays engine-free and fast.
 */

test('the mesh journey is reachable end-to-end: create yourself, mark "this is me", add a person, see the thread', async ({
  page,
}) => {
  // 1. Fresh visitor on the mesh — the honest invitation shows.
  await page.goto('/mesh');
  await expect(page.getByTestId('mesh-invitation')).toBeVisible();

  // 2. Create your own profile through the invitation's add-person dialog.
  //    Relationship stays "No relationship" — this person is *you*, not a member.
  await page.getByTestId('mesh-invitation-cta').click();
  await page.getByLabel('Name', { exact: true }).fill('Asha Rao');
  await page.getByRole('button', { name: 'Add & enter birth details' }).click();
  await expect(page).toHaveURL(/\/onboarding/);

  // 3. Back on the mesh: still the invitation (no anchor yet). Its body says
  //    to mark "this is me" — so it MUST link to where that control lives.
  await page.goto('/mesh');
  await expect(page.getByTestId('mesh-invitation')).toBeVisible();
  const manageLink = page.getByTestId('mesh-invitation-manage-link');
  await expect(
    manageLink,
    'the mesh empty state must offer a path to the "this is me" control it instructs the user to use',
  ).toBeVisible();
  await manageLink.click();
  await expect(page).toHaveURL(/\/settings\/people/);

  // 4. Mark yourself as the anchor.
  await page.getByRole('button', { name: 'This is me' }).click();
  await expect(page.getByText('You', { exact: true })).toBeVisible();

  // 5. Add one person with a relationship.
  await page.getByRole('button', { name: 'Add a person' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Demo Friend');
  await page.getByLabel('Relationship to you', { exact: true }).selectOption('friend');
  await page.getByRole('button', { name: 'Add & enter birth details' }).click();
  await expect(page).toHaveURL(/\/onboarding/);

  // The people layer confirms the mesh can now form.
  await page.goto('/settings/people');
  await expect(page.getByTestId('mesh-status')).toBeVisible();

  // 6. The mesh renders the constellation for the pair — not the empty state.
  await page.goto('/mesh');
  await expect(page.getByTestId('mesh-page')).toBeVisible();
  await expect(page.getByTestId('mesh-invitation')).toHaveCount(0);
  await expect(page.getByTestId('mesh-anchor-node')).toContainText('Asha Rao');
  await expect(page.getByTestId('mesh-constellation')).toContainText('Demo Friend');
  await expect(page.locator('[data-testid^="mesh-thread-"]')).toHaveCount(1);
});
