/* ===========================================================================
   PROFIT BOARD, views and data
   Depends on core.js (loaded first).
   =========================================================================== */

/* ═════════════════════════ sign in ═════════════════════════ */

function SignIn() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [mode, setMode] = useState('in');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  const friendly = m => {
    const t = (m || '').toLowerCase();
    if (t.includes('invalid login')) return "That email and password don't match. Check for typos, or create an account below.";
    if (t.includes('already registered')) return 'You already have an account. Use "Sign in" instead.';
    if (t.includes('password should be')) return 'Your password needs to be at least 6 characters.';
    if (t.includes('rate limit')) return 'Too many tries at once. Wait a minute and try again.';
    if (t.includes('email not confirmed')) return 'This account still needs confirming. Turn off "Confirm email" in Supabase, then try again.';
    return m;
  };

  const go = async () => {
    const addr = email.trim(); if (!addr || !pw) return;
    setBusy(true); setErr(''); setOk('');
    const r = mode === 'in'
      ? await sb.auth.signInWithPassword({ email: addr, password: pw })
      : await sb.auth.signUp({ email: addr, password: pw });
    setBusy(false);
    if (r.error) { setErr(friendly(r.error.message)); return; }
    if (mode === 'new' && !r.data.session) setOk('Account made. Now press Sign in.');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-5" style={{ background: 'linear-gradient(135deg,#0A1F5C,#102D7F)' }}>
      <div className="bg-white rounded-3xl lift w-full max-w-xl p-7 sm:p-12 text-center">
        <img src="sfr-logo.png" alt={COMPANY} className="h-16 sm:h-20 w-auto mx-auto" />
        <h1 className="text-3xl sm:text-4xl font-black text-navy mt-7 leading-tight">Profit Board</h1>
        <p className="text-lg sm:text-xl font-bold text-ink mt-4 leading-snug">
          {mode === 'in' ? 'Sign in to see your jobs.' : 'Pick a password and you’re in.'}
        </p>
        <div className="mt-7 text-left grid gap-4">
          <Field label="Your email address" big type="email" value={email} onChange={setEmail} placeholder="you@example.com" autoFocus />
          <Field label="Your password" big type="password" value={pw} onChange={setPw}
                 placeholder="At least 6 characters" hint={mode === 'new' ? 'Write it down somewhere safe.' : ''} />
        </div>
        {err && <div className="mt-4 text-left"><Banner tone="error">{err}</Banner></div>}
        {ok  && <div className="mt-4 text-left"><Banner tone="info">{ok}</Banner></div>}
        <Btn tone="orange" size="xl" onClick={go} disabled={busy || !email.trim() || !pw} className="w-full mt-6">
          {busy ? 'One moment…' : mode === 'in' ? 'Sign in' : 'Create my account'}
        </Btn>
        <button onClick={() => { setMode(mode === 'in' ? 'new' : 'in'); setErr(''); setOk(''); }}
                className="mt-6 text-base font-black text-navy underline underline-offset-4">
          {mode === 'in' ? 'First time here? Create my account' : 'I already have an account'}
        </button>
      </div>
    </div>
  );
}

const BUCKET_ORDER = [
  { v: 'job_cost',    t: 'Job costs (materials, labour, dumpsters)' },
  { v: 'overhead',    t: 'Overhead (rent, insurance, fuel, staff, ads)' },
  { v: 'owner_draw',  t: 'Owner draws' },
  { v: 'tax_reserve', t: 'Tax set-aside' }
];


/* ═════════════ receipt scanner ═════════════
   Reads the photo ON the phone (Tesseract OCR, loaded only when first used),
   then guesses the total, the vendor and the cost category from what it read.
   The guess fills the form; a person always checks it before saving. */

let _tessPromise = null;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (!_tessPromise) _tessPromise = new Promise((res, rej) => {
    const el = document.createElement('script');
    el.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    el.onload = () => res(window.Tesseract); el.onerror = () => { _tessPromise = null; rej(new Error('Could not load the scanner.')); };
    document.head.appendChild(el);
  });
  return _tessPromise;
}

async function ocrReceipt(file, onProgress) {
  const T = await loadTesseract();
  const worker = await T.createWorker('eng', 1, {
    logger: m => { if (m.status === 'recognizing text' && onProgress) onProgress(m.progress); }
  });
  try {
    const { data } = await worker.recognize(file);
    return data.text || '';
  } finally { await worker.terminate(); }
}

const SCAN_RULES = [
  [['abc supply','beacon','srs distribution','roofing supply','shingle','gaf','owens corning','certainteed','lowe','home depot','lumber','84 lumber'], ['shingle','material']],
  [['underlayment','felt','synthetic'], ['underlayment','material']],
  [['shell','exxon','chevron','bp ','wawa','sunoco','circle k','racetrac','fuel','gasoline','diesel'], ['fuel']],
  [['waste management','dumpster','disposal','landfill','hauling'], ['dumpster','disposal']],
  [['permit','city of','county of'], ['permit']],
  [['verizon','t-mobile','at&t','cell'], ['phone']],
  [['geico','progressive','allstate','state farm','liberty mutual','insurance'], ['insurance','liability']],
  [['sunbelt','united rentals','herc','rental'], ['rental']],
  [['storage','public storage'], ['storage','office']]
];

function parseReceipt(text, categories) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const moneyRe = /\$?\s*([0-9]{1,3}(?:,[0-9]{3})*\.[0-9]{2}|[0-9]+\.[0-9]{2})/g;
  let biggest = 0, totalLine = 0;
  for (const l of lines) {
    const isTotal = /total|amount due|balance due|grand total/i.test(l) && !/subtotal/i.test(l);
    let m; moneyRe.lastIndex = 0;
    while ((m = moneyRe.exec(l))) {
      const v = parseFloat(m[1].replace(/,/g, ''));
      if (!isFinite(v) || v <= 0 || v >= 1000000) continue;
      if (isTotal && v > totalLine) totalLine = v;
      if (v > biggest) biggest = v;
    }
  }
  const vendor = (lines.find(l => /[A-Za-z]{3}/.test(l) && !/receipt|invoice|thank|welcome|order|date/i.test(l)) || '')
    .replace(/[^A-Za-z0-9 .&'-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
  const hay = text.toLowerCase();
  let category_id = '';
  for (const [keys, catKeys] of SCAN_RULES) {
    if (keys.some(k => hay.includes(k))) {
      const hit = categories.find(c => catKeys.some(ck => (c.name || '').toLowerCase().includes(ck)));
      if (hit) { category_id = hit.id; break; }
    }
  }
  return { amount: totalLine || biggest || 0, vendor, category_id };
}

/* ═════════════════ fast expense entry ═════════════════
   The spec is right that this decides whether the system survives. Target is
   under 15 seconds: amount is autofocused with a numeric keypad, categories
   are one tap with recently-used first, the camera opens straight from the
   file input. If it's offline the expense is queued locally and synced later,
   so standing in a driveway with no signal still works. */

function FastExpense({ categories, jobs, recentIds, onSaved, onClose, isAdmin }) {
  const [amount, setAmount] = useState('');
  const [catId, setCatId] = useState('');
  const [jobId, setJobId] = useState('');
  const [vendor, setVendor] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState('');
  const [scanState, setScanState] = useState(null);   // null | 'reading' | 'done' | 'failed'
  const [scanPct, setScanPct] = useState(0);
  const fileRef = useRef(null);

  const scan = async picked => {
    setScanState('reading'); setScanPct(0);
    try {
      const text = await ocrReceipt(picked, p => setScanPct(Math.round(p * 100)));
      const guess = parseReceipt(text, categories);
      if (guess.amount && !num(amount)) setAmount(String(guess.amount));
      if (guess.vendor && !vendor) setVendor(guess.vendor);
      if (guess.category_id && !catId) setCatId(guess.category_id);
      setScanState(guess.amount || guess.vendor ? 'done' : 'failed');
    } catch (e) { setScanState('failed'); }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return categories.filter(c => c.is_active !== false && (!q || c.name.toLowerCase().includes(q)));
  }, [categories, search]);

  // Recently used first, after a week of use this is a one-tap choice.
  const ordered = useMemo(() => {
    const recent = recentIds.map(id => categories.find(c => c.id === id)).filter(Boolean);
    const rest = categories.filter(c => !recentIds.includes(c.id) && c.is_active !== false);
    return [...recent, ...rest];
  }, [categories, recentIds]);

  const chosen = categories.find(c => c.id === catId);

  const save = async () => {
    if (!num(amount)) { setErr('Put in an amount first.'); return; }
    if (!catId) { setErr('Pick what it was for.'); return; }
    setBusy(true); setErr('');
    try {
      await onSaved({
        amount: num(amount), category_id: catId, job_id: jobId || null,
        vendor: vendor.trim() || null, date: todayISO(), file
      });
      onClose();
    } catch (e) { setErr(e.message || 'That did not save.'); setBusy(false); }
  };

  return (
    <>
      <Field label="How much?" big type="text" inputMode="decimal" prefix="$" value={amount}
             onChange={v => setAmount(v.replace(/[^0-9.]/g, ''))} placeholder="0" autoFocus />

      <div className="mt-5">
        <div className="flex items-baseline justify-between gap-3 mb-2">
          <span className="text-[11px] font-black uppercase tracking-[.09em] text-muted">What was it for?</span>
          <button onClick={() => setShowAll(v => !v)} className="text-xs font-black text-navy underline underline-offset-2">
            {showAll ? 'Show fewer' : `See all ${categories.length}`}
          </button>
        </div>

        {/* With ~100 categories a flat chip list stops working, so search and
            the grouped full list are one tap away. Common ones stay on top. */}
        {showAll && (
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search, rent, fuel, insurance…"
                 className="w-full rounded-2xl border-2 border-line bg-white px-4 py-3 font-bold text-ink mb-3" />
        )}

        {!showAll ? (
          <div className="flex flex-wrap gap-2">
            {ordered.slice(0, 12).map(c => (
              <button key={c.id} onClick={() => setCatId(c.id)}
                className={'px-4 py-3 rounded-2xl font-black text-sm transition border-2 ' +
                  (catId === c.id ? 'bg-navy text-white border-navy' : 'bg-white text-navy border-line hover:bg-shell')}>
                {c.name}
              </button>
            ))}
          </div>
        ) : (
          <div className="max-h-72 overflow-y-auto rounded-2xl border-2 border-line p-2 relative">
            {BUCKET_ORDER.map(b => {
              const items = filtered.filter(c => c.bucket === b.v);
              if (!items.length) return null;
              return (
                <div key={b.v} className="mb-2">
                  <div className="text-[10px] font-black uppercase tracking-[.1em] text-muted px-2 py-1.5">{b.t}</div>
                  <div className="flex flex-wrap gap-2">
                    {items.map(c => (
                      <button key={c.id} onClick={() => { setCatId(c.id); setShowAll(false); setSearch(''); }}
                        className={'px-3.5 py-2.5 rounded-xl font-black text-sm transition border-2 ' +
                          (catId === c.id ? 'bg-navy text-white border-navy' : 'bg-white text-navy border-line hover:bg-shell')}>
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && <p className="text-sm font-bold text-muted p-3">Nothing matches "{search}".</p>}
          </div>
        )}

        {chosen && (
          <p className="text-xs font-bold mt-2" style={{ color: chosen.bucket === 'job_cost' ? '#0E7A4A' : '#657381' }}>
            {chosen.bucket === 'job_cost'
              ? `“${chosen.name}” is a job cost, it comes off that job's profit.`
              : chosen.excluded_from_ebitda
                ? `“${chosen.name}” sits below the EBITDA line, it hits net profit, not EBITDA.`
                : `“${chosen.name}” is company overhead, it comes off the whole business, not one job.`}
          </p>
        )}
      </div>

      <div className="mt-5 grid sm:grid-cols-2 gap-4">
        <Select label="Put it on a job? (optional)" value={jobId} onChange={setJobId}
                options={[{ v: '', t: 'Not on a job (company overhead)' }, ...jobs.map(j => ({ v: j.id, t: j.name }))]} />
        <Field label="Who did you pay? (optional)" value={vendor} onChange={setVendor} placeholder="ABC Supply" />
      </div>

      <div className="mt-5">
        <span className="block text-[11px] font-black uppercase tracking-[.09em] text-muted mb-2">Photo of the receipt</span>
        <input ref={fileRef} type="file" accept="image/*,application/pdf" capture="environment"
               onChange={e => {
                 const picked = e.target.files && e.target.files[0];
                 setFile(picked);
                 if (picked && picked.type.startsWith('image/') && navigator.onLine) scan(picked);
               }}
               className="block w-full text-sm font-bold text-ink file:mr-4 file:py-4 file:px-5 file:rounded-xl file:border-0
                          file:bg-navy file:text-white file:font-black file:cursor-pointer" />
        <p className="text-xs text-muted font-semibold mt-2">
          On a phone this opens the camera. The app reads the photo right on the phone and fills in
          the amount and vendor for you.
        </p>
        {scanState === 'reading' && (
          <div className="mt-3"><Banner tone="info">Reading the receipt… {scanPct}%</Banner></div>
        )}
        {scanState === 'done' && (
          <div className="mt-3"><Banner tone="good">
            Read it. <b>Check the amount and category before saving</b> — the scanner guesses, you decide.
          </Banner></div>
        )}
        {scanState === 'failed' && (
          <div className="mt-3"><Banner tone="warn">
            Couldn't read that photo well. Type the amount in, the picture still saves with the expense.
          </Banner></div>
        )}
      </div>

      {err && <div className="mt-4"><Banner tone="error">{err}</Banner></div>}

      <Btn tone="green" size="xl" onClick={save} disabled={busy} className="w-full mt-6">
        {busy ? 'Saving…' : 'Save it'}
      </Btn>
      <p className="text-xs font-bold text-muted mt-3 text-center">
        No signal? It saves on this phone and uploads itself when you're back online.
      </p>
    </>
  );
}

/* ═════════════════════════ money out ═════════════════════════ */

function MoneyOut({ expenses, categories, jobs, onAdd, onDelete, isAdmin, noteDismissed, onDismissNote }) {
  const [bucket, setBucket] = useState('all');
  const [catFilter, setCatFilter] = useState('');
  const [q, setQ] = useState('');

  const rows = useMemo(() => expenses.filter(e => {
    const c = bucketOf(e, categories);
    if (bucket === 'job' && c.bucket !== 'job_cost') return false;
    if (bucket === 'overhead' && c.bucket === 'job_cost') return false;
    if (catFilter && e.category_id !== catFilter) return false;
    if (q) {
      const hay = ((e.vendor || '') + ' ' + (c.name || '') + ' ' + (e.notes || '')).toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  }), [expenses, categories, bucket, catFilter, q]);

  const total = rows.reduce((a, e) => a + num(e.amount), 0);
  const jobName = id => (jobs.find(j => j.id === id) || {}).name;

  return (
    <div className="space-y-5">
      {!noteDismissed && (
        <Banner tone="warn" onDismiss={onDismissNote}>
          This is for seeing where money leaks, it is <b>not</b> tax-ready bookkeeping.
          Keep a bookkeeper or accounting software running alongside for filing, and treat
          any tax reserve figure here as an estimate only.
        </Banner>
      )}

      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex gap-2 flex-wrap">
          {[{ v: 'all', t: 'Everything' }, { v: 'job', t: 'Job costs only' }, { v: 'overhead', t: 'Overhead only' }].map(b => (
            <button key={b.v} onClick={() => setBucket(b.v)}
              className={'px-4 py-3 rounded-2xl font-black text-sm border-2 transition ' +
                (bucket === b.v ? 'bg-navy text-white border-navy' : 'bg-white text-navy border-line')}>
              {b.t}
            </button>
          ))}
        </div>
        <div className="flex-1 min-w-[180px]">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search vendor or category"
                 className="w-full rounded-2xl border-2 border-line bg-white px-4 py-3 font-bold text-ink" />
        </div>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
        <Tile label="Showing" value={moneyExact(total)} sub={`${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}`} />
        <Tile label="Job costs" value={moneyExact(rows.filter(e => bucketOf(e, categories).bucket === 'job_cost').reduce((a, e) => a + num(e.amount), 0))} sub="Attached to work" />
        <Tile label="Overhead" value={moneyExact(rows.filter(e => bucketOf(e, categories).bucket !== 'job_cost').reduce((a, e) => a + num(e.amount), 0))} sub="Runs the company" />
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-3xl card-shadow p-10 text-center">
          <div className="text-5xl mb-3" aria-hidden="true">🧾</div>
          <h3 className="text-2xl font-black text-navy">Nothing logged yet</h3>
          <p className="text-muted font-bold mt-2">Tap the orange <b>+</b> button to add your first expense.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {rows.map(e => {
            const c = bucketOf(e, categories);
            const isJob = c.bucket === 'job_cost';
            return (
              <div key={e.id} className="bg-white rounded-2xl card-shadow p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl grid place-items-center text-xl shrink-0"
                     style={{ background: isJob ? '#E8F1EC' : '#EEF2F6' }} aria-hidden="true">
                  {e._bill ? '🔁' : e.receipt_url ? '🧾' : isJob ? '🔨' : '🏢'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-black text-ink truncate">{c.name}</div>
                  <div className="text-xs font-bold text-muted truncate">
                    {e.date}{e.vendor ? ' · ' + e.vendor : ''}{e.job_id ? ' · ' + (jobName(e.job_id) || 'job') : ' · overhead'}
                  </div>
                </div>
                <div className="figure text-xl font-black text-navy shrink-0">{moneyExact(e.amount)}</div>
                {isAdmin && (e._legacy
                  ? <span className="text-[10px] font-black text-muted uppercase tracking-wide shrink-0 text-right leading-tight">From<br/>the job</span>
                  : e._bill
                  ? <span className="text-[10px] font-black text-muted uppercase tracking-wide shrink-0 text-right leading-tight">Fixed<br/>cost</span>
                  : <Btn tone="danger" size="sm" onClick={() => onDelete(e)}>Delete</Btn>)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═════════════════════════ jobs ═════════════════════════ */

function JobCard({ j, docCount, expenseTotal, isAdmin, onToggle, onEdit, onDelete, onPapers }) {
  const m = jobMetrics({ ...j, direct_costs: expenseTotal });
  const st = marginState(m.margin);
  return (
    <div className="bg-white rounded-3xl card-shadow p-5">
      <div className="flex items-start gap-3">
        <button onClick={() => onToggle(j)} aria-pressed={!!j.done}
                aria-label={j.done ? `${j.name} is installed` : `${j.name} is not installed yet`}
                className="w-12 h-12 rounded-full grid place-items-center text-white text-2xl font-black shrink-0"
                style={{ background: j.done ? '#0E7A4A' : '#CBD5E1' }}>{j.done ? '✓' : ''}</button>
        <div className="min-w-0 flex-1">
          <div className="font-black text-ink text-lg leading-tight break-words">{j.name}</div>
          <div className="text-xs font-bold text-muted mt-1">
            {j.done ? 'Installed' : 'In progress'}{num(j.squares) ? ` · ${num(j.squares)} squares` : ''}
          </div>
        </div>
      </div>
      {isAdmin && (
        <>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="bg-shell rounded-2xl px-4 py-3">
              <div className="text-[10px] font-black uppercase tracking-[.08em] text-muted">They paid</div>
              <div className="figure text-2xl font-black text-navy mt-0.5">{moneyExact(m.revenue)}</div>
            </div>
            <div className="bg-shell rounded-2xl px-4 py-3">
              <div className="text-[10px] font-black uppercase tracking-[.08em] text-muted">Gross profit</div>
              <div className="figure text-2xl font-black mt-0.5" style={{ color: m.profit >= 0 ? '#0E7A4A' : '#BE2B1D' }}>
                {moneyExact(m.profit)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-3">
            <div className="h-2.5 flex-1 rounded-[4px]" style={{ background: '#E8EDF2' }}>
              <div className="h-2.5 rounded-[4px]" style={{ width: Math.max(0, Math.min(100, m.margin ?? 0)) + '%', background: st.color }} />
            </div>
            <span className="text-sm font-black tnum whitespace-nowrap" style={{ color: st.color }}>
              {m.margin === null ? 'Not yet' : pct(m.margin)} {st.label}
            </span>
          </div>
        </>
      )}
      <div className="flex gap-2 mt-4 flex-wrap">
        <Btn tone="navy" size="md" onClick={() => onPapers(j)} className="flex-1">🧾 Papers{docCount ? ` (${docCount})` : ''}</Btn>
        <Btn tone="ghost" size="md" onClick={() => onEdit(j)} className="flex-1">Edit</Btn>
        {isAdmin && <Btn tone="danger" size="md" onClick={() => onDelete(j)}>Delete</Btn>}
      </div>
    </div>
  );
}

const EMPTY_JOB = { name: '', squares: '', contract_total: '', done: true, lead_source: '' };

function JobForm({ initial, onSave, onClose, isAdmin }) {
  const [f, setF] = useState(initial ? { ...initial } : EMPTY_JOB);
  const [busy, setBusy] = useState(false);
  const set = k => v => setF(p => ({ ...p, [k]: v }));
  const canSave = (f.name || '').trim().length > 0;
  return (
    <>
      <div className="grid gap-4">
        <Field label="Job name or address" value={f.name || ''} onChange={set('name')} placeholder="12 Maple St, Johnson" autoFocus />
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Squares sold" type="number" value={f.squares || ''} onChange={set('squares')} placeholder="0" hint="1 square = 100 sq ft" />
          <Select label="How did they hear about us?" value={f.lead_source || ''} onChange={set('lead_source')}
                  options={[{ v: '', t: 'Not sure' }, { v: 'google_ads', t: 'Google Ads' }, { v: 'facebook', t: 'Facebook' },
                            { v: 'referral', t: 'Referral' }, { v: 'door_knock', t: 'Door knock' },
                            { v: 'yard_sign', t: 'Yard sign' }, { v: 'repeat', t: 'Repeat customer' }, { v: 'other', t: 'Other' }]} />
        </div>
        {isAdmin && (
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Contract total" type="number" prefix="$" value={f.contract_total || ''} onChange={set('contract_total')}
                   placeholder="0" hint="What the customer agreed to pay" />
            <Select label="How are they paying?" value={f.payment_type || ''} onChange={set('payment_type')}
                    options={[{ v: '', t: 'Not set' }, { v: 'cash', t: 'Cash' }, { v: 'check', t: 'Check' }, { v: 'financed', t: 'Financed' }]} />
          </div>
        )}
        <label className="flex items-center gap-3 bg-shell rounded-2xl px-4 py-3.5 cursor-pointer">
          <input type="checkbox" checked={!!f.done} onChange={e => set('done')(e.target.checked)} className="w-6 h-6 accent-[#0E7A4A]" />
          <span className="font-black text-navy">Install is finished</span>
        </label>
      </div>
      <div className="flex gap-3 justify-end mt-7">
        <Btn tone="ghost" onClick={onClose}>Cancel</Btn>
        <Btn tone="green" size="lg" disabled={!canSave || busy}
             onClick={async () => { setBusy(true); try { await onSave(f); } finally { setBusy(false); } }}>
          {busy ? 'Saving…' : 'Save job'}
        </Btn>
      </div>
    </>
  );
}

/* ═════════════════════════ papers ═════════════════════════ */

function DocsPanel({ job, docs, onUpload, onDeleteDoc, onOpenDoc, canDelete }) {
  const [kind, setKind] = useState('receipt');
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const inputRef = useRef(null);
  const mine = docs.filter(d => d.job_id === job.id);
  const total = mine.reduce((a, d) => a + num(d.amount), 0);

  const go = async () => {
    if (!file) { setErr('Pick a photo or a PDF first.'); return; }
    setBusy(true); setErr('');
    try {
      await onUpload({ job, file, kind, label: label.trim(), amount: num(amount) });
      setFile(null); setLabel(''); setAmount(''); if (inputRef.current) inputRef.current.value = '';
    } catch (e) { setErr(e.message || 'That upload did not work.'); }
    setBusy(false);
  };

  return (
    <>
      {!CLOUD && <div className="mb-5"><Banner tone="warn">File uploads need sign-in turned on.</Banner></div>}
      <div className="rounded-2xl border-2 border-line p-5">
        <h3 className="font-black text-navy text-lg">Add a paper to this job</h3>
        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <Select label="What is it?" value={kind} onChange={setKind} options={DOC_KINDS.map(k => ({ v: k.v, t: k.t }))} />
          <Field label="Amount on it" type="number" prefix="$" value={amount} onChange={setAmount} placeholder="0" />
        </div>
        <div className="mt-4"><Field label="Short note (optional)" value={label} onChange={setLabel} placeholder="ABC Supply, shingles" /></div>
        <div className="mt-4">
          <span className="block text-[11px] font-black uppercase tracking-[.09em] text-muted mb-2">The photo or PDF</span>
          <input ref={inputRef} type="file" accept="image/*,application/pdf" disabled={!CLOUD}
                 onChange={e => setFile(e.target.files && e.target.files[0])}
                 className="block w-full text-sm font-bold text-ink file:mr-4 file:py-3 file:px-5 file:rounded-xl file:border-0
                            file:bg-navy file:text-white file:font-black file:cursor-pointer disabled:opacity-40" />
        </div>
        {err && <div className="mt-4"><Banner tone="error">{err}</Banner></div>}
        <Btn tone="green" size="lg" onClick={go} disabled={busy || !CLOUD || !file} className="w-full mt-5">
          {busy ? 'Saving…' : 'Save this paper'}
        </Btn>
      </div>
      <div className="mt-6">
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <h3 className="font-black text-navy text-lg">Papers on this job</h3>
          {mine.length > 0 && <span className="font-black text-muted tnum">{mine.length} · {moneyExact(total)}</span>}
        </div>
        {mine.length === 0 ? <p className="text-muted font-bold">Nothing attached yet.</p> : (
          <ul className="space-y-2">
            {mine.map(d => (
              <li key={d.id} className="flex items-center gap-3 bg-shell rounded-2xl px-4 py-3">
                <span className="text-2xl shrink-0" aria-hidden="true">🧾</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-black text-ink truncate">{d.label || d.file_name || kindLabel(d.kind)}</span>
                  <span className="block text-xs font-bold text-muted">
                    {kindLabel(d.kind)}{num(d.amount) > 0 ? ' · ' + moneyExact(d.amount) : ''}
                  </span>
                </span>
                <Btn tone="white" size="sm" onClick={() => onOpenDoc(d)}>Open</Btn>
                {canDelete(d) && <Btn tone="danger" size="sm" onClick={() => onDeleteDoc(d)}>Delete</Btn>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

/* ═════════════════════════ team ═════════════════════════ */

function TeamPanel({ people, meId, onSetRole, busyId }) {
  return (
    <div className="grid gap-4">
      {people.map(p => {
        const admin = p.role === 'admin';
        return (
          <div key={p.id} className="bg-white rounded-3xl card-shadow p-5">
            <div className="font-black text-ink text-lg leading-tight break-words">{p.full_name || p.email}</div>
            <div className="text-xs font-bold text-muted mt-1 break-all">{p.email}{p.id === meId ? ' · you' : ''}</div>
            <span className="inline-block mt-3 rounded-full px-3 py-1.5 text-xs font-black text-white"
                  style={{ background: admin ? '#9333EA' : '#5A6B7F' }}>
              {admin ? 'Everything, including money' : 'Jobs and papers only'}
            </span>
            <div className="mt-4">
              {p.id === meId ? <span className="text-xs font-bold text-muted">You can't change your own access</span> : (
                <Btn tone={admin ? 'ghost' : 'navy'} size="md" disabled={busyId === p.id}
                     onClick={() => onSetRole(p, admin ? 'crew' : 'admin')} className="w-full">
                  {busyId === p.id ? '…' : admin ? 'Make crew' : 'Make admin'}
                </Btn>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ═════════════════════════ fixed costs ═════════════════════════
   Set rent, workers comp, warranty, insurance once. They come out every
   month on their own until switched off. */

const BILL_PRESETS = [
  { name: 'Rent',                    match: ['rent'] },
  { name: 'Workers comp',            match: ['workers comp'] },
  { name: 'Warranty reserve',        match: ['warranty'] },
  { name: 'General liability',       match: ['general liability'] },
  { name: 'Vehicle insurance',       match: ['vehicle insurance'] },
  { name: 'Health insurance',        match: ['health insurance'] },
  { name: 'Phone',                   match: ['phone'] },
  { name: 'Software',                match: ['software'] },
  { name: 'Fuel budget',             match: ['fuel'] },
  { name: 'Storage',                 match: ['storage', 'office'] }
];

function findCategoryFor(preset, categories) {
  for (const m of preset.match) {
    const hit = categories.find(c => (c.name || '').toLowerCase().includes(m));
    if (hit) return hit.id;
  }
  const fallback = categories.find(c => c.bucket === 'overhead');
  return fallback ? fallback.id : '';
}

function BillForm({ initial, categories, onSave, onClose }) {
  const [f, setF] = useState(initial || {
    name: '', amount: '', frequency: 'monthly',
    category_id: '', starts_on: todayISO().slice(0, 7) + '-01', is_active: true
  });
  const [busy, setBusy] = useState(false);
  const set = k => v => setF(p => ({ ...p, [k]: v }));
  const overheadCats = categories.filter(c => c.bucket !== 'job_cost' && c.is_active !== false);
  const monthly = monthlyEquivalent(f);

  return (
    <>
      {!initial && (
        <div className="mb-5">
          <span className="block text-[11px] font-black uppercase tracking-[.09em] text-muted mb-2">Common ones, one tap</span>
          <div className="flex flex-wrap gap-2">
            {BILL_PRESETS.map(p => (
              <button key={p.name}
                onClick={() => setF(prev => ({ ...prev, name: p.name, category_id: findCategoryFor(p, categories) }))}
                className={'px-3.5 py-2.5 rounded-xl font-black text-sm border-2 transition ' +
                  (f.name === p.name ? 'bg-navy text-white border-navy' : 'bg-white text-navy border-line hover:bg-shell')}>
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4">
        <Field label="What is it?" value={f.name} onChange={set('name')} placeholder="Rent" autoFocus={!f.name} />
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="How much?" type="number" prefix="$" value={f.amount} onChange={set('amount')} placeholder="0" />
          <Select label="How often?" value={f.frequency} onChange={set('frequency')}
                  options={BILL_FREQS.map(x => ({ v: x.v, t: x.t }))} />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Select label="What kind of cost?" value={f.category_id} onChange={set('category_id')}
                  options={[{ v: '', t: 'Pick one' }, ...overheadCats.map(c => ({ v: c.id, t: c.name }))]} />
          <Field label="Started when?" type="month" value={String(f.starts_on || '').slice(0, 7)}
                 onChange={v => set('starts_on')(v ? v + '-01' : '')}
                 hint="It counts from this month forward." />
        </div>
      </div>

      {num(f.amount) > 0 && (
        <div className="mt-5"><Banner tone="info">
          This takes <b>{moneyExact(monthly)}</b> out of the company every month, automatically.
        </Banner></div>
      )}

      <div className="flex gap-3 justify-end mt-7">
        <Btn tone="ghost" onClick={onClose}>Cancel</Btn>
        <Btn tone="green" size="lg" disabled={busy || !f.name.trim() || !num(f.amount) || !f.category_id}
             onClick={async () => { setBusy(true); try { await onSave(f); } finally { setBusy(false); } }}>
          {busy ? 'Saving…' : 'Save fixed cost'}
        </Btn>
      </div>
    </>
  );
}

function BillsPanel({ bills, categories, onAdd, onEdit, onToggle, onDelete }) {
  const active = bills.filter(b => b.is_active !== false);
  const totalMonthly = active.reduce((a, b) => a + monthlyEquivalent(b), 0);
  const catName = id => (categories.find(c => c.id === id) || {}).name || 'Overhead';

  return (
    <div className="space-y-5">
      <Banner tone="info">
        Fixed costs come out <b>every month on their own</b>. Set rent, workers comp, warranty and
        insurance here once, and stop logging them by hand. One-off buys still go through the orange + button.
      </Banner>

      <div className="grid gap-4 grid-cols-2">
        <Tile label="Fixed costs per month" value={moneyExact(totalMonthly)} sub={`${active.length} active`} color="#BE2B1D" />
        <Tile label="Per year" value={money(totalMonthly * 12)} sub="What fixed costs eat annually" />
      </div>

      <div className="flex justify-end">
        <Btn tone="green" size="md" onClick={onAdd}>＋ Add fixed cost</Btn>
      </div>

      {bills.length === 0 ? (
        <div className="bg-white rounded-3xl card-shadow p-10 text-center">
          <div className="text-5xl mb-3" aria-hidden="true">🔁</div>
          <h3 className="text-2xl font-black text-navy">No fixed costs yet</h3>
          <p className="text-muted font-bold mt-2">Start with rent and workers comp. They'll hit the books every month automatically.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {bills.map(b => {
            const off = b.is_active === false;
            return (
              <div key={b.id} className={'bg-white rounded-2xl card-shadow p-4 flex items-center gap-4 ' + (off ? 'opacity-50' : '')}>
                <div className="w-12 h-12 rounded-2xl grid place-items-center text-xl shrink-0 bg-shell" aria-hidden="true">🔁</div>
                <div className="min-w-0 flex-1">
                  <div className="font-black text-ink truncate">{b.name}</div>
                  <div className="text-xs font-bold text-muted truncate">
                    {(BILL_FREQS.find(x => x.v === b.frequency) || {}).t || 'Every month'} · {catName(b.category_id)}
                    {off ? ' · turned off' : ''}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="figure text-xl font-black text-navy">{moneyExact(b.amount)}</div>
                  {b.frequency !== 'monthly' && (
                    <div className="text-[10px] font-bold text-muted">{moneyExact(monthlyEquivalent(b))}/mo</div>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <Btn tone="ghost" size="sm" onClick={() => onEdit(b)}>Edit</Btn>
                  <Btn tone={off ? 'navy' : 'white'} size="sm" onClick={() => onToggle(b)}>{off ? 'Turn on' : 'Pause'}</Btn>
                  <Btn tone="danger" size="sm" onClick={() => onDelete(b)}>Delete</Btn>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
