/* Process Insight - データ検証・集計ロジック（ブラウザ/Node共用） */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Analytics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const REQUIRED_COLUMNS = ['日付', '担当者', '処理件数', '作業時間（分）'];
  const MAX_ROWS = 20000;
  function normalizeHeader(h) { return String(h ?? '').replace(/^\ufeff/, '').trim(); }

  function validIsoDate(text) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
    const [year, month, day] = text.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
  }

  function validateRecords(data, columns) {
    const fieldNames = columns.map(normalizeHeader);
    if (new Set(fieldNames).size !== fieldNames.length) throw new Error('CSVのヘッダーに重複した列があります。');
    const missing = REQUIRED_COLUMNS.filter(col => !fieldNames.includes(col));
    if (missing.length) throw new Error(`必須列がありません: ${missing.join('、')}。列名と文字コード（UTF-8）を確認してください。`);
    if (!data.length) throw new Error('CSVにデータ行がありません。');
    if (data.length > MAX_ROWS) throw new Error(`データ行が多すぎます（上限 ${MAX_ROWS.toLocaleString('ja-JP')} 行）。`);

    const parsed = [], errors = [];
    let totalCount = 0, totalMinutes = 0;
    data.forEach((record, index) => {
      const rowNumber = index + 2;
      const date = String(record['日付'] ?? '').trim();
      const staff = String(record['担当者'] ?? '').trim();
      const rawCount = String(record['処理件数'] ?? '').trim();
      const rawMinutes = String(record['作業時間（分）'] ?? '').trim();
      let problem = '';
      if (!validIsoDate(date)) problem = '日付が不正（YYYY-MM-DD）';
      else if (!staff || staff.length > 80) problem = '担当者が空欄または80文字超';
      else if (!/^\d+$/.test(rawCount) || !Number.isSafeInteger(Number(rawCount))) problem = '処理件数は0以上の整数';
      else if (!/^(?:\d+)(?:\.\d+)?$/.test(rawMinutes) || !Number.isFinite(Number(rawMinutes))) problem = '作業時間は0以上の数値';
      if (!problem) {
        const nextCount = totalCount + Number(rawCount);
        const nextMinutes = totalMinutes + Number(rawMinutes);
        if (!Number.isSafeInteger(nextCount) || !Number.isFinite(nextMinutes)) problem = '合計値が安全な数値範囲を超えています';
        else { totalCount = nextCount; totalMinutes = nextMinutes; }
      }
      if (problem) errors.push(`データ行 ${rowNumber}: ${problem}`);
      else parsed.push({ date, staff, count: Number(rawCount), minutes: Number(rawMinutes) });
    });
    if (errors.length) throw new Error(`入力チェックで ${errors.length} 行に問題が見つかりました。\n${errors.slice(0, 4).join('\n')}${errors.length > 4 ? '\n…ほかのエラーはCSVを修正して再読み込みしてください。' : ''}\n※データは一切反映していません。`);
    return parsed;
  }

  function summarize(rows, shareTotalCount = undefined) {
    const map = new Map();
    let totalCount = 0, totalMinutes = 0;
    for (const r of rows) {
      const current = map.get(r.staff) || { staff: r.staff, count: 0, minutes: 0, rows: 0 };
      current.count += r.count;
      current.minutes += r.minutes;
      current.rows += 1;
      map.set(r.staff, current);
      totalCount += r.count;
      totalMinutes += r.minutes;
    }
    const shareDenominator = shareTotalCount === undefined ? totalCount : shareTotalCount;
    const people = [...map.values()].map(s => ({
      ...s,
      average: s.count === 0 ? null : s.minutes / s.count,
      share: shareDenominator === 0 ? null : s.count / shareDenominator * 100
    })).sort((a, b) => b.count - a.count || a.staff.localeCompare(b.staff, 'ja'));
    return { totalCount, totalMinutes, average: totalCount === 0 ? null : totalMinutes / totalCount, recordCount: rows.length, people };
  }

  function summarizeDaily(rows) {
    const byDate = new Map();
    for (const row of rows) {
      const day = byDate.get(row.date) || { date: row.date, count: 0, minutes: 0 };
      day.count += row.count;
      day.minutes += row.minutes;
      byDate.set(row.date, day);
    }
    return [...byDate.values()]
      .map(day => ({ ...day, average: day.count === 0 ? null : day.minutes / day.count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  function rankStaff(people, metric = 'count') {
    return [...people].sort((a, b) => {
      if (metric === 'average') {
        if (a.average === null) return b.average === null ? a.staff.localeCompare(b.staff, 'ja') : 1;
        if (b.average === null) return -1;
        return b.average - a.average || a.staff.localeCompare(b.staff, 'ja');
      }
      return b.count - a.count || a.staff.localeCompare(b.staff, 'ja');
    });
  }

  function filterRecords(rows, { staff = '', startDate = '', endDate = '' } = {}) {
    if (startDate && endDate && startDate > endDate) throw new Error('開始日は終了日以前にしてください。');
    return rows.filter(row =>
      (!staff || row.staff === staff) &&
      (!startDate || row.date >= startDate) &&
      (!endDate || row.date <= endDate)
    );
  }

  /* CDN読み込みに失敗しても動く最小CSVパーサー。引用符・改行・カンマ・二重引用符を処理する。 */
  function parseCsvFallback(input) {
    const text = String(input).replace(/^\ufeff/, '');
    const table = [], errors = [];
    let row = [], field = '', quoted = false, justClosed = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') { quoted = false; justClosed = true; }
        else field += c;
      } else if (c === '"') {
        if (field === '' && !justClosed) quoted = true;
        else { errors.push({ message: '引用符の位置が不正です' }); break; }
      } else if (c === ',') {
        row.push(field); field = ''; justClosed = false;
      } else if (c === '\r' || c === '\n') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field);
        if (row.some(v => v.trim() !== '')) table.push(row);
        row = []; field = ''; justClosed = false;
      } else {
        if (justClosed && c.trim() !== '') { errors.push({ message: '閉じ引用符の後に余分な文字があります' }); break; }
        field += c;
      }
    }
    if (quoted) errors.push({ message: '引用符が閉じられていません' });
    if (field !== '' || row.length) { row.push(field); if (row.some(v => v.trim() !== '')) table.push(row); }
    const fields = (table.shift() || []).map(normalizeHeader);
    const data = table.map((line, index) => {
      if (line.length !== fields.length) errors.push({ message: `データ行 ${index + 2} の列数がヘッダーと一致しません` });
      return Object.fromEntries(fields.map((k, j) => [k, line[j] ?? '']));
    });
    return { data, errors, meta: { fields } };
  }

  function safeCsv(rows, columns) {
    const escape = val => {
      let s = String(val ?? '');
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [columns.map(escape).join(','), ...rows.map(r => columns.map(k => escape(r[k])).join(','))].join('\r\n');
  }

  return { REQUIRED_COLUMNS, MAX_ROWS, normalizeHeader, validIsoDate, validateRecords, summarize, summarizeDaily, rankStaff, filterRecords, parseCsvFallback, safeCsv };
});
