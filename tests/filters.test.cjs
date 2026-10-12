const assert = require('node:assert/strict');
const A = require('../analytics.js');

const columns = ['日付', '担当者', '処理件数', '作業時間（分）'];
const row = (date, staff, count, minutes) => ({
  '日付': date, '担当者': staff, '処理件数': String(count), '作業時間（分）': String(minutes)
});
const records = A.validateRecords([
  row('2026-10-01', '田中', 2, 20),
  row('2026-10-01', '佐藤', 5, 10),
  row('2026-10-02', '田中', 1, 4),
  row('2026-10-03', '鈴木', 0, 5)
], columns);

assert.equal(A.filterRecords(records, { startDate: '2026-10-01', endDate: '2026-10-03' }).length, 4);
assert.equal(A.filterRecords(records, { startDate: '2026-10-01', endDate: '2026-10-01' }).length, 2);
assert.equal(A.filterRecords(records, { startDate: '2026-10-03', endDate: '2026-10-03' }).length, 1);
assert.equal(A.filterRecords(records, { startDate: '2026-10-04', endDate: '2026-10-05' }).length, 0);
assert.throws(() => A.filterRecords(records, { startDate: '2026-10-03', endDate: '2026-10-01' }), /開始日は終了日以前/);

const selected = A.filterRecords(records, { staff: '田中', startDate: '2026-10-02', endDate: '2026-10-03' });
assert.equal(selected.length, 1);
assert.equal(A.summarize(selected).totalCount, 1);
assert.deepEqual(A.summarizeDaily(selected).map(day => day.date), ['2026-10-02']);

const periodRows = A.filterRecords(records, { startDate: '2026-10-01', endDate: '2026-10-02' });
const staffRows = A.filterRecords(records, { staff: '田中', startDate: '2026-10-01', endDate: '2026-10-02' });
assert.equal(A.summarize(staffRows, A.summarize(periodRows).totalCount).people[0].share, 3 / 8 * 100);
assert.equal(A.summarize(records).people.find(person => person.staff === '鈴木').share, 0);
const zeroCount = A.validateRecords([row('2026-10-01', '対象者', 0, 5)], columns);
assert.equal(A.summarize(zeroCount).people[0].share, null);

const people = A.summarize(records).people;
assert.deepEqual(A.rankStaff(people, 'count').map(person => person.staff), ['佐藤', '田中', '鈴木']);
assert.deepEqual(A.rankStaff(people, 'average').map(person => person.staff), ['田中', '佐藤', '鈴木']);
assert.equal(A.rankStaff(people, 'average')[2].average, null);
assert.deepEqual(A.rankStaff(people, 'count').map(person => person.staff), people.map(person => person.staff));

console.log('PASS: 12 period and staff ranking assertions');
