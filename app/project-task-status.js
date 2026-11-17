/* Read-only, project-specific task summaries. Opening a summary never starts work. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AIMSTEPProjectTasks = api;
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const files = ['eligibility.html','search-strategy.html','title-abstract-screening.html','full-text-screening.html','extraction.html','risk-of-bias.html','analysis.html','certainty-of-evidence.html','build-protocol.html','drafting-manuscript.html'];
  const count = value => Array.isArray(value) ? value.length : 0;
  const num = value => Math.max(0, Number(value) || 0);
  const text = value => typeof value === 'string' && !!value.trim();
  function build(data, zh = false) {
    const result = {}, words = (en, cn) => zh ? cn : en;
    const empty = words('Not started', '尚未开始');
    const put = (file, active, label) => { result[file] = {active:!!active, label:active ? label : empty}; };
    const e = data.eligibility;
    const rows = e && (!Object.hasOwn(e,'generationMethodChoice') || e.generationMethodChoice) ? (e.activeGenerator === 'machine' ? e.machineCriteria : e.criteria) || [] : [];
    const criteria = rows.filter(row => [row.condition,row.uncertain,row.definition].some(text)).length;
    put(files[0], criteria || text(e?.question), criteria + words(' criteria saved', ' 项标准已保存'));
    const s = data.search, search = data.searchResults;
    const found = search ? count(search.records) : num(s?.unique);
    const runs = search ? count(search.runs) : count(s?.runs);
    const searchDraft = data.searchDraft;
    put(files[1], found || runs || Object.values(searchDraft?.queries || {}).some(q => text(q.text)) || count(searchDraft?.concepts), found + words(' records · ', ' 条文献 · ') + runs + words(' search runs', ' 次检索'));
    const a = data.screen;
    const screened = num(a?.screened), pending = num(a?.pending), conflicts = a?.conflictsPending == null ? Math.max(0,num(a?.conflicts)-num(a?.conflictsResolved)) : num(a.conflictsPending);
    put(files[2], num(a?.sourceCount) || data.screenState?.screeningStages?.elements?.length || text(data.screenState?.screeningPrompt?.text), screened + words(' screened · ', ' 篇已筛选 · ') + pending + words(' pending · ', ' 篇待筛选 · ') + conflicts + words(' unresolved conflicts', ' 项待解决冲突'));
    const f = data.full;
    put(files[3], num(f?.sought) || num(f?.assessed) || count(data.fullState?.records) || count(data.fullState?.screeningStages?.elements), num(f?.decided) + words(' decided · ', ' 篇已决定 · ') + num(f?.pending) + words(' to screen', ' 篇待评估'));
    const x = data.extraction, studies = count(x?.records), done = Object.values(x?.studies || {}).filter(study => study.done).length;
    put(files[4], studies || count(x?.form?.outcomes) || x?.audit?.length, done + ' / ' + studies + words(' reports confirmed · ', ' 篇报告已确认 · ') + count(x?.form?.outcomes) + words(' outcomes', ' 项结局'));
    const r = data.rob, assessed = Object.values(r?.assess || {}).filter(item => item.confirmed).length;
    put(files[5], count(r?.records) || count(r?.outcomes) || r?.audit?.length, count(r?.records) + words(' reports · ', ' 篇报告 · ') + assessed + words(' assessments confirmed', ' 项评估已确认'));
    const analysis = data.analysis;
    put(files[6], count(analysis?.rows) || text(analysis?.requirements) || count(analysis?.runs), count(analysis?.rows) + words(' data rows · ', ' 行数据 · ') + count(analysis?.runs) + words(' saved runs', ' 次已保存分析'));
    const c = data.coe, real = data.coeState?.real;
    put(files[7], num(c?.comparisons) || count(real?.records), num(c?.complete) + ' / ' + num(c?.comparisons || count(real?.records)) + words(' assessments complete', ' 项评估已完成'));
    const p = data.protocol;
    put(files[8], text(p?.text) || count(p?.imports) || Object.values(p?.manualProtocolInputs || {}).some(text), count(p?.imports) + words(' imported files · ', ' 个导入文件 · ') + words(text(p?.text) ? 'Draft saved' : 'In progress', text(p?.text) ? '草稿已保存' : '进行中'));
    const m = data.manuscript;
    put(files[9], text(m?.text) || text(m?.instructions) || count(m?.history), words(m?.confirmedAt ? 'Confirmed draft' : text(m?.text) ? 'Draft saved' : 'Instructions saved', m?.confirmedAt ? '已确认草稿' : text(m?.text) ? '草稿已保存' : '要求已保存'));
    return result;
  }
  async function readDatabase(indexedDB, name, id, known) {
    if (known && !known.has(name)) return null;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(name);
      let missing = false;
      request.onupgradeneeded = () => { missing = true; request.transaction.abort(); };
      request.onerror = () => missing ? resolve(null) : reject(request.error);
      request.onblocked = () => reject(Error('Project storage is blocked.'));
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('projects')) { db.close(); resolve(null); return; }
        try {
          const tx = db.transaction('projects','readonly'), read = tx.objectStore('projects').get(id);
          tx.onabort = tx.onerror = () => { db.close(); reject(tx.error || Error('Could not read project task.')); };
          read.onsuccess = () => { db.close(); resolve(read.result || null); };
          read.onerror = () => { db.close(); reject(read.error); };
        } catch (error) { db.close(); reject(error); }
      };
    });
  }
  async function collect(id, storage, indexedDB) {
    if (!id || id === 'default') throw Error('A registered project is required.');
    const data = {}, errors = [];
    for (const [key,prefix] of Object.entries({eligibility:'eligibility',search:'search-summary',searchDraft:'search-strategy',screen:'screen-summary',full:'fulltext-summary',coe:'coe-summary',coeState:'coe',protocol:'protocol'})) {
      try { data[key] = JSON.parse(storage.getItem('aimstep-'+prefix+':'+id) || 'null'); }
      catch (_) { errors.push(key); }
    }
    const databases = {searchResults:'search-results',screenState:'title-abstract',fullState:'fulltext',extraction:'extraction',rob:'rob',analysis:'analysis',manuscript:'manuscript'};
    let known;
    if (indexedDB.databases) { try { known = new Set((await indexedDB.databases()).map(db => db.name)); } catch (_) {} }
    const pairs = Object.entries(databases);
    const reads = await Promise.allSettled(pairs.map(([,name]) => readDatabase(indexedDB,'aimstep-'+name,id,known)));
    reads.forEach((result,index) => {
      const key = pairs[index][0];
      if (result.status === 'rejected') errors.push(key);
      else data[key] = key === 'searchResults' ? result.value : result.value?.state;
    });
    return {data,errors};
  }
  return {files,build,collect};
});
