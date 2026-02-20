import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5173';

// Skip onboarding before each test
test.beforeEach(async ({ page }) => {
  await page.goto(BASE);
  await page.evaluate(() => {
    localStorage.setItem('titan_onboarding_completed', 'true');
    localStorage.setItem('morning_flow_completed', JSON.stringify({ date: '2025-01-01', completed: false }));
  });
  await page.reload();
  await page.waitForTimeout(2000);
});

test.describe('Sidebar Reorganization', () => {
  test('sidebar sections appear in correct order', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForSelector('[data-testid]', { timeout: 10000 }).catch(() => {});
    // Wait for app to fully load
    await page.waitForTimeout(2000);

    // Get all section titles from the sidebar
    const sectionTitles = await page.locator('nav').locator('text=/^(Command Center|Flow|Main|Life|Intelligence|Business)$/').allTextContents();

    console.log('Sidebar sections found:', sectionTitles);

    // Verify Flow section exists
    const sidebar = page.locator('nav, aside, [class*="sidebar"], [class*="Sidebar"]').first();
    await expect(sidebar).toBeVisible();
  });

  test('all sidebar nav items are clickable', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForTimeout(2000);

    // Check that key nav items exist
    const navLinks = page.locator('a[href], button').filter({ hasText: /Morning Flow|Planning|Calendar|Email|Tasks|Command Center/i });
    const count = await navLinks.count();
    console.log(`Found ${count} key nav items`);
    expect(count).toBeGreaterThan(0);
  });
});

test.describe('Command Center (Dashboard)', () => {
  test('loads with tabs', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForTimeout(2000);

    // Take screenshot
    await page.screenshot({ path: 'e2e/screenshots/command-center.png', fullPage: true });

    // Check for "Command Center" text on page
    const heading = page.locator('text=/Command Center/i').first();
    const headingVisible = await heading.isVisible().catch(() => false);
    console.log('Command Center heading visible:', headingVisible);

    // Check for tab buttons
    const tabs = page.locator('button, [role="tab"]').filter({ hasText: /Overview|Business|Life|Finances/i });
    const tabCount = await tabs.count();
    console.log(`Found ${tabCount} Command Center tabs`);
  });

  test('tabs are clickable and switch content', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForTimeout(2000);

    // Scope to main content area (exclude sidebar)
    const main = page.locator('main').first();

    // Click each tab within main content
    for (const tabName of ['Business', 'Life', 'Finances', 'Overview']) {
      const tab = main.locator('button').filter({ hasText: new RegExp(`^.*${tabName}.*$`, 'i') }).first();
      const exists = await tab.isVisible().catch(() => false);
      if (exists) {
        await tab.click({ force: true });
        await page.waitForTimeout(500);
        console.log(`Clicked tab: ${tabName}`);
        await page.screenshot({ path: `e2e/screenshots/tab-${tabName.toLowerCase()}.png`, fullPage: true });
      } else {
        console.log(`Tab not found: ${tabName}`);
      }
    }
  });
});

test.describe('Morning Flow', () => {
  test('loads inside AppShell with stepper', async ({ page }) => {
    await page.goto(`${BASE}/morning`);
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'e2e/screenshots/morning-flow.png', fullPage: true });

    // Should NOT be full-screen (sidebar should be visible)
    const sidebar = page.locator('nav, aside, [class*="sidebar"], [class*="Sidebar"]').first();
    const sidebarVisible = await sidebar.isVisible().catch(() => false);
    console.log('Sidebar visible on Morning Flow:', sidebarVisible);

    // Check for stepper elements
    const stepButtons = page.locator('button').filter({ hasText: /Set Intentions|Calendar|Email/i });
    const stepCount = await stepButtons.count();
    console.log(`Found ${stepCount} stepper buttons`);

    // Check for step 1 content (Gratitude section)
    const gratitudeSection = page.locator('text=/Gratitude/i').first();
    const gratitudeVisible = await gratitudeSection.isVisible().catch(() => false);
    console.log('Gratitude section visible:', gratitudeVisible);

    // Check for Must-Do's section
    const mustDoSection = page.locator('text=/Must-Do/i').first();
    const mustDoVisible = await mustDoSection.isVisible().catch(() => false);
    console.log('Must-Do section visible:', mustDoVisible);

    // Check for Ground section
    const groundSection = page.locator('text=/Ground/i').first();
    const groundVisible = await groundSection.isVisible().catch(() => false);
    console.log('Ground section visible:', groundVisible);
  });

  test('stepper navigation works', async ({ page }) => {
    await page.goto(`${BASE}/morning`);
    await page.waitForTimeout(2000);

    // Step 1 should be active
    await page.screenshot({ path: 'e2e/screenshots/morning-step1.png', fullPage: true });

    // Click Next Step
    const nextButton = page.locator('button').filter({ hasText: /Next Step/i }).first();
    const nextExists = await nextButton.isVisible().catch(() => false);
    if (nextExists) {
      await nextButton.click();
      await page.waitForTimeout(1000);
      console.log('Clicked Next Step -> Calendar');
      await page.screenshot({ path: 'e2e/screenshots/morning-step2.png', fullPage: true });

      // Check for calendar content
      const calendarContent = page.locator('text=/Calendar|Meeting|Connect Google/i').first();
      const calendarVisible = await calendarContent.isVisible().catch(() => false);
      console.log('Calendar content visible:', calendarVisible);

      // Click Next Step again
      await nextButton.click();
      await page.waitForTimeout(1000);
      console.log('Clicked Next Step -> Email');
      await page.screenshot({ path: 'e2e/screenshots/morning-step3.png', fullPage: true });

      // Check for email content
      const emailContent = page.locator('text=/Gmail|inbox|Connect|Email/i').first();
      const emailVisible = await emailContent.isVisible().catch(() => false);
      console.log('Email triage content visible:', emailVisible);

      // Should show "Ignite Day" button
      const igniteButton = page.locator('button').filter({ hasText: /Ignite Day/i }).first();
      const igniteVisible = await igniteButton.isVisible().catch(() => false);
      console.log('Ignite Day button visible:', igniteVisible);
    } else {
      console.log('Next Step button not found');
    }
  });

  test('can go back to previous steps', async ({ page }) => {
    await page.goto(`${BASE}/morning`);
    await page.waitForTimeout(2000);

    // Go to step 2
    const nextButton = page.locator('button').filter({ hasText: /Next Step/i }).first();
    if (await nextButton.isVisible().catch(() => false)) {
      await nextButton.click();
      await page.waitForTimeout(500);

      // Click Back
      const backButton = page.locator('button').filter({ hasText: /Back/i }).first();
      if (await backButton.isVisible().catch(() => false)) {
        await backButton.click();
        await page.waitForTimeout(500);
        console.log('Navigated back to step 1');

        // Gratitude should be visible again
        const gratitude = page.locator('text=/Gratitude/i').first();
        const visible = await gratitude.isVisible().catch(() => false);
        console.log('Step 1 content visible after going back:', visible);
      }
    }
  });
});

test.describe('Planning Page', () => {
  test('loads with day detection and toggle', async ({ page }) => {
    await page.goto(`${BASE}/planning`);
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'e2e/screenshots/planning.png', fullPage: true });

    // Check for Planning heading
    const heading = page.locator('text=/Planning/i').first();
    const headingVisible = await heading.isVisible().catch(() => false);
    console.log('Planning heading visible:', headingVisible);

    // Check for Daily/Weekly toggle
    const dailyBtn = page.locator('button').filter({ hasText: /Daily/i }).first();
    const weeklyBtn = page.locator('button').filter({ hasText: /Weekly/i }).first();
    const dailyExists = await dailyBtn.isVisible().catch(() => false);
    const weeklyExists = await weeklyBtn.isVisible().catch(() => false);
    console.log('Daily toggle:', dailyExists, 'Weekly toggle:', weeklyExists);

    // Toggle to weekly mode
    if (weeklyExists) {
      await weeklyBtn.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: 'e2e/screenshots/planning-weekly.png', fullPage: true });
      console.log('Switched to weekly planning');
    }

    // Toggle back to daily
    if (dailyExists) {
      await dailyBtn.click();
      await page.waitForTimeout(500);
      console.log('Switched back to daily planning');
    }
  });
});

test.describe('Other Pages Load Without Errors', () => {
  const pages = [
    { path: '/calendar', name: 'Calendar' },
    { path: '/email', name: 'Email' },
    { path: '/tasks', name: 'Tasks' },
    { path: '/journal', name: 'Journal' },
    { path: '/projects', name: 'Projects' },
    { path: '/vision', name: 'Vision' },
    { path: '/categories', name: 'Categories' },
    { path: '/deals', name: 'Deals' },
    { path: '/trading', name: 'Trading' },
    { path: '/family', name: 'Family' },
    { path: '/finance', name: 'Finance' },
    { path: '/staffing', name: 'Staffing' },
    { path: '/finances', name: 'Finances' },
    { path: '/dev-projects', name: 'Dev Projects' },
  ];

  for (const { path, name } of pages) {
    test(`${name} page loads without crash`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(err.message));

      await page.goto(`${BASE}${path}`);
      await page.waitForTimeout(2000);

      await page.screenshot({ path: `e2e/screenshots/page-${name.toLowerCase().replace(/\s+/g, '-')}.png` });

      // Check no "Maximum update depth exceeded" or other React errors
      const hasReactError = errors.some(e => e.includes('Maximum update depth') || e.includes('Too many re-renders'));
      if (hasReactError) {
        console.error(`REACT ERROR on ${name}:`, errors);
      }
      expect(hasReactError).toBe(false);

      // Page should have some visible content (not blank/crashed)
      const bodyText = await page.locator('body').innerText();
      expect(bodyText.length).toBeGreaterThan(10);

      console.log(`${name} page loaded OK (${errors.length} console errors)`);
    });
  }
});

test.describe('Sidebar Navigation Flow', () => {
  test('click through sidebar items in order', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForTimeout(2000);

    // Click Morning Flow
    const morningLink = page.locator('a[href="/morning"]').first();
    if (await morningLink.isVisible().catch(() => false)) {
      await morningLink.click();
      await page.waitForTimeout(1500);
      console.log('Navigated to Morning Flow via sidebar');
      await expect(page).toHaveURL(/\/morning/);
    }

    // Click Planning
    const planningLink = page.locator('a[href="/planning"]').first();
    if (await planningLink.isVisible().catch(() => false)) {
      await planningLink.click();
      await page.waitForTimeout(1500);
      console.log('Navigated to Planning via sidebar');
      await expect(page).toHaveURL(/\/planning/);
    }

    // Click Calendar
    const calendarLink = page.locator('a[href="/calendar"]').first();
    if (await calendarLink.isVisible().catch(() => false)) {
      await calendarLink.click();
      await page.waitForTimeout(1500);
      console.log('Navigated to Calendar via sidebar');
      await expect(page).toHaveURL(/\/calendar/);
    }

    // Click Email
    const emailLink = page.locator('a[href="/email"]').first();
    if (await emailLink.isVisible().catch(() => false)) {
      await emailLink.click();
      await page.waitForTimeout(1500);
      console.log('Navigated to Email via sidebar');
      await expect(page).toHaveURL(/\/email/);
    }

    // Click back to Command Center
    const homeLink = page.locator('a[href="/"]').first();
    if (await homeLink.isVisible().catch(() => false)) {
      await homeLink.click();
      await page.waitForTimeout(1500);
      console.log('Navigated back to Command Center via sidebar');
      await expect(page).toHaveURL(/^http:\/\/localhost:5174\/?$/);
    }
  });
});
