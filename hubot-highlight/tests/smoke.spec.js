// @ts-check
const { test, expect } = require('@playwright/test');

/* Functional smoke coverage, not pixel/timing snapshots — every assertion
   checks a real outcome (did the state change, is the menu open) rather
   than an animation's exact opacity/scale at some instant, since those are
   inherently timing-sensitive and would make this suite flaky for no real
   safety benefit. Run with `npm test` from hubot-highlight/. */

test.beforeEach(async ({ page }) => {
  await page.goto('/index.html');
});

/** Fill of the title's base <text> element (its overall/preset colour, as
 * opposed to a specific word's override, which lives on a <tspan>). */
async function titleFill(page) {
  return page.evaluate(() => document.querySelector('#board g.ui-content text')?.getAttribute('fill') ?? null);
}

async function bodyMenuOpen(page) {
  return page.evaluate(() => !!document.querySelector('body > .ctx-menu'));
}

test.describe('header dropdowns', () => {
  const dropdowns = [
    ['loadBtn', 'loadMenu'],
    ['exportMenuBtn', 'exportMenu'],
    ['addSubtitleBtn', 'addSubtitleMenu'],
    ['addDateBtn', 'addDateMenu'],
    ['textAppearanceBtn', 'textAppearanceMenu'],
  ];

  for (const [btnId, menuId] of dropdowns) {
    test(`${btnId} opens ${menuId} and closes on outside click`, async ({ page }) => {
      await page.click(`#${btnId}`);
      await expect(page.locator(`#${menuId}`)).not.toHaveClass(/closed/);
      await page.mouse.click(1400, 800);
      await expect(page.locator(`#${menuId}`)).toHaveClass(/closed/);
    });
  }

  test('opening one dropdown closes another that was open', async ({ page }) => {
    await page.click('#loadBtn');
    await expect(page.locator('#loadMenu')).not.toHaveClass(/closed/);
    await page.click('#exportMenuBtn');
    await expect(page.locator('#loadMenu')).toHaveClass(/closed/);
    await expect(page.locator('#exportMenu')).not.toHaveClass(/closed/);
  });
});

test.describe('board right-click menu', () => {
  async function openBoardMenu(page) {
    const board = page.locator('#board');
    const box = await board.boundingBox();
    await page.mouse.click(box.x + box.width - 60, box.y + box.height - 60, { button: 'right' });
  }

  test('right-click opens it, outside click closes it', async ({ page }) => {
    await openBoardMenu(page);
    await expect.poll(() => bodyMenuOpen(page)).toBe(true);
    await page.mouse.click(1400, 100);
    await expect.poll(() => bodyMenuOpen(page)).toBe(false);
  });

  test('closes when a header button is clicked (stopPropagation regression)', async ({ page }) => {
    await openBoardMenu(page);
    await expect.poll(() => bodyMenuOpen(page)).toBe(true);
    await page.click('#loadBtn');
    await expect.poll(() => bodyMenuOpen(page)).toBe(false);
  });

  test('a header dropdown closes when the board menu is opened by right-click', async ({ page }) => {
    await page.click('#addDateBtn');
    await expect(page.locator('#addDateMenu')).not.toHaveClass(/closed/);
    await openBoardMenu(page);
    await expect(page.locator('#addDateMenu')).toHaveClass(/closed/);
  });
});

test.describe('colour selection actually applies (regression: popOut pointer-events triggering a late mouseleave->revert)', () => {
  test('word right-click popover commits a colour', async ({ page }) => {
    const word = page.locator('.hit-word').first();
    const box = await word.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
    const popover = page.locator('#wordPopover');
    await expect(popover).toBeVisible();
    const before = await page.evaluate(() => document.querySelectorAll('#board g.ui-content text tspan')[0]?.getAttribute('fill'));
    await page.hover('#wordPopover button[data-p="1"]');
    await page.click('#wordPopover button[data-p="1"]');
    await expect(popover).toHaveCount(0);
    const after = await page.evaluate(() => document.querySelectorAll('#board g.ui-content text tspan')[0]?.getAttribute('fill'));
    expect(after).not.toBe(before);
  });

  test('board menu colour-presets flyout commits a colour', async ({ page }) => {
    const board = page.locator('#board');
    const box = await board.boundingBox();
    await page.mouse.click(box.x + box.width - 60, box.y + box.height - 60, { button: 'right' });
    await page.hover('body > .ctx-menu [data-a="presets"]');
    const before = await titleFill(page);
    await page.hover('.popover button[data-i="1"]');
    await page.click('.popover button[data-i="1"]');
    const after = await titleFill(page);
    expect(after).not.toBe(before);
    expect(after).toBe('#322234'); // PRESETS[1] = Dusk / Midnight
  });

  test('Text appearance colour-presets flyout commits a colour', async ({ page }) => {
    await page.click('#textAppearanceBtn');
    await page.hover('#textAppearanceMenu [data-a="presets"]');
    const before = await titleFill(page);
    await page.hover('.popover button[data-i="3"]');
    await page.click('.popover button[data-i="3"]');
    const after = await titleFill(page);
    expect(after).not.toBe(before);
    expect(after).toBe('#75153A'); // PRESETS[3] = Marigold / Soil
  });

  test('Add date colour-presets flyout commits a colour', async ({ page }) => {
    await page.click('#addDateBtn');
    await page.click('#dateToggleBtn');
    const dateFillBefore = await page.evaluate(() =>
      document.querySelectorAll('#board g.ui-content > g')[3]?.querySelector('text')?.getAttribute('fill'));
    await page.hover('#addDateMenu [data-a="presets"]');
    await page.hover('.popover button[data-i="4"]');
    await page.click('.popover button[data-i="4"]');
    const dateFillAfter = await page.evaluate(() =>
      document.querySelectorAll('#board g.ui-content > g')[3]?.querySelector('text')?.getAttribute('fill'));
    expect(dateFillAfter).not.toBe(dateFillBefore);
    expect(dateFillAfter).toBe('#75153A'); // PRESETS[4] = Marigold Light / Soil
  });
});

test.describe('subtitle / date toggles', () => {
  test('subtitle toggle button flips label and turns the subtitle on', async ({ page }) => {
    await page.click('#addSubtitleBtn');
    const toggle = page.locator('#subtitleToggleBtn');
    await expect(toggle).toHaveText('Show subtitle');
    await toggle.click();
    await expect(toggle).toHaveText('Hide subtitle');
    await expect(page.locator('#addSubtitleBtn')).toHaveClass(/active/);
  });

  test('date toggle button flips label and turns the date on', async ({ page }) => {
    await page.click('#addDateBtn');
    const toggle = page.locator('#dateToggleBtn');
    await expect(toggle).toHaveText('Show date');
    await toggle.click();
    await expect(toggle).toHaveText('Hide date');
    await expect(page.locator('#addDateBtn')).toHaveClass(/active/);
  });
});

test.describe('highlight all / un-highlight all', () => {
  test('defaults to "Un-highlight all" and toggles both ways', async ({ page }) => {
    await page.click('#textAppearanceBtn');
    const btn = page.locator('#taToggleAllBtn');
    await expect(btn).toHaveText('Un-highlight all');
    await btn.click();
    await expect(btn).toHaveText('Highlight all');
    await btn.click();
    await expect(btn).toHaveText('Un-highlight all');
  });
});

test.describe('save / load', () => {
  test('saving adds an entry that Load can then open', async ({ page }) => {
    await page.fill('#layoutName', 'Smoke Test Layout');
    await page.click('#saveBtn');
    await expect(page.locator('#status')).toContainText('Saved');
    await page.click('#loadBtn');
    await expect(page.locator('#loadMenu')).toContainText('Smoke Test Layout');
  });
});

test.describe('fresh-load layout', () => {
  test('the default title wraps to fit the canvas instead of overflowing it', async ({ page }) => {
    // regression: S.frame.width starts null, which used to skip wrapping
    // entirely and let a too-long single line run off both edges
    const rightEdges = await page.evaluate(() => {
      const fills = Array.from(document.querySelectorAll('#board rect')).filter(r => {
        const f = r.getAttribute('fill');
        return f && f !== 'transparent' && f !== 'none' && !r.getAttribute('class');
      });
      return fills.map(r => parseFloat(r.getAttribute('x')) + parseFloat(r.getAttribute('width')));
    });
    for (const right of rightEdges) {
      expect(right).toBeLessThan(1930); // 1920 canvas + small padding tolerance
    }
  });
});
