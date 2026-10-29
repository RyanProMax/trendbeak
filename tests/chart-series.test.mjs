import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
let vite, calendarForRange, chartSegments;
before(async () => {
  vite = await createServer({ configFile:false, appType:'custom', server:{middlewareMode:true,hmr:false} });
  ({calendarForRange, chartSegments} = await vite.ssrLoadModule('/src/lib/chart-series.ts'));
});
after(async () => vite?.close());
test('aligned annual calendars preserve known returns and distinguish closed days from missing sessions', () => {
  const snapshot = {instrument:{market:'US'},days:[{date:'2026-10-28',change:.28,status:'trading'}]};
  const days = calendarForRange(snapshot,'2026-10-29');
  assert.equal(days.length,365);
  assert.deepEqual(days.at(-2), snapshot.days[0]);
  assert.deepEqual(days.at(-1),{date:'2026-10-29',change:null,status:'missing'});
  assert.equal(days.find(d=>d.date==='2026-10-25').status,'closed');
});
test('a missing trading-day observation splits history instead of drawing a fabricated bridge', () => {
  const days = [{date:'2026-10-26',status:'trading'},{date:'2026-10-27',status:'trading'},{date:'2026-10-28',status:'trading'}];
  const points = [{date:'2026-10-26',value:30},{date:'2026-10-28',value:40}];
  assert.deepEqual(chartSegments(days,points),[[points[0]],[points[1]]]);
});
test('weekends preserve continuity, and a lone dated CNN observation remains a point', () => {
  const days = [{date:'2026-10-23',status:'trading'},{date:'2026-10-24',status:'closed'},{date:'2026-10-25',status:'closed'},{date:'2026-10-26',status:'trading'}];
  const points = [{date:'2026-10-23',value:30},{date:'2026-10-26',value:40}];
  assert.deepEqual(chartSegments(days,points),[points]);
  assert.deepEqual(chartSegments(days,[points[1]]),[[points[1]]]);
});
