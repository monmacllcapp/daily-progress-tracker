// @ts-nocheck
/// <reference lib="dom" />
import puppeteer from 'puppeteer-core';
import type { Browser, Page } from 'puppeteer-core';

export interface HeadlessResult {
  success: boolean;
  message: string;
  steps: string[];
  finalUrl: string;
}

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const MAX_STEPS = 5;
const OVERALL_TIMEOUT_MS = 45_000;
const NAV_TIMEOUT_MS = 15_000;
const POST_CLICK_WAIT_MS = 3_000;
const POST_CLICK_NAV_TIMEOUT_MS = 5_000;

const SUCCESS_PATTERNS: RegExp[] = [
  /you have been (successfully )?unsubscribed/i,
  /successfully unsubscribed/i,
  /removed from.*list/i,
  /no longer.*receive/i,
  /preferences.*updated/i,
  /subscription.*cancel/i,
  /sorry to see you go/i,
  /opt.?out.*complete/i,
  /email.*removed/i,
];

const ERROR_PATTERNS: RegExp[] = [
  /invalid.*link/i,
  /link.*expired/i,
  /captcha/i,
  /verify.*human/i,
  /page not found/i,
  /access denied/i,
  /something went wrong/i,
];

const POSITIVE_BUTTON_PATTERNS: RegExp[] = [
  /^unsubscribe$/i,
  /yes.*unsubscribe/i,
  /^confirm$/i,
  /opt\s*out/i,
  /remove\s*me/i,
  /yes,?\s*unsubscribe/i,
  /^yes$/i,
  /^submit$/i,
  /^continue$/i,
];

const NEGATIVE_BUTTON_PATTERNS: RegExp[] = [
  /^no$/i,
  /^cancel$/i,
  /^keep$/i,
  /^stay$/i,
  /go\s*back/i,
  /resubscribe/i,
  /sign\s*up/i,
  /^subscribe$/i,
  /^undo$/i,
];

const CHECKBOX_KEYWORDS = [
  'unsubscribe',
  'opt out',
  'remove',
  'all emails',
  'all communications',
  'stop receiving',
  'no longer',
];

async function detectSuccess(page: Page): Promise<boolean> {
  try {
    const bodyText = await page.evaluate(() => document.body.innerText);
    return SUCCESS_PATTERNS.some((pattern) => pattern.test(bodyText));
  } catch {
    return false;
  }
}

async function detectError(page: Page): Promise<string | null> {
  try {
    const bodyText = await page.evaluate(() => document.body.innerText);
    // Only match the specific "error" pattern if the word appears standalone,
    // not as part of other words. The other patterns are specific enough.
    for (const pattern of ERROR_PATTERNS) {
      if (pattern.test(bodyText)) {
        const match = bodyText.match(pattern);
        return match ? match[0] : 'Unknown error detected';
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function checkUnsubscribeCheckboxes(
  page: Page,
  steps: string[],
): Promise<number> {
  let checked = 0;
  try {
    checked = await page.evaluate((keywords: string[]) => {
      let count = 0;
      const checkboxes = document.querySelectorAll<HTMLInputElement>(
        'input[type="checkbox"]:not(:checked)',
      );
      for (const cb of checkboxes) {
        // Look at the label, parent text, or nearby text for keywords
        const label = cb.labels?.[0]?.textContent ?? '';
        const parentText = cb.parentElement?.textContent ?? '';
        const nearbyText = (label + ' ' + parentText).toLowerCase();
        const isRelevant = keywords.some((kw) => nearbyText.includes(kw));
        if (isRelevant) {
          cb.checked = true;
          cb.dispatchEvent(new Event('change', { bubbles: true }));
          cb.dispatchEvent(new Event('input', { bubbles: true }));
          count++;
        }
      }
      return count;
    }, CHECKBOX_KEYWORDS);
    if (checked > 0) {
      steps.push(`Checked ${checked} unsubscribe-related checkbox(es)`);
    }
  } catch {
    // Page may have navigated or checkbox interaction failed
  }
  return checked;
}

async function findAndInteract(
  page: Page,
  steps: string[],
): Promise<boolean> {
  // Step 1: Check any relevant checkboxes
  await checkUnsubscribeCheckboxes(page, steps);

  // Step 2: Find and click a positive button/link
  try {
    const clickedText = await page.evaluate(
      (positiveSourceFlags: string[], negativeSourceFlags: string[]) => {
        const posRegexes = positiveSourceFlags.map((sf) => {
          const [source, flags] = sf.split('|||');
          return new RegExp(source!, flags);
        });
        const negRegexes = negativeSourceFlags.map((sf) => {
          const [source, flags] = sf.split('|||');
          return new RegExp(source!, flags);
        });

        const candidates: { element: HTMLElement; text: string }[] = [];

        // Buttons
        for (const btn of document.querySelectorAll<HTMLElement>(
          'button, input[type="submit"]',
        )) {
          const text = (
            btn instanceof HTMLInputElement
              ? btn.value
              : btn.textContent ?? ''
          ).trim();
          if (text) candidates.push({ element: btn, text });
        }

        // Links
        for (const link of document.querySelectorAll<HTMLAnchorElement>('a')) {
          const text = (link.textContent ?? '').trim();
          if (text) candidates.push({ element: link, text });
        }

        for (const { element, text } of candidates) {
          const isNegative = negRegexes.some((r) => r.test(text));
          if (isNegative) continue;

          const isPositive = posRegexes.some((r) => r.test(text));
          if (isPositive) {
            const rect = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);
            if (
              rect.width > 0 &&
              rect.height > 0 &&
              style.display !== 'none' &&
              style.visibility !== 'hidden'
            ) {
              element.click();
              return text;
            }
          }
        }

        return null;
      },
      POSITIVE_BUTTON_PATTERNS.map((r) => `${r.source}|||${r.flags}`),
      NEGATIVE_BUTTON_PATTERNS.map((r) => `${r.source}|||${r.flags}`),
    );

    if (clickedText) {
      steps.push(`Clicked: "${clickedText}"`);
      return true;
    }
  } catch {
    // Page may have navigated during evaluation
  }

  return false;
}

export async function runHeadlessUnsubscribe(
  url: string,
): Promise<HeadlessResult> {
  const steps: string[] = [];
  let browser: Browser | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let timedOut = false;

  try {
    const result = await new Promise<HeadlessResult>((resolve, reject) => {
      timeoutId = setTimeout(() => {
        timedOut = true;
        resolve({
          success: false,
          message: 'Overall timeout of 45s exceeded',
          steps,
          finalUrl: url,
        });
      }, OVERALL_TIMEOUT_MS);

      (async () => {
        // Step 1: Launch browser
        steps.push('Launching headless browser');
        browser = await puppeteer.launch({
          executablePath: CHROME_PATH,
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
          ],
        });

        const page = await browser.newPage();
        await page.setUserAgent(
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        );

        // Step 2: Navigate to URL
        steps.push(`Navigating to ${url}`);
        try {
          await page.goto(url, {
            waitUntil: 'networkidle2',
            timeout: NAV_TIMEOUT_MS,
          });
        } catch {
          // Navigation timeout is non-fatal; page may still be usable
          steps.push('Initial navigation timed out, proceeding with current page state');
        }

        if (timedOut) return;

        // Check for immediate success (some URLs unsubscribe on GET)
        if (await detectSuccess(page)) {
          steps.push('Unsubscribe confirmed on initial page load');
          resolve({
            success: true,
            message: 'Unsubscribed successfully on page load',
            steps,
            finalUrl: page.url(),
          });
          return;
        }

        // Step 3: Interaction loop
        for (let step = 0; step < MAX_STEPS; step++) {
          if (timedOut) return;

          steps.push(`Interaction step ${step + 1}/${MAX_STEPS}`);

          // Check for success
          if (await detectSuccess(page)) {
            steps.push('Unsubscribe success detected');
            resolve({
              success: true,
              message: 'Unsubscribed successfully',
              steps,
              finalUrl: page.url(),
            });
            return;
          }

          // Check for errors
          const error = await detectError(page);
          if (error) {
            steps.push(`Error detected: ${error}`);
            resolve({
              success: false,
              message: `Error on page: ${error}`,
              steps,
              finalUrl: page.url(),
            });
            return;
          }

          // Find and interact with page elements
          const interacted = await findAndInteract(page, steps);
          if (!interacted) {
            steps.push('No interactive elements found');
            resolve({
              success: false,
              message:
                'Could not find unsubscribe button or link on the page',
              steps,
              finalUrl: page.url(),
            });
            return;
          }

          // Wait for potential navigation after clicking
          try {
            await Promise.race([
              page
                .waitForNavigation({
                  waitUntil: 'networkidle2',
                  timeout: POST_CLICK_NAV_TIMEOUT_MS,
                })
                .catch(() => {}),
              new Promise((r) => setTimeout(r, POST_CLICK_WAIT_MS)),
            ]);
          } catch {
            // Navigation wait failed, continue anyway
          }
        }

        // Final success check after all steps
        if (await detectSuccess(page)) {
          steps.push('Unsubscribe success detected after all steps');
          resolve({
            success: true,
            message: 'Unsubscribed successfully',
            steps,
            finalUrl: page.url(),
          });
          return;
        }

        steps.push('Max interaction steps reached without confirmation');
        resolve({
          success: false,
          message:
            'Completed all interaction steps but could not confirm unsubscribe',
          steps,
          finalUrl: page.url(),
        });
      })().catch(reject);
    });

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    steps.push(`Fatal error: ${message}`);
    return {
      success: false,
      message: `Headless unsubscribe failed: ${message}`,
      steps,
      finalUrl: url,
    };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    if (browser) {
      try {
        await browser.close();
      } catch {
        // Browser may already be closed
      }
    }
  }
}
