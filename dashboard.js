/* ===========================================================================
   PROFIT BOARD, dashboard shell, tabs and the data layer
   Depends on core.js and app.js.
   =========================================================================== */

const EMPTY_MKT = { label: '', spend: '', leads: '', demos: '', closes: '' };

function MarketingForm({ initial, onSave, onClose }) {
  const [f, setF] = useState(initial || EMPTY_MKT);
  const [busy, setBusy] = useState(false);
  const set = k => v => setF(p => ({ ...p, [k]: v }));
  return (
    <>
      <div className="grid gap-4">
        <Field label="What was this spend?" value={f.label} onChange={set('label')} placeholder="Facebook ads, March" autoFocus />
        <Field label="Total marketing spend" type="number" prefix="$" value={f.spend} onChange={set('spend')} placeholder="0" />
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Leads received" type="number" value={f.leads} onChange={set('leads')} placeholder="0" hint="People who called" />
          <Field label="Demos completed" type="number" value={f.demos} onChange={set('demos')} placeholder="0" hint="Roofs you looked at" />
          <Field label="Closed deals" type="number" value={f.closes} onChange={set('closes')} placeholder="0" hint="Jobs you won" />
        </div>
      </div>
      <div className="mt-6 rounded-2xl border-2 border-line overflow-hidden">
        <div className="grid grid-cols-2 divide-x divide-line bg-white">
          <Mini label="Cost per lead" value={showMoney(ratio(num(f.spend), num(f.leads)))} />
          <Mini label="Cost per customer" value={showMoney(ratio(num(f.spend), num(f.closes)))} color="#9333EA" />
        </div>
      </div>
      <div className="flex gap-3 justify-end mt-7">
        <Btn tone="ghost" onClick={onClose}>Cancel</Btn>
        <Btn tone="orange" size="lg" disabled={!f.label.trim() || busy}
             onClick={async () => { setBusy(true); try { await onSave(f); } finally { setBusy(false); } }}>
          {busy ? 'Saving…' : 'Save spend'}
        </Btn>
      </div>
    </>
  );
}

/* ═════════════════════════ tabs ═════════════════════════ */

function TabBar({ tab, setTab, tabs }) {
  return (
    <div className="sticky top-[68px] sm:top-[84px] z-30 bg-shell/95 backdrop-blur -mx-4 sm:-mx-7 px-4 sm:px-7 py-3 no-print">
      <div className="flex gap-2 overflow-x-auto relative" style={{ scrollbarWidth: 'none' }}>
        {tabs.map(t => (
          <button key={t.v} onClick={() => setTab(t.v)}
            className={'px-4 py-3 rounded-2xl font-black text-sm whitespace-nowrap transition shrink-0 border-2 ' +
              (tab === t.v ? 'bg-navy text-white border-navy' : 'bg-white text-navy border-line hover:bg-shell')}>
            <span className="mr-1.5" aria-hidden="true">{t.icon}</span>{t.t}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ═════════════════════════ dashboard ═════════════════════════ */

function Dashboard({ session, profile, signOut }) {
  const isAdmin = !CLOUD || profile?.role === 'admin';
  const meId = session?.user?.id;

  const [tab, setTab] = useState('dash');
  const [jobs, setJobs] = useState([]);
  const [mkt, setMkt] = useState([]);
  const [docs, setDocs] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [revenue, setRevenue] = useState([]);
  const [categories, setCategories] = useState([]);
  const [assets, setAssets] = useState([]);
  const [bills, setBills] = useState([]);
  const [people, setPeople] = useState([]);
  const [queue, setQueue] = useState(() => load(LS_QUEUE, []));
  const [recentCats, setRecentCats] = useState(() => load('sfr_pb_recent_cats', []));
  const [noteDismissed, setNoteDismissed] = useState(() => load('sfr_pb_taxnote', false));
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [modal, setModal] = useState(null);
  const [roleBusy, setRoleBusy] = useState(null);
  const [growth, setGrowth] = useState('current');
  const [metric, setMetric] = useState('revenue');
  const [range, setRange] = useState(90);
  const [pieJob, setPieJob] = useState('');
  const [grain, setGrain] = useState('day');
  const [running, setRunning] = useState(true);

  /* ── load ── */
  const refresh = useCallback(async () => {
    setErr('');
    if (!CLOUD) {
      setJobs(load(LS_JOBS, [])); setMkt(load(LS_MKT, []));
      setExpenses(load(LS_EXP, [])); setRevenue(load(LS_REV, []));
      setCategories(load('sfr_pb_cats', DEFAULT_CATEGORIES));
      setBills(load(LS_BILLS, []));
      setLoading(false); return;
    }
    try {
      const [jq, cq, dq] = await Promise.all([
        sb.from('jobs').select('*').order('created_at', { ascending: false }),
        sb.from('expense_categories').select('*').order('sort_order'),
        sb.from('documents').select('*').order('created_at', { ascending: false })
      ]);
      if (jq.error) throw jq.error;
      setCategories(cq.error ? DEFAULT_CATEGORIES : (cq.data || []));
      setDocs(dq.error ? [] : (dq.data || []));

      let merged = jq.data || [];
      if (isAdmin) {
        const [mq, kq, pq, eq, rq, aq, bq] = await Promise.all([
          sb.from('job_money').select('*'),
          sb.from('marketing').select('*').order('created_at', { ascending: false }),
          sb.from('profiles').select('*').order('created_at'),
          sb.from('expenses').select('*').order('date', { ascending: false }),
          sb.from('revenue_entries').select('*').order('date', { ascending: false }),
          sb.from('fixed_assets').select('*'),
          sb.from('recurring_expenses').select('*').order('created_at')
        ]);
        if (!mq.error) {
          const byId = {}; (mq.data || []).forEach(r => { byId[r.job_id] = r; });
          merged = merged.map(j => ({ ...j, ...(byId[j.id] || {}) }));
        }
        setMkt(kq.error ? [] : (kq.data || []));
        setPeople(pq.error ? [] : (pq.data || []));
        setExpenses(eq.error ? [] : (eq.data || []));
        setRevenue(rq.error ? [] : (rq.data || []));
        setAssets(aq.error ? [] : (aq.data || []));
        setBills(bq.error ? [] : (bq.data || []));
      } else {
        // Crew sees only the expenses they logged themselves.
        const eq = await sb.from('expenses').select('*').order('date', { ascending: false });
        setExpenses(eq.error ? [] : (eq.data || []));
        setMkt([]); setPeople([]); setRevenue([]); setAssets([]);
      }
      setJobs(merged);
    } catch (e) { setErr(e.message || 'Could not load your data.'); }
    setLoading(false);
  }, [isAdmin]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => { if (!CLOUD) persist(LS_JOBS, jobs); }, [jobs]);
  useEffect(() => { if (!CLOUD) persist(LS_MKT, mkt); }, [mkt]);
  useEffect(() => { if (!CLOUD) persist(LS_EXP, expenses); }, [expenses]);
  useEffect(() => { persist(LS_QUEUE, queue); }, [queue]);
  useEffect(() => { if (!CLOUD) persist(LS_BILLS, bills); }, [bills]);
  useEffect(() => { persist('sfr_pb_recent_cats', recentCats); }, [recentCats]);
  useEffect(() => { persist('sfr_pb_taxnote', noteDismissed); }, [noteDismissed]);

  /* ── revenue: contracted from jobs, collected from the ledger ── */
  // Until money-in entries exist, contracted job totals stand in for revenue so
  // the four numbers aren't blank on day one.
  const revenueRows = useMemo(() => {
    if (revenue.length) return revenue;
    return jobs.filter(j => num(j.contract_total ?? j.revenue) > 0).map(j => ({
      id: 'job-' + j.id, date: (j.installed_on || j.created_at || todayISO()).slice(0, 10),
      amount: num(j.contract_total ?? j.revenue), source: 'job_contract', job_id: j.id
    }));
  }, [revenue, jobs]);

  // Job costs used to live on job_money as material/labor/dumpster. Until they
  // are re-entered as expenses they still have to count, or gross profit comes
  // out equal to revenue, which is what it was doing. Skipped for any job that
  // already has real job-cost expenses logged, so nothing is counted twice.
  const legacyJobCosts = useMemo(() => {
    const rows = [];
    jobs.forEach(j => {
      const alreadyLogged = expenses.some(e =>
        e.job_id === j.id && bucketOf(e, categories).bucket === 'job_cost');
      if (alreadyLogged) return;
      const when = String(j.installed_on || j.created_at || todayISO()).slice(0, 10);
      [['material', 'Shingles & materials'], ['labor', 'Labor / subs'], ['dumpster', 'Dumpster & disposal']]
        .forEach(([key, name]) => {
          const amt = num(j[key]);
          if (amt > 0) rows.push({
            id: `legacy-${j.id}-${key}`, amount: amt, job_id: j.id, date: when,
            _bucket: 'job_cost', _name: name, _legacy: true
          });
        });
    });
    return rows;
  }, [jobs, expenses, categories]);

  const billExpenses = useMemo(() => billsAsExpenses(bills), [bills]);
  const allExpenses = useMemo(() => [...expenses, ...legacyJobCosts, ...billExpenses],
    [expenses, legacyJobCosts, billExpenses]);

  const depFor = useCallback(k => depreciationForMonth(assets, k), [assets]);
  const pl = useMemo(() => computePL(revenueRows, allExpenses, categories,
    depreciationForMonth(assets, monthKey(todayISO()))), [revenueRows, allExpenses, categories, assets]);
  const series = useMemo(() => monthlySeries(revenueRows, allExpenses, categories, depFor), [revenueRows, allExpenses, categories, depFor]);

  // What the stock chart plots: day-by-day or month-by-month, and either the
  // running total (climbs like a share price) or the value for that period.
  const chartPer = useMemo(() => periodSeries(revenueRows, allExpenses, categories, depFor, grain),
    [revenueRows, allExpenses, categories, depFor, grain]);
  const chartSeries = useMemo(() => (running ? cumulative(chartPer) : chartPer), [chartPer, running]);
  const ttm = useMemo(() => ttmFrom(series), [series]);

  const totals = useMemo(() => jobs.reduce((a, j) => {
    a.squares += num(j.squares); if (j.done) a.installed += 1;
    a.contracted += num(j.contract_total ?? j.revenue);
    a.collected += num(j.amount_collected);
    return a;
  }, { squares: 0, installed: 0, contracted: 0, collected: 0 }), [jobs]);

  const m = useMemo(() => {
    const s = mkt.reduce((a, r) => ({
      spend: a.spend + num(r.spend), leads: a.leads + num(r.leads),
      demos: a.demos + num(r.demos), closes: a.closes + num(r.closes)
    }), { spend: 0, leads: 0, demos: 0, closes: 0 });
    return { ...s,
      demoRate: s.leads > 0 ? (s.demos / s.leads) * 100 : null,
      closeRate: s.demos > 0 ? (s.closes / s.demos) * 100 : null,
      cpl: ratio(s.spend, s.leads), cac: ratio(s.spend, s.closes),
      valuePerLead: ratio(pl.revenue, s.leads) };
  }, [mkt, pl.revenue]);

  const expensesForJob = useCallback(id =>
    allExpenses.filter(e => e.job_id === id && bucketOf(e, categories).bucket === 'job_cost')
               .reduce((a, e) => a + num(e.amount), 0), [allExpenses, categories]);

  /* ── expense writes ── */
  const saveExpense = async payload => {
    const { file, ...row } = payload;
    setRecentCats(p => [row.category_id, ...p.filter(x => x !== row.category_id)].slice(0, 6));

    if (!CLOUD) {
      setExpenses(p => [{ ...row, id: uid(), created_at: Date.now() }, ...p]); return;
    }
    if (!navigator.onLine) {           // offline capture, synced on reconnect
      setQueue(p => [...p, { ...row, id: uid(), _queued: true }]);
      setExpenses(p => [{ ...row, id: uid(), _pending: true }, ...p]);
      return;
    }
    let receipt_url = null;
    if (file) {
      const path = `expenses/${Date.now()}-${safeName(file.name)}`;
      const up = await sb.storage.from('job-docs').upload(path, file);
      if (up.error) throw up.error;
      receipt_url = path;
    }
    const r = await sb.from('expenses').insert({ ...row, receipt_url, created_by: meId });
    if (r.error) throw r.error;
    await refresh();
  };

  // Drain anything captured with no signal.
  useEffect(() => {
    if (!CLOUD || !queue.length) return;
    const flush = async () => {
      if (!navigator.onLine) return;
      const pending = [...queue];
      for (const row of pending) {
        const { _queued, id, ...clean } = row;
        const r = await sb.from('expenses').insert({ ...clean, created_by: meId });
        if (!r.error) setQueue(p => p.filter(x => x.id !== id));
      }
      refresh();
    };
    flush();
    window.addEventListener('online', flush);
    return () => window.removeEventListener('online', flush);
  }, [queue, meId, refresh]);

  const deleteExpense = async e => {
    if (!window.confirm('Delete this expense? This cannot be undone.')) return;
    if (!CLOUD) { setExpenses(p => p.filter(x => x.id !== e.id)); return; }
    const r = await sb.from('expenses').delete().eq('id', e.id);
    if (r.error) setErr(r.error.message); else refresh();
  };

  /* ── job writes ── */
  const saveJob = async row => {
    if (!CLOUD) {
      const w = { ...row, id: row.id || uid() };
      setJobs(p => p.some(x => x.id === w.id) ? p.map(x => x.id === w.id ? w : x) : [w, ...p]);
      setModal(null); return;
    }
    try {
      const base = { name: row.name.trim(), squares: num(row.squares), done: !!row.done,
                     lead_source: row.lead_source || null };
      if (isAdmin) {
        base.contract_total = num(row.contract_total);
        base.payment_type = row.payment_type || null;
      }
      let id = row.id;
      if (id) { const r = await sb.from('jobs').update(base).eq('id', id); if (r.error) throw r.error; }
      else { const r = await sb.from('jobs').insert({ ...base, created_by: meId }).select().single();
             if (r.error) throw r.error; id = r.data.id; }
      if (isAdmin) await sb.from('job_money').upsert({ job_id: id, revenue: num(row.contract_total) });
      setModal(null); await refresh();
    } catch (e) { setErr(e.message || 'Could not save that job.'); }
  };

  const toggleJob = async j => {
    setJobs(p => p.map(x => x.id === j.id ? { ...x, done: !x.done } : x));
    if (!CLOUD) return;
    const r = await sb.from('jobs').update({ done: !j.done }).eq('id', j.id);
    if (r.error) { setErr(r.error.message); refresh(); }
  };

  const delJob = async j => {
    if (!window.confirm(`Delete "${j.name}"? This also deletes its papers.`)) return;
    if (!CLOUD) { setJobs(p => p.filter(x => x.id !== j.id)); return; }
    const r = await sb.from('jobs').delete().eq('id', j.id);
    if (r.error) setErr(r.error.message); else refresh();
  };

  const saveMkt = async row => {
    if (!CLOUD) {
      const w = { ...row, id: row.id || uid() };
      setMkt(p => p.some(x => x.id === w.id) ? p.map(x => x.id === w.id ? w : x) : [w, ...p]);
      setModal(null); return;
    }
    const base = { label: row.label.trim(), spend: num(row.spend), leads: num(row.leads),
                   demos: num(row.demos), closes: num(row.closes) };
    const r = row.id ? await sb.from('marketing').update(base).eq('id', row.id)
                     : await sb.from('marketing').insert({ ...base, created_by: meId });
    if (r.error) setErr(r.error.message); else { setModal(null); refresh(); }
  };

  const delMkt = async r0 => {
    if (!window.confirm(`Delete "${r0.label}"?`)) return;
    if (!CLOUD) { setMkt(p => p.filter(x => x.id !== r0.id)); return; }
    const r = await sb.from('marketing').delete().eq('id', r0.id);
    if (r.error) setErr(r.error.message); else refresh();
  };

  /* ── fixed costs ── */
  const saveBill = async row => {
    const base = { name: row.name.trim(), amount: num(row.amount), frequency: row.frequency,
                   category_id: row.category_id, is_active: row.is_active !== false };
    if (!CLOUD) {
      const w = { ...base, starts_on: row.starts_on, id: row.id || uid(), created_at: row.created_at || todayISO() };
      setBills(p => p.some(x => x.id === w.id) ? p.map(x => x.id === w.id ? w : x) : [...p, w]);
      setModal(null); return;
    }
    // starts_on needs the v4 patch; fall back without it so nothing breaks.
    let r = row.id
      ? await sb.from('recurring_expenses').update({ ...base, starts_on: row.starts_on }).eq('id', row.id)
      : await sb.from('recurring_expenses').insert({ ...base, starts_on: row.starts_on });
    if (r.error && /starts_on/.test(r.error.message)) {
      r = row.id
        ? await sb.from('recurring_expenses').update(base).eq('id', row.id)
        : await sb.from('recurring_expenses').insert(base);
    }
    if (r.error) setErr(r.error.message); else { setModal(null); refresh(); }
  };

  const toggleBill = async b => {
    if (!CLOUD) { setBills(p => p.map(x => x.id === b.id ? { ...x, is_active: x.is_active === false } : x)); return; }
    const r = await sb.from('recurring_expenses').update({ is_active: b.is_active === false }).eq('id', b.id);
    if (r.error) setErr(r.error.message); else refresh();
  };

  const delBill = async b => {
    if (!window.confirm(`Delete "${b.name}"? Past months keep their history until you delete this; from now on it stops counting.`)) return;
    if (!CLOUD) { setBills(p => p.filter(x => x.id !== b.id)); return; }
    const r = await sb.from('recurring_expenses').delete().eq('id', b.id);
    if (r.error) setErr(r.error.message); else refresh();
  };

  /* ── documents ── */
  const uploadDoc = async ({ job, file, kind, label, amount }) => {
    const path = `${job.id}/${Date.now()}-${safeName(file.name)}`;
    const up = await sb.storage.from('job-docs').upload(path, file);
    if (up.error) throw up.error;
    const ins = await sb.from('documents').insert({ job_id: job.id, kind, label, amount,
      storage_path: path, file_name: file.name, uploaded_by: meId });
    if (ins.error) throw ins.error;
    await refresh();
  };
  const openDoc = async d => {
    const r = await sb.storage.from('job-docs').createSignedUrl(d.storage_path, 3600);
    if (r.error) setErr(r.error.message); else window.open(r.data.signedUrl, '_blank', 'noopener');
  };
  const deleteDoc = async d => {
    if (!window.confirm('Delete this paper?')) return;
    await sb.storage.from('job-docs').remove([d.storage_path]);
    const r = await sb.from('documents').delete().eq('id', d.id);
    if (r.error) setErr(r.error.message); else refresh();
  };
  const setRole = async (p, role) => {
    setRoleBusy(p.id);
    const r = await sb.from('profiles').update({ role }).eq('id', p.id);
    setRoleBusy(null);
    if (r.error) setErr(r.error.message); else refresh();
  };

  const papersJob = modal?.kind === 'docs' ? jobs.find(j => j.id === modal.row.id) : null;

  const TABS = [
    { v: 'dash', t: 'Dashboard', icon: '📊' },
    { v: 'out',  t: 'Money Out', icon: '🧾' },
    { v: 'jobs', t: 'Jobs',      icon: '🏠' },
    ...(isAdmin ? [{ v: 'charts', t: 'Charts', icon: '📈' }] : []),
    ...(isAdmin ? [{ v: 'bills', t: 'Fixed Costs', icon: '🔁' }] : []),
    ...(isAdmin ? [{ v: 'mkt', t: 'Marketing', icon: '📣' }] : []),
    ...(CLOUD && isAdmin ? [{ v: 'team', t: 'Who gets in', icon: '👥' }] : [])
  ];

  if (loading) return <div className="min-h-screen grid place-items-center"><p className="text-xl font-black text-navy">Loading your numbers…</p></div>;

  return (
    <div className="min-h-screen pb-28">
      <header className="sticky top-0 z-40 bg-navy text-white shadow-lg no-print">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-7 py-3 sm:py-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <img src="sfr-logo-reversed.png" alt={COMPANY} className="h-9 sm:h-14 w-auto object-contain shrink-0" />
            <div className="border-l border-white/25 pl-3 hidden sm:block">
              <div className="text-lg font-black uppercase tracking-[.1em] leading-none">Profit Board</div>
              <div className="text-[11px] font-bold uppercase tracking-[.13em] opacity-75 mt-1">
                {CLOUD ? (isAdmin ? 'Admin, sees everything' : 'Crew, jobs and papers') : 'This device only'}
              </div>
            </div>
          </div>
          {CLOUD && <Btn tone="ghost" size="sm" onClick={signOut} className="!bg-white/15 !text-white hover:!bg-white/25">Sign out</Btn>}
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 sm:px-7 pb-7">
        <TabBar tab={tab} setTab={setTab} tabs={TABS} />

        <div className="space-y-6 pt-2">
          {err && <Banner tone="error">{err}</Banner>}
          {queue.length > 0 && <Banner tone="warn">{queue.length} expense{queue.length > 1 ? 's' : ''} saved on this phone, waiting for signal.</Banner>}
          {!CLOUD && <Banner tone="warn">Saving to this device only. Open <b>config.js</b> to turn on sign-in.</Banner>}

          {/* ── DASHBOARD ── */}
          {tab === 'dash' && (isAdmin ? (
            <>
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
                <BigCard bg="#102D7F" ink="#FFFFFF" icon="💵" label="Revenue"
                         value={money(pl.revenue)} sub="Everything contracted" />
                <BigCard bg="#0E7A4A" ink="#FFFFFF" icon="🔨" label="Gross Profit"
                         value={money(pl.grossProfit)}
                         sub={pl.grossMargin === null ? 'Add revenue to see margin' : `${pct(pl.grossMargin)} margin`}
                         foot="Revenue minus job costs only" />
                <BigCard bg="#9333EA" ink="#FFFFFF" icon="📈" label="EBITDA"
                         value={money(pl.ebitda)}
                         sub={pl.ebitdaMargin === null ? 'Add revenue to see margin' : `${pct(pl.ebitdaMargin)} margin`}
                         foot="After overhead. Owner draws excluded." />
                <BigCard bg="#F6821F" ink="#0A1F5C" icon="🏦" label="Net Profit"
                         value={money(pl.netProfit)}
                         sub={pl.netMargin === null ? 'Add revenue to see margin' : `${pct(pl.netMargin)} margin`}
                         foot="After tax, interest, depreciation and draws" />
              </div>

              {pl.operating === 0 && pl.draws === 0 && pl.revenue > 0 && (
                <Banner tone="warn">
                  <b>Gross profit, EBITDA and Net profit are all the same right now</b> because no
                  overhead has been logged yet. Rent, insurance, fuel, wages, ads and owner draws
                  all come out below gross profit. Add them with the orange + button and these
                  three numbers will separate, which is the whole point of the board.
                </Banner>
              )}

              <Banner tone="info">
                <b>EBITDA excludes owner draws</b>, that's what makes it comparable to other companies.
                But when the owners also sell the jobs, it overstates what a buyer would actually earn,
                because replacing that work costs real money. Judge the business on Net Profit; use EBITDA for comparison.
              </Banner>

              <section>
                <h2 className="text-2xl font-black text-navy mb-4">Trailing twelve months</h2>
                <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
                  <Tile label="TTM revenue" value={money(ttm.revenue)} sub="Last 12 months" />
                  <Tile label="TTM gross profit" value={money(ttm.grossProfit)} sub="Before overhead" color="#0E7A4A" />
                  <Tile label="TTM EBITDA" value={money(ttm.ebitda)} sub="What a buyer asks for" color="#9333EA" />
                  <Tile label="TTM net profit" value={money(ttm.netProfit)} sub="What actually stayed" color="#B4620A" />
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-black text-navy mb-4">Cash and work</h2>
                <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
                  <Tile label="Contracted" value={money(totals.contracted)} sub="Signed up" />
                  <Tile label="Collected" value={money(totals.collected)} sub="Actually in the bank" color="#0E7A4A" />
                  <Tile label="Jobs installed" value={`${totals.installed} / ${jobs.length}`} sub="Green checks in Jobs" />
                  <Tile label="Squares sold" value={totals.squares.toLocaleString('en-US')} sub="1 square = 100 sq ft" />
                </div>
              </section>

              <div className="grid gap-5 lg:grid-cols-2">
                <SpendPie pl={pl} />
                <MoneySplit pl={pl} />
              </div>
            </>
          ) : (
            <section>
              <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
                <Tile label="Jobs installed" value={`${totals.installed} / ${jobs.length}`} sub="Green checks in Jobs" />
                <Tile label="Squares sold" value={totals.squares.toLocaleString('en-US')} sub="1 square = 100 sq ft" />
                <Tile label="Receipts you logged" value={expenses.length.toLocaleString('en-US')} sub="Thanks, keep them coming" />
              </div>
              <div className="mt-5"><Banner tone="info">
                You're crew. Log jobs, tick them off when the install is done, and photograph every
                receipt with the orange <b>+</b> button. The money side is your admin's view.
              </Banner></div>
            </section>
          ))}

          {/* ── CHARTS ── */}
          {tab === 'charts' && isAdmin && (
            <div className="grid gap-5">
              <StockChart series={chartSeries} perSeries={chartPer} metric={metric} setMetric={setMetric}
                          range={range} setRange={setRange} growth={growth} setGrowth={setGrowth}
                          grain={grain} setGrain={setGrain} running={running} setRunning={setRunning} />
              <div className="grid gap-5 lg:grid-cols-2">
                <SpendPie pl={pl} />
                <MonthlyBars series={series} />
              </div>

              <section className="bg-white rounded-3xl card-shadow p-5 sm:p-7">
                <h3 className="text-xl font-black text-navy mb-3">Pick a job to break down</h3>
                <Select label="Job" value={pieJob} onChange={setPieJob}
                        options={[{ v: '', t: 'Choose a job' }, ...jobs.map(j => ({ v: j.id, t: j.name }))]} />
              </section>
              {pieJob && jobs.find(j => j.id === pieJob) && (
                <JobDollarPie job={jobs.find(j => j.id === pieJob)} expenses={allExpenses}
                              categories={categories} pl={pl} jobs={jobs} />
              )}
            </div>
          )}

          {/* ── FIXED COSTS ── */}
          {tab === 'bills' && isAdmin && (
            <BillsPanel bills={bills} categories={categories}
                        onAdd={() => setModal({ kind: 'bill' })}
                        onEdit={row => setModal({ kind: 'bill', row })}
                        onToggle={toggleBill} onDelete={delBill} />
          )}

          {/* ── MONEY OUT ── */}
          {tab === 'out' && (
            <MoneyOut expenses={allExpenses} categories={categories} jobs={jobs}
                      onDelete={deleteExpense} isAdmin={isAdmin}
                      noteDismissed={noteDismissed} onDismissNote={() => setNoteDismissed(true)} />
          )}

          {/* ── JOBS ── */}
          {tab === 'jobs' && (
            <>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h2 className="text-2xl font-black text-navy">Every job</h2>
                <Btn tone="green" size="md" onClick={() => setModal({ kind: 'job' })}>＋ Add job</Btn>
              </div>
              {jobs.length === 0 ? (
                <div className="bg-white rounded-3xl card-shadow p-10 text-center">
                  <div className="text-5xl mb-3" aria-hidden="true">🏠</div>
                  <h3 className="text-2xl font-black text-navy">No jobs yet</h3>
                  <p className="text-muted font-bold mt-2">Add your first job to start tracking.</p>
                </div>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {jobs.map(j => (
                    <JobCard key={j.id} j={j} isAdmin={isAdmin}
                             docCount={docs.filter(d => d.job_id === j.id).length}
                             expenseTotal={expensesForJob(j.id)}
                             onToggle={toggleJob} onEdit={row => setModal({ kind: 'job', row })}
                             onDelete={delJob} onPapers={row => setModal({ kind: 'docs', row })} />
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── MARKETING ── */}
          {tab === 'mkt' && isAdmin && (
            <>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h2 className="text-2xl font-black text-navy">Marketing</h2>
                <Btn tone="orange" size="md" onClick={() => setModal({ kind: 'mkt' })}>＋ Add spend</Btn>
              </div>
              <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
                <Tile label="Cost per lead" value={showMoney(m.cpl)} sub="To make the phone ring" />
                <Tile label="Demo rate" value={showPct(m.demoRate)} sub="Calls that became appointments" />
                <Tile label="Close rate" value={showPct(m.closeRate)} sub="Appointments that became jobs" />
                <Tile label="Cost per customer" value={showMoney(m.cac)} sub="Spend per signed job" color="#9333EA" />
              </div>
              {m.cac !== null && (
                <section className="rounded-3xl p-6 lift" style={{ background: 'linear-gradient(135deg,#0A1F5C,#102D7F)' }}>
                  <div className="text-[11px] font-black uppercase tracking-[.14em] text-orange">Target spend guide</div>
                  <p className="text-white font-black mt-2 leading-tight" style={{ fontSize: 'clamp(1.3rem,3.4vw,2rem)' }}>
                    To get 1 new customer, you need to spend <span className="text-orange">{moneyExact(m.cac)}</span> in marketing.
                  </p>
                </section>
              )}
              {mkt.length === 0 ? (
                <div className="bg-white rounded-3xl card-shadow p-10 text-center">
                  <div className="text-5xl mb-3" aria-hidden="true">📣</div>
                  <h3 className="text-2xl font-black text-navy">No marketing logged yet</h3>
                </div>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {mkt.map(r => (
                    <div key={r.id} className="bg-white rounded-3xl card-shadow p-5">
                      <div className="font-black text-ink text-lg break-words">{r.label}</div>
                      <div className="text-xs font-bold text-muted mt-1">
                        {moneyExact(r.spend)} · {num(r.leads)} leads · {num(r.demos)} demos · {num(r.closes)} sales
                      </div>
                      <div className="grid grid-cols-2 gap-3 mt-4">
                        <div className="bg-shell rounded-2xl px-4 py-3">
                          <div className="text-[10px] font-black uppercase tracking-[.08em] text-muted">Per lead</div>
                          <div className="figure text-2xl font-black text-navy mt-0.5">{showMoney(ratio(num(r.spend), num(r.leads)))}</div>
                        </div>
                        <div className="bg-shell rounded-2xl px-4 py-3">
                          <div className="text-[10px] font-black uppercase tracking-[.08em] text-muted">Per customer</div>
                          <div className="figure text-2xl font-black mt-0.5" style={{ color: '#9333EA' }}>{showMoney(ratio(num(r.spend), num(r.closes)))}</div>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-4">
                        <Btn tone="ghost" size="md" onClick={() => setModal({ kind: 'mkt', row: r })} className="flex-1">Edit</Btn>
                        <Btn tone="danger" size="md" onClick={() => delMkt(r)}>Delete</Btn>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── TEAM ── */}
          {tab === 'team' && CLOUD && isAdmin && (
            <>
              <h2 className="text-2xl font-black text-navy">Who can get in</h2>
              <TeamPanel people={people} meId={meId} onSetRole={setRole} busyId={roleBusy} />
              <p className="text-xs font-bold text-muted">Anyone who signs in starts as crew unless their email is on the admin list.</p>
            </>
          )}
        </div>
      </main>

      {/* Fast entry, reachable in one tap from any tab. */}
      <button onClick={() => setModal({ kind: 'fast' })} aria-label="Add an expense"
        className="fixed bottom-5 right-5 z-40 w-16 h-16 rounded-full bg-orange text-navyDeep text-3xl font-black lift no-print
                   flex items-center justify-center active:scale-95 transition">＋</button>

      {modal?.kind === 'fast' && (
        <Modal title="Add an expense" subtitle="Amount, what it was for, snap the receipt." onClose={() => setModal(null)}>
          <FastExpense categories={categories} jobs={jobs} recentIds={recentCats}
                       isAdmin={isAdmin} onSaved={saveExpense} onClose={() => setModal(null)} />
        </Modal>
      )}
      {modal?.kind === 'bill' && (
        <Modal title={modal.row ? 'Edit fixed cost' : 'Add a fixed cost'}
               subtitle="Comes out every month on its own." onClose={() => setModal(null)}>
          <BillForm initial={modal.row} categories={categories} onSave={saveBill} onClose={() => setModal(null)} />
        </Modal>
      )}
      {modal?.kind === 'job' && (
        <Modal title={modal.row ? 'Edit job' : 'Add new job'} onClose={() => setModal(null)}>
          <JobForm initial={modal.row} isAdmin={isAdmin} onSave={saveJob} onClose={() => setModal(null)} />
        </Modal>
      )}
      {modal?.kind === 'mkt' && (
        <Modal title={modal.row ? 'Edit spend' : 'Add marketing spend'} onClose={() => setModal(null)}>
          <MarketingForm initial={modal.row} onSave={saveMkt} onClose={() => setModal(null)} />
        </Modal>
      )}
      {modal?.kind === 'docs' && papersJob && (
        <Modal wide title="Invoices & receipts" subtitle={papersJob.name} onClose={() => setModal(null)}>
          <DocsPanel job={papersJob} docs={docs} onUpload={uploadDoc} onOpenDoc={openDoc}
                     onDeleteDoc={deleteDoc} canDelete={d => isAdmin || d.uploaded_by === meId} />
        </Modal>
      )}
    </div>
  );
}

// Used only when there's no backend, so the app still works on one device.
const DEFAULT_CATEGORIES = [
  { id: 'c1', name: 'Shingles & materials', bucket: 'job_cost', excluded_from_ebitda: false },
  { id: 'c2', name: 'Labor / subs',         bucket: 'job_cost', excluded_from_ebitda: false },
  { id: 'c3', name: 'Dumpster & disposal',  bucket: 'job_cost', excluded_from_ebitda: false },
  { id: 'c4', name: 'Permits',              bucket: 'job_cost', excluded_from_ebitda: false },
  { id: 'c5', name: 'Fuel',                 bucket: 'overhead', excluded_from_ebitda: false },
  { id: 'c6', name: 'Insurance',            bucket: 'overhead', excluded_from_ebitda: false },
  { id: 'c7', name: 'Software / SaaS',      bucket: 'overhead', excluded_from_ebitda: false },
  { id: 'c8', name: 'Google Ads spend',     bucket: 'overhead', excluded_from_ebitda: false },
  { id: 'c9', name: 'Loan interest',        bucket: 'overhead', excluded_from_ebitda: true },
  { id: 'c10', name: 'Owner draw',          bucket: 'owner_draw', excluded_from_ebitda: true },
  { id: 'c11', name: 'Tax set-aside',       bucket: 'tax_reserve', excluded_from_ebitda: true }
];

/* ═════════════════════════ app shell ═════════════════════════ */

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [ready, setReady] = useState(!CLOUD);

  useEffect(() => {
    if (!CLOUD) return;
    let alive = true;
    sb.auth.getSession().then(({ data }) => { if (alive) { setSession(data.session); setReady(true); } });
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => { setSession(s); setReady(true); });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!CLOUD || !session) { setProfile(null); return; }
    let alive = true;
    sb.from('profiles').select('*').eq('id', session.user.id).single()
      .then(({ data }) => { if (alive) setProfile(data || { role: 'crew' }); });
    return () => { alive = false; };
  }, [session]);

  const signOut = async () => { await sb.auth.signOut(); setProfile(null); };

  if (!CLOUD)   return <Dashboard session={null} profile={{ role: 'admin' }} signOut={() => {}} />;
  if (!ready)   return <div className="min-h-screen grid place-items-center"><p className="text-xl font-black text-navy">Starting up…</p></div>;
  if (!session) return <SignIn />;
  if (!profile) return <div className="min-h-screen grid place-items-center"><p className="text-xl font-black text-navy">Signing you in…</p></div>;
  return <Dashboard session={session} profile={profile} signOut={signOut} />;
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
