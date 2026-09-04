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
    await page.click('#addSubtitleBtn');
    await expect(page.locator('#addSubtitleMenu')).not.toHaveClass(/closed/);
    await page.click('#exportMenuBtn');
    await expect(page.locator('#addSubtitleMenu')).toHaveClass(/closed/);
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
    await page.click('#exportMenuBtn');
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
  test('subtitle toggle button flips label and gets .active, not the header trigger', async ({ page }) => {
    await page.click('#addSubtitleBtn');
    const toggle = page.locator('#subtitleToggleBtn');
    await expect(toggle).toHaveText('Show subtitle');
    await expect(toggle).not.toHaveClass(/active/);
    await toggle.click();
    await expect(toggle).toHaveText('Hide subtitle');
    await expect(toggle).toHaveClass(/active/);
    await expect(page.locator('#addSubtitleBtn')).not.toHaveClass(/active/);
  });

  test('date toggle button flips label and gets .active, not the header trigger', async ({ page }) => {
    await page.click('#addDateBtn');
    const toggle = page.locator('#dateToggleBtn');
    await expect(toggle).toHaveText('Show date');
    await expect(toggle).not.toHaveClass(/active/);
    await toggle.click();
    await expect(toggle).toHaveText('Hide date');
    await expect(toggle).toHaveClass(/active/);
    await expect(page.locator('#addDateBtn')).not.toHaveClass(/active/);
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
  test('saving adds an entry that the Library can then open', async ({ page }) => {
    await page.fill('#layoutName', 'Smoke Test Layout');
    await page.click('#saveBtn');
    await expect(page.locator('#status')).toContainText('Saved');
    await page.click('#loadBtn');
    await expect(page.locator('#libraryGrid')).toContainText('Smoke Test Layout');
  });
});

test.describe('library overlay', () => {
  async function saveAs(page, name) {
    await page.fill('#layoutName', name);
    await page.click('#saveBtn');
    /* A second save under a different name, while a previous save this
       session is still "current", pops the Save conflict menu (Rename and
       update / Save as a new layout) instead of saving immediately. */
    const menu = page.locator('#saveMenu');
    if (!(await menu.evaluate(el => el.classList.contains('closed')))) {
      await menu.locator('button', { hasText: 'Save as a new layout' }).click();
    }
    await expect(page.locator('#status')).toContainText('Saved');
  }

  test('Library button opens the overlay, Back to canvas closes it', async ({ page }) => {
    const overlay = page.locator('#libraryOverlay');
    await expect(overlay).toHaveClass(/closed/);
    await page.click('#loadBtn');
    await expect(overlay).not.toHaveClass(/closed/);
    await page.click('#libraryBackBtn');
    await expect(overlay).toHaveClass(/closed/);
  });

  test('each saved layout gets a card with a real SVG preview', async ({ page }) => {
    await saveAs(page, 'Preview Check');
    await page.click('#loadBtn');
    const card = page.locator('.library-card', { hasText: 'Preview Check' });
    await expect(card).toBeVisible();
    await expect(card.locator('.library-preview svg')).toHaveCount(1);
  });

  test('search filters cards as you type', async ({ page }) => {
    await saveAs(page, 'Alpha Layout');
    await saveAs(page, 'Beta Layout');
    await page.click('#loadBtn');
    await expect(page.locator('.library-card')).toHaveCount(2);
    await page.fill('#librarySearch', 'Alpha');
    await expect(page.locator('.library-card:visible')).toHaveCount(1);
    await expect(page.locator('.library-card:visible')).toContainText('Alpha Layout');
  });

  test('Open loads the layout and closes the overlay', async ({ page }) => {
    await page.fill('#text', 'Original Title Content');
    await saveAs(page, 'Open Me');
    /* #text's 'input' handler coalesces rapid edits into one history push
       (pushHistoryCoalesced, 400ms) — without this wait the edit below can
       land inside that window and never actually flip `dirty`, since it'd
       look like a continuation of the edit saveAs's own field-filling just
       made rather than a new one. */
    await page.waitForTimeout(450);
    await page.fill('#text', 'Something else entirely');
    await page.click('#loadBtn');
    const card = page.locator('.library-card', { hasText: 'Open Me' });
    await card.locator('button[data-a="open"]').click();
    await expect(page.locator('#libraryOverlay')).toHaveClass(/closed/);
    await page.click('.modal-box button:has-text("Discard and continue")'); // unsaved-changes guard
    await expect(page.locator('#text')).toHaveValue('Original Title Content');
  });

  test('Delete moves the card to Trash', async ({ page }) => {
    await saveAs(page, 'Delete Me');
    await page.click('#loadBtn');
    const card = page.locator('.library-card', { hasText: 'Delete Me' });
    await card.locator('button[data-a="delete"]').click();
    await page.click('.modal-box button:has-text("Move to Trash")');
    await expect(page.locator('.library-card', { hasText: 'Delete Me' })).toHaveCount(0);
    await page.click('#libraryTrashBtn');
    await expect(page.locator('.library-card', { hasText: 'Delete Me' })).toBeVisible();
    await expect(page.locator('.library-card', { hasText: 'Delete Me' })).toContainText('days left');
  });

  test('select all + bulk delete moves every card to Trash', async ({ page }) => {
    await saveAs(page, 'Bulk One');
    await saveAs(page, 'Bulk Two');
    await page.click('#loadBtn');
    await expect(page.locator('.library-card')).toHaveCount(2);
    await page.click('#librarySelectAllBtn');
    await expect(page.locator('#libraryDeleteSelectedBtn')).toBeEnabled();
    await page.click('#libraryDeleteSelectedBtn');
    await page.click('.modal-box button:has-text("Move to Trash")');
    await expect(page.locator('.library-card')).toHaveCount(0);
    await page.click('#libraryTrashBtn');
    await expect(page.locator('.library-card')).toHaveCount(2);
  });

  test('Restore brings a trashed layout back to the main list', async ({ page }) => {
    await saveAs(page, 'Restore Me');
    await page.click('#loadBtn');
    await page.locator('.library-card', { hasText: 'Restore Me' }).locator('button[data-a="delete"]').click();
    await page.click('.modal-box button:has-text("Move to Trash")');
    await page.click('#libraryTrashBtn');
    await page.locator('.library-card', { hasText: 'Restore Me' }).locator('button[data-a="restore"]').click();
    await expect(page.locator('.library-card', { hasText: 'Restore Me' })).toHaveCount(0);
    await page.click('#libraryTrashBtn'); // back to the main list
    await expect(page.locator('.library-card', { hasText: 'Restore Me' })).toBeVisible();
  });

  test('Delete forever removes a trashed layout permanently', async ({ page }) => {
    await saveAs(page, 'Purge Me');
    await page.click('#loadBtn');
    await page.locator('.library-card', { hasText: 'Purge Me' }).locator('button[data-a="delete"]').click();
    await page.click('.modal-box button:has-text("Move to Trash")');
    await page.click('#libraryTrashBtn');
    await page.locator('.library-card', { hasText: 'Purge Me' }).locator('button[data-a="purge"]').click();
    await page.click('.modal-box button:has-text("Delete forever")');
    await expect(page.locator('.library-card', { hasText: 'Purge Me' })).toHaveCount(0);
  });

  test('list view shows text-only rows with no preview svg', async ({ page }) => {
    await saveAs(page, 'List Row');
    await page.click('#loadBtn');
    await expect(page.locator('.library-card svg')).toHaveCount(1);
    await page.click('#libraryListViewBtn');
    await expect(page.locator('#libraryGrid')).toHaveClass(/list-view/);
    await expect(page.locator('.library-card', { hasText: 'List Row' })).toBeVisible();
    await expect(page.locator('.library-card svg')).toHaveCount(0);
    await page.click('#libraryGridViewBtn');
    await expect(page.locator('.library-card svg')).toHaveCount(1);
  });

  test('sort toggles between new-to-old and alphabetical', async ({ page }) => {
    await saveAs(page, 'Zeta');
    await saveAs(page, 'Alpha');
    await page.click('#loadBtn');
    const namesNewOld = await page.locator('.library-card .name').allTextContents();
    expect(namesNewOld[0]).toBe('Alpha'); // saved most recently, so newest-first
    await page.click('#librarySortBtn');
    await page.click('#librarySortMenu button[data-sort="alpha"]');
    const namesAlpha = await page.locator('.library-card .name').allTextContents();
    expect(namesAlpha[0]).toBe('Alpha');
    expect(namesAlpha[1]).toBe('Zeta');
  });
});

test.describe('title resize frame visibility', () => {
  test('hidden on load, shows on hovering the canvas, hides again once the pointer leaves it', async ({ page }) => {
    const frame = page.locator('#board .resize-frame');
    await expect(frame).toHaveCSS('opacity', '0');

    const board = page.locator('#board');
    const box = await board.boundingBox();
    // an empty part of the canvas, deliberately not on the title itself —
    // the whole canvas is the hover target, not just the words
    await page.mouse.move(box.x + box.width - 40, box.y + 40);
    await expect(frame).toHaveCSS('opacity', '1');

    await page.mouse.move(box.x - 100, box.y - 100); // off the canvas entirely
    await expect(frame).toHaveCSS('opacity', '0');
  });

  test('shows while the title text field is focused, even without hovering', async ({ page }) => {
    const frame = page.locator('#board .resize-frame');
    await page.evaluate(() => document.getElementById('text').focus());
    await expect(frame).toHaveCSS('opacity', '1');
    await page.mouse.move(50, 800); // outside the canvas
    await expect(frame).toHaveCSS('opacity', '1'); // still focused, so still visible
  });

  test('stays visible for the whole drag even if the pointer leaves the canvas', async ({ page }) => {
    const frame = page.locator('#board .resize-frame');
    const handle = page.locator('.frame-handle.resize');
    await page.locator('.hit-word').first().hover(); // reveal it first, so the handle is interactable
    const box = await handle.boundingBox();

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(50, 800, { steps: 5 }); // drag far outside the canvas
    await expect(frame).toHaveCSS('opacity', '1'); // still mid-drag
    await page.mouse.up();
    await expect(frame).toHaveCSS('opacity', '0'); // released, and not hovering/focused anymore
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
