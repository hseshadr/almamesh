import { test, expect } from "@playwright/test";

// Helper function to navigate through onboarding to the location step
async function navigateToLocationStep(page: import("@playwright/test").Page) {
  await page.goto("/onboarding");

  // Wait for onboarding page to load
  await expect(page.locator("text=What's your name?")).toBeVisible({ timeout: 10000 });

  // Step 1: Fill in the name
  const nameInput = page.locator('input[placeholder*="full name"]');
  await nameInput.fill("Test User");
  await page.click('button:has-text("Continue")');

  // Step 2: Birth Date - need to select a valid past date
  await expect(page.locator("text=When were you born?")).toBeVisible({ timeout: 5000 });

  // Click on the date input to open picker
  const dateInput = page.locator('input[placeholder*="birth date"]');
  await dateInput.click();
  await page.waitForTimeout(500);

  // The date picker shows the current year (future) which is invalid;
  // select a past year from the dropdown.
  const yearSelect = page.locator('select').last(); // Year dropdown is the second select
  await yearSelect.selectOption('1990');

  // Now click on a day (15 is usually visible and valid)
  await page.waitForTimeout(300);
  const dayButton = page.locator('.react-datepicker__day--015, .react-datepicker__day:has-text("15")').first();
  await dayButton.click();

  // Now Continue should be enabled
  await page.click('button:has-text("Continue")');

  // Step 3: Location - should now be visible
  await expect(page.locator("text=Where were you born?")).toBeVisible({ timeout: 5000 });
}

test.describe("LocationSearch Component (offline)", () => {
  test("searches the bundled city database and shows results without network", async ({ page }) => {
    // Fail the test if any third-party geocoding endpoint is contacted.
    const geocodeCalls: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (
        url.includes("nominatim.openstreetmap.org") ||
        url.includes("places.googleapis.com") ||
        url.includes("maps.googleapis.com")
      ) {
        geocodeCalls.push(url);
      }
    });

    await navigateToLocationStep(page);

    const locationInput = page.locator('[data-testid="location-search-input"]');
    await expect(locationInput).toBeVisible();

    // Type a search query for Chennai (offline lookup).
    await locationInput.fill("chennai");

    // Wait for debounce (250ms) + lazy DB load on first query.
    const chennaiResult = page.locator('button:has-text("India")').first();
    await expect(chennaiResult).toBeVisible({ timeout: 5000 });

    // Select it.
    await chennaiResult.click();

    // Selected location info should show the city + its auto-detected timezone.
    await expect(page.locator("text=India")).toBeVisible();
    await expect(page.locator("text=Asia/Kolkata")).toBeVisible();

    // No third-party geocoding request must have fired.
    expect(geocodeCalls).toEqual([]);
  });

  test("search clears when user clears input", async ({ page }) => {
    await navigateToLocationStep(page);

    const locationInput = page.locator('[data-testid="location-search-input"]');
    await locationInput.fill("delhi");

    // Results should appear (offline).
    const results = page.locator('button:has-text("India")').first();
    await expect(results).toBeVisible({ timeout: 5000 });

    // Clear the input using the clear button.
    const clearButton = page.locator('button[aria-label="Clear location search"]');
    await clearButton.click();

    // Results should disappear.
    await expect(results).not.toBeVisible({ timeout: 2000 });
  });
});
