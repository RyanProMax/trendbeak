import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { launch, openPage, layout, out } from './signal-check-utils.mjs';
const browser = await launch(), report = [];
try {
    for (const width of [1440, 390, 320]) {
        const { page, context, errors } = await openPage(browser, width);
        let missingRequests = 0;
        page.on('request', r => { if (r.url().includes('/api/markets/US?symbol=TSLA'))
            missingRequests++; });
        await page.route('**/api/search?*', route => { const q = new URL(route.request().url()).searchParams.get('q'); return route.fulfill({ json: { data: q === 'NVDA' ? [{ market: 'US', symbol: 'NVDA', code: 'NVDA', name: '英伟达', kind: 'stock', prepared: true }] : [{ market: 'US', symbol: 'TSLA', code: 'TSLA', name: '特斯拉', kind: 'stock', prepared: false }] } }); });
        const input = page.getByRole('combobox');
        await input.fill('TSLA');
        const pending = page.getByRole('option').filter({ hasText: '特斯拉' });
        await pending.waitFor();
        assert.match(await pending.innerText(), /历史待收录/);
        await layout(page, 'unprepared search ' + width);
        await page.screenshot({ path: `${out}/${width}-unprepared-search.png`, fullPage: true });
        await pending.click();
        await page.getByText('尚未收录特斯拉，仍显示标普 500', { exact: true }).waitFor();
        assert.equal(await page.locator('[data-market=US] .instrument-name').innerText(), '标普 500');
        await page.waitForTimeout(350);
        assert.equal(missingRequests, 1);
        assert.equal(await page.locator('[data-market=US][aria-busy=true]').count(), 0);
        await layout(page, 'missing snapshot ' + width);
        await page.screenshot({ path: `${out}/${width}-missing-snapshot.png`, fullPage: true });
        await input.fill('NVDA');
        await page.getByRole('option').filter({ hasText: '英伟达' }).click();
        await page.locator('[data-market=US].stock-selected').waitFor();
        assert.match(await page.locator('[data-market=US] .instrument-name').innerText(), /NVDA/);
        await layout(page, 'prepared stock ' + width);
        await page.screenshot({ path: `${out}/${width}-prepared-nvda.png`, fullPage: true });
        await page.getByRole('button', { name: '返回大盘', exact: true }).click();
        await page.waitForFunction(() => !document.querySelector('[data-market=US]').classList.contains('stock-selected'));
        assert.deepEqual(errors, []);
        report.push({ width, missingRequests, unpreparedExplicit: true, previousIndexPreserved: true, preparedNVDA: true, backToIndex: true, noOverflow: true, errors });
        await context.close();
    }
    await writeFile(out + '/snapshot-search-results.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
}
finally {
    await browser.close();
}
