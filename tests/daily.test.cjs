const assert = require('node:assert/strict');
const A = require('../analytics.js');

const columns = ['日付', '担当者', '処理件数', '作業時間（分）'];
const row = (date, staff, count, minutes) => ({
  '日付': date, '担当者': staff, '処理件数': String(count), '作業時間（分）': String(minutes)
});
const records = A.validateRecords([
  row('2026-10-03', '田中', 0, 8),
  row('2026-10-01', '田中', 2, 6),
  row('2026-10-01', '佐藤', 1, 9),
  row('2026-10-02', '佐藤', 4, 20),
  row('2026-10-03', '佐藤', 0, 0)
], columns);

const daily = A.summarizeDaily(records);
assert.deepEqual(daily.map(day => day.date), ['2026-10-01', '2026-10-02', '2026-10-03']);
assert.deepEqual(daily[0], { date: '2026-10-01', count: 3, minutes: 15, average: 5 });
assert.deepEqual(daily[1], { date: '2026-10-02', count: 4, minutes: 20, average: 5 });
assert.deepEqual(daily[2], { date: '2026-10-03', count: 0, minutes: 8, average: null });
assert.deepEqual(A.summarizeDaily(records.filter(record => record.staff === '田中')), [
  { date: '2026-10-01', count: 2, minutes: 6, average: 3 },
  { date: '2026-10-03', count: 0, minutes: 8, average: null }
]);
assert.deepEqual(A.summarizeDaily([]), []);

console.log('PASS: 6 daily aggregation assertions');
