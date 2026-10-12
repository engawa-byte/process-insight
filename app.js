/* Process Insight - UI制御 */
(() => {
  'use strict';
  const { validateRecords, summarize, summarizeDaily, rankStaff, filterRecords, parseCsvFallback, normalizeHeader, safeCsv } = window.Analytics;
  const $ = id => document.getElementById(id);
  const state = { rows: [], fileName: '', activeStaff: '', minDate: '', maxDate: '', chart: null, dailyChart: null, dailyMetric: 'count', staffMetric: 'count', loadVersion: 0 };
  const intFmt = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 });
  const decFmt = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 });
  const safeStatus = (id, message) => { $(id).textContent = message; $(id).hidden = !message; };
  const clearStatus = () => { safeStatus('errorBox', ''); safeStatus('successBox', ''); };
  const dropzone = $('dropzone');
  const showLoadError = message => {
    const retained = state.rows.length ? `\n表示中の分析は前回読み込んだ「${state.fileName}」の結果です。` : '';
    safeStatus('errorBox', `${message}${retained}`);
  };

  function parseText(text) {
    const result = window.Papa ? window.Papa.parse(text, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: normalizeHeader,
      dynamicTyping: false
    }) : parseCsvFallback(text);
    if (result.errors.length) {
      throw new Error(`CSV構文エラー: ${result.errors.slice(0, 3).map(err => err.message).join(' / ')}`);
    }
    if (result.meta.renamedHeaders && Object.keys(result.meta.renamedHeaders).length) {
      throw new Error('CSVのヘッダーに重複した列があります。');
    }
    return validateRecords(result.data, result.meta.fields || []);
  }

  function getFilteredRows() {
    try {
      const rows = filterRecords(state.rows, { staff: state.activeStaff, startDate: $('startDate').value, endDate: $('endDate').value });
      safeStatus('filterError', '');
      return rows;
    } catch (err) {
      safeStatus('filterError', err.message);
      return null;
    }
  }

  function acceptCsv(text, name, isDemo = false) {
    const rows = parseText(text); // バリデーション完了まで画面の元データを変更しない
    state.rows = rows;
    state.fileName = name;
    state.activeStaff = '';
    state.minDate = rows.reduce((min, row) => row.date < min ? row.date : min, rows[0].date);
    state.maxDate = rows.reduce((max, row) => row.date > max ? row.date : max, rows[0].date);
    $('startDate').value = state.minDate;
    $('endDate').value = state.maxDate;
    $('startDate').disabled = false;
    $('endDate').disabled = false;
    const people = [...new Set(rows.map(r => r.staff))].sort((a, b) => a.localeCompare(b, 'ja'));
    const filter = $('staffFilter');
    filter.replaceChildren(new Option('すべての担当者', ''));
    people.forEach(person => filter.add(new Option(person, person)));
    filter.disabled = false;
    $('resetFilter').disabled = false;
    $('exportCsv').disabled = false;
    $('sourceMeta').textContent = '読み込み済み';
    $('loadedFileName').textContent = name;
    $('loadedFileName').title = name;
    $('loadedFileMeta').textContent = `${intFmt.format(rows.length)} 行のデータ`;
    $('demoDataLabel').hidden = !isDemo;
    $('loadedFile').hidden = false;
    document.querySelector('.data-panel').classList.add('has-data');
    document.querySelector('.table-section').classList.add('has-data');
    document.body.classList.add('has-data');
    clearStatus();
    safeStatus('successBox', 'CSVを読み込みました。');
    render();
  }

  function render() {
    const filtered = getFilteredRows();
    const validRange = filtered !== null;
    const rows = filtered || [];
    const periodRows = validRange ? filterRecords(state.rows, { startDate: $('startDate').value, endDate: $('endDate').value }) : [];
    const periodTotalCount = summarize(periodRows).totalCount;
    const data = summarize(rows, periodTotalCount);
    const showValues = state.rows.length && validRange;
    $('totalCount').textContent = showValues ? `${intFmt.format(data.totalCount)} 件` : '—';
    $('totalMinutes').textContent = showValues ? `${decFmt.format(data.totalMinutes)} 分` : '—';
    $('averageMinutes').textContent = showValues && data.average !== null ? `${decFmt.format(data.average)} 分` : '—';
    $('recordCount').textContent = showValues ? `${intFmt.format(data.recordCount)} 行` : '—';
    $('tableMeta').textContent = `${data.people.length} 名の担当者`;
    $('chartMeta').textContent = data.people.length > 30 ? `上位30名 / 全${intFmt.format(data.people.length)}名` : `${data.people.length} 名の担当者`;
    $('filterContext').textContent = !state.rows.length ? 'CSV読込後に利用できます' : !validRange ? '期間を確認してください' : state.activeStaff ? `${state.activeStaff} のデータを表示` : $('startDate').value === state.minDate && $('endDate').value === state.maxDate ? '全データを表示' : '指定期間のデータを表示';
    $('resetFilter').disabled = !state.activeStaff;
    $('exportCsv').disabled = !validRange || !rows.length;
    const body = $('resultsBody');
    body.replaceChildren();
    if (!rows.length) {
      const tr = document.createElement('tr'), td = document.createElement('td');
      td.colSpan = 5; td.className = 'empty-table'; td.textContent = !state.rows.length ? 'CSVを読み込むと集計結果が表示されます' : validRange ? '指定条件に一致するデータがありません' : '開始日と終了日を確認してください'; tr.appendChild(td); body.appendChild(tr);
    } else {
      for (const row of data.people) {
        const tr = document.createElement('tr');
        const values = [row.staff, `${intFmt.format(row.count)} 件`, `${decFmt.format(row.minutes)} 分`, row.average === null ? '—' : `${decFmt.format(row.average)} 分`, row.share === null ? '—' : `${decFmt.format(row.share)} %`];
        values.forEach((value, index) => { const td = document.createElement('td'); td.textContent = value; if (index) td.className = 'numeric'; tr.appendChild(td); });
        body.appendChild(tr);
      }
    }
    renderDailyChart(summarizeDaily(rows));
    renderChart(rankStaff(data.people, state.staffMetric).slice(0, 30));
  }

  function renderDailyChart(days) {
    if (state.dailyChart) { state.dailyChart.destroy(); state.dailyChart = null; }
    const averageMode = state.dailyMetric === 'average';
    const hasValue = days.some(day => !averageMode || day.average !== null);
    $('dailyCount').setAttribute('aria-pressed', String(!averageMode));
    $('dailyAverage').setAttribute('aria-pressed', String(averageMode));
    $('dailyDescription').textContent = averageMode ? '日ごとの総作業時間 ÷ 総処理件数。件数0の日は算出不可' : '日付ごとの処理件数を表示';
    $('dailyMeta').textContent = `${intFmt.format(days.length)} 日`;
    $('dailyChart').setAttribute('aria-label', averageMode ? '日別平均処理時間（分/件）の折れ線グラフ。件数0の日は算出不可' : '日別処理件数の折れ線グラフ');
    $('dailyChartFrame').style.minWidth = days.length > 10 ? `${Math.min(6400, days.length * 42 + 80)}px` : '';
    $('dailyEmpty').hidden = hasValue;
    $('dailyChart').hidden = !hasValue;
    $('dailyFallback').hidden = true;
    if (!hasValue) {
      $('dailyEmptyTitle').textContent = days.length ? '平均処理時間を算出できません' : '表示するデータがありません';
      $('dailyEmptyDetail').textContent = days.length ? '処理件数が0の日のみです' : !state.rows.length ? 'CSVを読み込むと日別推移が表示されます' : $('filterError').hidden ? '指定条件に一致するデータがありません' : '開始日と終了日を確認してください';
      return;
    }

    if (typeof window.Chart === 'function') {
      state.dailyChart = new window.Chart($('dailyChart').getContext('2d'), {
        type: 'line',
        data: { labels: days.map(day => day.date), datasets: [{
          label: averageMode ? '平均処理時間' : '処理件数',
          data: days.map(day => averageMode ? day.average : day.count),
          borderColor: '#2759ae', backgroundColor: '#2759ae', borderWidth: 2,
          pointRadius: days.length > 60 ? 0 : 2, pointHoverRadius: 4, pointHitRadius: 8,
          spanGaps: false, tension: 0
        }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          animation: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: context => context.parsed.y === null ? '算出不可' : `${averageMode ? decFmt.format(context.parsed.y) : intFmt.format(context.parsed.y)} ${averageMode ? '分/件' : '件'}` } } },
          scales: {
            x: { grid: { display: false }, ticks: { color: '#4b5565', autoSkip: true, maxTicksLimit: 12, maxRotation: 0 } },
            y: { beginAtZero: true, grid: { color: '#e3e7ed' }, ticks: { color: '#4b5565', precision: averageMode ? 2 : 0, callback: value => averageMode ? decFmt.format(value) : intFmt.format(value) } }
          }
        }
      });
    } else {
      $('dailyChart').hidden = true;
      const fallback = $('dailyFallback'); fallback.hidden = false; fallback.replaceChildren();
      for (const day of days) {
        const row = document.createElement('div'); row.className = 'daily-fallback-row';
        const date = document.createElement('span'); date.textContent = day.date;
        const value = document.createElement('strong'); value.textContent = averageMode ? (day.average === null ? '算出不可' : `${decFmt.format(day.average)} 分/件`) : `${intFmt.format(day.count)} 件`;
        row.append(date, value); fallback.appendChild(row);
      }
    }
  }

  function renderChart(people) {
    if (state.chart) { state.chart.destroy(); state.chart = null; }
    const averageMode = state.staffMetric === 'average';
    const hasValue = people.some(person => !averageMode || person.average !== null);
    $('staffCount').setAttribute('aria-pressed', String(!averageMode));
    $('staffAverage').setAttribute('aria-pressed', String(averageMode));
    $('chartTitle').textContent = averageMode ? '担当者別の平均処理時間' : '担当者別の処理件数';
    $('chartDescription').textContent = averageMode ? '平均処理時間が長い順。件数0は算出不可' : '処理件数が多い順に表示';
    $('staffChart').setAttribute('aria-label', averageMode ? '担当者別平均処理時間（分/件）の棒グラフ。件数0は算出不可。詳細数値は下の集計表を参照してください' : '担当者別処理件数の棒グラフ。詳細数値は下の集計表を参照してください');
    $('chartEmpty').hidden = hasValue;
    $('chartEmpty').querySelector('strong').textContent = people.length ? '平均処理時間を算出できません' : '表示するデータがありません';
    $('chartEmptyDetail').textContent = people.length ? '処理件数が0の担当者のみです' : !state.rows.length ? 'CSVを読み込むとグラフが表示されます' : $('filterError').hidden ? '指定条件に一致するデータがありません' : '開始日と終了日を確認してください';
    $('staffChart').hidden = !hasValue;
    $('fallbackChart').hidden = true;
    if (!hasValue) return;
    $('chartWrapper').style.height = `${Math.max(310, people.length * 38 + 64)}px`;

    if (typeof window.Chart === 'function') {
      const ctx = $('staffChart').getContext('2d');
      state.chart = new window.Chart(ctx, {
        type: 'bar',
        data: { labels: people.map(p => averageMode && p.average === null ? `${p.staff}（算出不可）` : p.staff), datasets: [{ label: averageMode ? '平均処理時間（分/件）' : '処理件数', data: people.map(p => averageMode ? p.average : p.count), backgroundColor: '#2759ae', borderRadius: 3, maxBarThickness: 22, hoverBackgroundColor: '#194991' }] },
        options: {
          indexAxis: 'y',
          maintainAspectRatio: false,
          responsive: true,
          animation: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: context => context.parsed.x === null ? '算出不可' : `${averageMode ? decFmt.format(context.parsed.x) : intFmt.format(context.parsed.x)} ${averageMode ? '分/件' : '件'}` } } },
          scales: { x: { beginAtZero: true, grid: { color: '#e3e7ed' }, ticks: { color: '#4b5565', precision: averageMode ? 2 : 0, callback: value => averageMode ? decFmt.format(value) : intFmt.format(value) } }, y: { grid: { display: false }, ticks: { color: '#1a1c20', autoSkip: false } } }
        }
      });
    } else { // Chart.jsのCDNが使えない環境でも棒グラフを表示する
      $('staffChart').hidden = true;
      const fallback = $('fallbackChart'); fallback.hidden = false; fallback.replaceChildren();
      const max = Math.max(...people.map(p => averageMode ? p.average ?? 0 : p.count), 1);
      for (const person of people) {
        const row = document.createElement('div'); row.className = 'bar-row';
        const name = document.createElement('div'); name.className = 'bar-name'; name.textContent = person.staff; name.title = person.staff;
        const track = document.createElement('div'); track.className = 'bar-track';
        const bar = document.createElement('div'); bar.className = 'bar-fill'; bar.style.width = `${(averageMode ? person.average ?? 0 : person.count) / max * 100}%`; track.appendChild(bar);
        const number = document.createElement('div'); number.className = 'bar-value'; number.textContent = averageMode ? (person.average === null ? '算出不可' : decFmt.format(person.average)) : intFmt.format(person.count);
        row.append(name, track, number); fallback.appendChild(row);
      }
    }
  }

  async function loadFile(file) {
    clearStatus();
    if (!file) return;
    const loadVersion = ++state.loadVersion;
    if (!/\.csv$/i.test(file.name)) { showLoadError('CSV形式（.csv）のファイルを選択してください。'); return; }
    if (file.size > 5 * 1024 * 1024) { showLoadError('ファイルが5MBを超えています。'); return; }
    try {
      const buffer = await file.arrayBuffer();
      const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
      if (loadVersion !== state.loadVersion) return;
      acceptCsv(text, file.name);
    } catch (err) { if (loadVersion === state.loadVersion) showLoadError(`読み込み失敗: ${err.message}`); }
  }

  async function loadSample() {
    const loadVersion = ++state.loadVersion;
    clearStatus();
    try {
      const res = await fetch('./data/sample.csv', { cache: 'no-cache' });
      if (!res.ok) throw new Error(`サンプルCSVを取得できません（HTTP ${res.status}）`);
      const text = await res.text();
      if (loadVersion !== state.loadVersion) return;
      acceptCsv(text, 'sample.csv', true);
    } catch (err) { if (loadVersion === state.loadVersion) showLoadError(`サンプル読み込み失敗: ${err.message}。CSVファイルは選択できます。`); }
  }

  function downloadBlob(text, fileName) {
    const blob = new Blob(['\ufeff', text], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = fileName;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function exportSummary() {
    if (!state.rows.length) return;
    const rows = getFilteredRows();
    if (!rows || !rows.length) return;
    const periodRows = filterRecords(state.rows, { startDate: $('startDate').value, endDate: $('endDate').value });
    const periodTotalCount = summarize(periodRows).totalCount;
    const { people } = summarize(rows, periodTotalCount);
    const columns = ['担当者', '処理件数', '作業時間（分）', '平均処理時間（分/件）', '期間内全体に対する件数シェア（%）'];
    const csvRows = people.map(p => ({ '担当者': p.staff, '処理件数': p.count, '作業時間（分）': p.minutes, '平均処理時間（分/件）': p.average === null ? '' : Number(p.average.toFixed(4)), '期間内全体に対する件数シェア（%）': p.share === null ? '' : Number(p.share.toFixed(4)) }));
    const csv = window.Papa ? window.Papa.unparse({ fields: columns, data: csvRows.map(r => columns.map(c => r[c])) }, { escapeFormulae: true }) : safeCsv(csvRows, columns);
    const today = new Date(), stamp = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    downloadBlob(csv, `process-insight-summary-${stamp}.csv`);
  }

  $('chooseFile').addEventListener('click', ev => { ev.stopPropagation(); $('fileInput').click(); });
  $('changeFile').addEventListener('click', () => $('fileInput').click());
  $('fileInput').addEventListener('change', ev => { loadFile(ev.target.files[0]); ev.target.value = ''; });
  dropzone.addEventListener('click', ev => { if (!ev.target.closest('button, input')) $('fileInput').click(); });
  ['dragenter', 'dragover'].forEach(type => dropzone.addEventListener(type, ev => { ev.preventDefault(); dropzone.classList.add('dragging'); }));
  ['dragleave', 'drop'].forEach(type => dropzone.addEventListener(type, ev => { ev.preventDefault(); dropzone.classList.remove('dragging'); }));
  dropzone.addEventListener('drop', ev => loadFile(ev.dataTransfer.files[0]));
  $('downloadSample').addEventListener('click', async () => {
    try { const res = await fetch('./data/sample.csv'); if (!res.ok) throw new Error(`HTTP ${res.status}`); downloadBlob(await res.text(), 'sample.csv'); }
    catch (err) { safeStatus('errorBox', `サンプルのダウンロードに失敗: ${err.message}`); }
  });
  $('staffFilter').addEventListener('change', ev => { state.activeStaff = ev.target.value; render(); });
  $('startDate').addEventListener('change', render);
  $('endDate').addEventListener('change', render);
  $('resetFilter').addEventListener('click', () => { state.activeStaff = ''; $('staffFilter').value = ''; render(); });
  $('dailyCount').addEventListener('click', () => { if (state.dailyMetric !== 'count') { state.dailyMetric = 'count'; renderDailyChart(summarizeDaily(getFilteredRows() || [])); } });
  $('dailyAverage').addEventListener('click', () => { if (state.dailyMetric !== 'average') { state.dailyMetric = 'average'; renderDailyChart(summarizeDaily(getFilteredRows() || [])); } });
  $('staffCount').addEventListener('click', () => { if (state.staffMetric !== 'count') { state.staffMetric = 'count'; renderChart(rankStaff(summarize(getFilteredRows() || []).people, 'count').slice(0, 30)); } });
  $('staffAverage').addEventListener('click', () => { if (state.staffMetric !== 'average') { state.staffMetric = 'average'; renderChart(rankStaff(summarize(getFilteredRows() || []).people, 'average').slice(0, 30)); } });
  $('exportCsv').addEventListener('click', exportSummary);
  render();
  loadSample();
})();
