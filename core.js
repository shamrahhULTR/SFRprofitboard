/* ===========================================================================
   PROFIT BOARD, core
   Connection, number formatting, the P&L maths, and the shared UI pieces.
   Loaded before app.js; both are compiled in the browser by Babel.
   =========================================================================== */

const { useState, useEffect, useMemo, useCallback, useRef } = React;

/* ─────────────────────────── connection ─────────────────────────── */

const CFG     = window.SFR_CONFIG || {};
const CLOUD   = !!(CFG.supabaseUrl && CFG.supabaseKey);
const sb      = CLOUD ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey) : null;
const COMPANY = CFG.companyName || 'Square Foot Roofing';

const LS_JOBS = 'sfr_pb_jobs_v1';
const LS_MKT  = 'sfr_pb_mkt_v1';
const LS_EXP  = 'sfr_pb_exp_v1';
const LS_REV  = 'sfr_pb_rev_v1';
const LS_QUEUE = 'sfr_pb_queue_v1';   // offline expense capture
const LS_BILLS = 'sfr_pb_bills_v1';   // fixed monthly costs (rent, comp, warranty)

function load(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch (e) { return fallback; }
}
function persist(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ─────────────────────────── numbers ─────────────────────────── */

const num = v => { const n = parseFloat(String(v ?? '').replace(/[^0-9.-]/g, '')); return isFinite(n) ? n : 0; };

function money(n) {
  const v = Math.round(num(n)); const sign = v < 0 ? '-' : ''; const a = Math.abs(v);
  if (a >= 1000000) return sign + '$' + (a / 1000000).toFixed(a >= 10000000 ? 0 : 2).replace(/\.00$/, '') + 'M';
  return sign + '$' + a.toLocaleString('en-US');
}
const moneyExact = n => (num(n) < 0 ? '-' : '') + '$' + Math.abs(Math.round(num(n))).toLocaleString('en-US');
const pct = n => (isFinite(n) ? Math.round(n) : 0) + '%';

const ratio     = (top, bottom) => (num(bottom) > 0 ? num(top) / num(bottom) : null);
const showMoney = v => (v === null || v === undefined ? 'Not yet' : money(v));
const showPct   = v => (v === null || v === undefined ? 'Not yet' : pct(v));
const marginPct = (part, whole) => (num(whole) > 0 ? (num(part) / num(whole)) * 100 : null);

const todayISO = () => new Date().toISOString().slice(0, 10);
const monthKey = d => String(d || '').slice(0, 7);            // YYYY-MM
const monthLabel = k => {
  if (!k) return '';
  const [y, m] = k.split('-');
  return new Date(+y, +m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
};

function jobMetrics(j) {
  const revenue = num(j.contract_total ?? j.revenue);
  const cost = num(j.material) + num(j.labor) + num(j.dumpster) + num(j.direct_costs);
  const profit = revenue - cost;
  return { revenue, cost, profit, margin: revenue > 0 ? (profit / revenue) * 100 : null };
}

function marginState(margin) {
  if (margin === null || margin === undefined) return { color: '#8A97A5', label: 'No revenue yet' };
  if (margin >= 30) return { color: '#0E7A4A', label: 'Healthy' };
  if (margin >= 15) return { color: '#E0A100', label: 'Thin' };
  return { color: '#BE2B1D', label: 'Losing money' };
}

/* ═══════════════════════════ the P&L ═══════════════════════════
   Four numbers, not two. The old dashboard called gross profit "what the
   company kept", which ignores every overhead dollar and flatters the
   business. Buckets decide where each expense lands:

     job_cost              → above gross profit
     overhead (in EBITDA)  → operating cost, reduces EBITDA
     overhead (excluded)   → interest / depreciation / amortisation, below EBITDA
     owner_draw            → never an operating expense, below EBITDA
     tax_reserve           → below EBITDA
   ═══════════════════════════════════════════════════════════════ */

function bucketOf(expense, categories) {
  // Synthesised rows (legacy job costs carried over from job_money) declare
  // their own bucket, since they have no category row to look up.
  if (expense._bucket) {
    return { bucket: expense._bucket, excluded_from_ebitda: !!expense._excluded,
             name: expense._name || 'Job cost' };
  }
  const c = categories.find(x => x.id === expense.category_id);
  return c || { bucket: 'overhead', excluded_from_ebitda: false, name: 'Uncategorised' };
}

function computePL(revenueEntries, expenses, categories, depreciation = 0) {
  const revenue = revenueEntries.reduce((a, r) => a + num(r.amount), 0);
  let jobCosts = 0, operating = 0, belowLine = 0, draws = 0, tax = 0;

  expenses.forEach(e => {
    const c = bucketOf(e, categories);
    const amt = num(e.amount);
    if (c.bucket === 'job_cost') jobCosts += amt;
    else if (c.bucket === 'owner_draw') draws += amt;
    else if (c.bucket === 'tax_reserve') tax += amt;
    else if (c.excluded_from_ebitda) belowLine += amt;
    else operating += amt;
  });

  const grossProfit = revenue - jobCosts;
  const ebitda = grossProfit - operating;
  const netProfit = ebitda - belowLine - depreciation - draws - tax;

  return {
    revenue, jobCosts, grossProfit, operating, ebitda,
    belowLine, depreciation, draws, tax, netProfit,
    grossMargin: marginPct(grossProfit, revenue),
    ebitdaMargin: marginPct(ebitda, revenue),
    netMargin: marginPct(netProfit, revenue)
  };
}

const dayKey = d => String(d || '').slice(0, 10);
const dayLabel = k => {
  const d = new Date(k + 'T00:00:00');
  return isNaN(d) ? k : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

/* Series at whatever granularity the chart is showing. Days are filled in
   between the first and last entry so the line is continuous like a stock
   chart, rather than jumping between the handful of dates that happen to have
   a sale on them. */
function periodSeries(revenueEntries, expenses, categories, depFor, granularity) {
  const day = granularity === 'day';
  const keyOf = day ? dayKey : monthKey;
  const labelOf = day ? dayLabel : monthLabel;

  const keys = new Set();
  revenueEntries.forEach(r => keys.add(keyOf(r.date)));
  expenses.forEach(e => keys.add(keyOf(e.date)));
  const present = [...keys].filter(Boolean).sort();
  if (!present.length) return [];

  // Fill the gaps so the line is unbroken.
  const all = [];
  if (day) {
    const start = new Date(present[0] + 'T00:00:00');
    const end = new Date(present[present.length - 1] + 'T00:00:00');
    const today = new Date(todayISO() + 'T00:00:00');
    const stop = end > today ? end : today;
    for (let d = new Date(start); d <= stop && all.length < 800; d.setDate(d.getDate() + 1)) {
      all.push(d.toISOString().slice(0, 10));
    }
  } else {
    const [sy, sm] = present[0].split('-').map(Number);
    const [ey, em] = present[present.length - 1].split('-').map(Number);
    const cur = new Date(sy, sm - 1, 1), end = new Date(ey, em - 1, 1);
    const today = new Date(); today.setDate(1);
    const stop = end > today ? end : today;
    while (cur <= stop && all.length < 240) {
      all.push(cur.getFullYear() + '-' + String(cur.getMonth() + 1).padStart(2, '0'));
      cur.setMonth(cur.getMonth() + 1);
    }
  }

  return all.map(k => {
    const pl = computePL(
      revenueEntries.filter(r => keyOf(r.date) === k),
      expenses.filter(e => keyOf(e.date) === k),
      categories,
      day ? 0 : (depFor ? depFor(k) : 0)     // depreciation is a monthly figure
    );
    return { key: k, label: labelOf(k), ...pl };
  });
}

/* Running totals, so the line climbs as the year goes on instead of bouncing
   around zero. This is what makes it read like a share price. */
function cumulative(series) {
  let r = 0, g = 0, e = 0, n = 0;
  return series.map(p => {
    r += p.revenue; g += p.grossProfit; e += p.ebitda; n += p.netProfit;
    return { ...p, revenue: r, grossProfit: g, ebitda: e, netProfit: n };
  });
}

// Monthly series for the charts, oldest first.
function monthlySeries(revenueEntries, expenses, categories, depreciationFor) {
  const keys = new Set();
  revenueEntries.forEach(r => keys.add(monthKey(r.date)));
  expenses.forEach(e => keys.add(monthKey(e.date)));
  if (!keys.size) keys.add(monthKey(todayISO()));

  return [...keys].filter(Boolean).sort().map(k => {
    const pl = computePL(
      revenueEntries.filter(r => monthKey(r.date) === k),
      expenses.filter(e => monthKey(e.date) === k),
      categories,
      depreciationFor ? depreciationFor(k) : 0
    );
    return { month: k, label: monthLabel(k), ...pl };
  });
}

// Straight-line depreciation, computed from assets rather than typed in.
function depreciationForMonth(assets, key) {
  if (!assets || !assets.length || !key) return 0;
  const [y, m] = key.split('-').map(Number);
  const monthStart = new Date(y, m - 1, 1);
  return assets.reduce((total, a) => {
    if (a.is_active === false) return total;
    const start = new Date(a.purchase_date);
    const end = new Date(start); end.setFullYear(end.getFullYear() + (a.useful_life_years || 5));
    if (monthStart < new Date(start.getFullYear(), start.getMonth(), 1)) return total;
    if (monthStart >= new Date(end.getFullYear(), end.getMonth(), 1)) return total;
    const base = Math.max(num(a.purchase_price) - num(a.salvage_value), 0);
    return total + base / ((a.useful_life_years || 5) * 12);
  }, 0);
}

// Trailing twelve months, the figure a buyer or lender asks for.
function ttmFrom(series) {
  const last12 = series.slice(-12);
  return last12.reduce((a, m) => ({
    revenue: a.revenue + m.revenue, grossProfit: a.grossProfit + m.grossProfit,
    ebitda: a.ebitda + m.ebitda, netProfit: a.netProfit + m.netProfit
  }), { revenue: 0, grossProfit: 0, ebitda: 0, netProfit: 0 });
}

/* ═══════════ fixed costs (monthly bills) ═══════════
   Rent, workers comp, warranty, insurance: set once, they come out every
   month on their own. Weekly and annual bills are converted to their monthly
   equivalent so the P&L feels them evenly. */

const BILL_FREQS = [
  { v: 'monthly',   t: 'Every month' },
  { v: 'weekly',    t: 'Every week' },
  { v: 'quarterly', t: 'Every 3 months' },
  { v: 'annual',    t: 'Once a year' }
];

function monthlyEquivalent(bill) {
  const a = num(bill.amount);
  switch (bill.frequency) {
    case 'weekly':    return a * 52 / 12;
    case 'quarterly': return a / 3;
    case 'annual':    return a / 12;
    default:          return a;
  }
}

/* One synthesized expense per month, dated the 1st, from the bill's start
   month through the current month. They flow through the same P&L as any
   logged expense, so nothing special-cases them downstream. */
function billsAsExpenses(bills) {
  const rows = [];
  const now = new Date();
  (bills || []).forEach(b => {
    if (b.is_active === false) return;
    const startKey = monthKey(b.starts_on || b.created_at || todayISO());
    let [y, m] = startKey.split('-').map(Number);
    if (!y || !m) return;
    let guard = 0;
    while ((y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth() + 1)) && guard++ < 120) {
      rows.push({
        id: `bill-${b.id}-${y}-${m}`,
        amount: monthlyEquivalent(b),
        category_id: b.category_id,
        vendor: b.name,
        date: `${y}-${String(m).padStart(2, '0')}-01`,
        _bill: true
      });
      m++; if (m > 12) { m = 1; y++; }
    }
  });
  return rows;
}

const DOC_KINDS = [
  { v: 'receipt', t: 'Receipt' }, { v: 'invoice', t: 'Invoice' },
  { v: 'permit', t: 'Permit' },   { v: 'photo', t: 'Photo' }, { v: 'other', t: 'Other' }
];
const kindLabel = v => (DOC_KINDS.find(k => k.v === v) || { t: 'Other' }).t;
const safeName = n => String(n || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
const PAYMENT_METHODS = ['cash', 'check', 'debit', 'credit', 'ACH', 'financed'];

/* ─────────────────────────── UI atoms ─────────────────────────── */

function Modal({ title, subtitle, onClose, children, wide }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto"
         style={{ background: 'rgba(12,26,45,.55)' }} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={'bg-white w-full rounded-3xl lift fade-in my-auto ' + (wide ? 'max-w-3xl' : 'max-w-2xl')}
           role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex items-start justify-between gap-4 px-5 sm:px-8 pt-6 pb-4 border-b border-line">
          <div className="min-w-0">
            <h2 className="text-2xl sm:text-3xl font-black text-navy leading-tight break-words">{title}</h2>
            {subtitle && <p className="text-sm text-muted font-semibold mt-1 break-words">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Close"
                  className="shrink-0 w-11 h-11 rounded-full bg-shell text-navy text-2xl font-black leading-none hover:bg-line">×</button>
        </div>
        <div className="px-5 sm:px-8 py-6">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, hint, prefix, value, onChange, type = 'text', placeholder, autoFocus, big, inputMode }) {
  return (
    <label className="block">
      <span className={'block font-black uppercase tracking-[.09em] text-muted mb-2 ' + (big ? 'text-sm' : 'text-[11px]')}>{label}</span>
      <div className="relative">
        {prefix && <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-black text-muted pointer-events-none">{prefix}</span>}
        <input type={type} value={value} autoFocus={autoFocus} placeholder={placeholder}
          inputMode={inputMode || (type === 'number' ? 'decimal' : undefined)}
          onChange={e => onChange(e.target.value)}
          className={'w-full rounded-2xl border-2 border-line bg-white font-bold text-ink transition '
            + (big ? 'py-5 text-2xl ' : 'py-3.5 text-lg ') + (prefix ? 'pl-9 pr-4' : 'px-4')} />
      </div>
      {hint && <span className="block text-xs text-muted font-semibold mt-1.5">{hint}</span>}
    </label>
  );
}

function Select({ label, value, onChange, options, hint }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-black uppercase tracking-[.09em] text-muted mb-2">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)}
              className="w-full rounded-2xl border-2 border-line bg-white px-4 py-3.5 text-lg font-bold text-ink">
        {options.map(o => <option key={o.v} value={o.v}>{o.t}</option>)}
      </select>
      {hint && <span className="block text-xs text-muted font-semibold mt-1.5">{hint}</span>}
    </label>
  );
}

function Btn({ children, onClick, tone = 'navy', size = 'md', className = '', type = 'button', disabled }) {
  const tones = {
    navy: 'bg-navy text-white hover:bg-navyDeep', green: 'bg-money text-white hover:brightness-110',
    orange: 'bg-orange text-navyDeep hover:brightness-105', ghost: 'bg-shell text-navy hover:bg-line',
    white: 'bg-white text-navy hover:bg-shell', danger: 'bg-white text-danger hover:bg-shell'
  };
  const sizes = {
    sm: 'px-3.5 py-2 text-sm rounded-xl', md: 'px-5 py-3 text-base rounded-2xl',
    lg: 'px-6 py-4 text-lg rounded-2xl', xl: 'px-8 py-5 text-xl rounded-2xl'
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`font-black transition card-shadow disabled:opacity-40 disabled:cursor-not-allowed ${tones[tone]} ${sizes[size]} ${className}`}>
      {children}
    </button>
  );
}

function Tile({ label, value, sub, color }) {
  return (
    <div className="bg-white rounded-2xl card-shadow px-5 py-5">
      <div className="text-[11px] font-black uppercase tracking-[.08em] text-muted">{label}</div>
      <div className="figure text-3xl sm:text-4xl font-black mt-1.5 leading-none" style={{ color: color || '#102D7F' }}>{value}</div>
      {sub && <div className="text-xs font-bold text-muted mt-2">{sub}</div>}
    </div>
  );
}

function Mini({ label, value, color, note }) {
  return (
    <div className="px-4 py-4 text-center">
      <div className="text-[10px] font-black uppercase tracking-[.08em] text-muted">{label}</div>
      <div className="figure text-2xl font-black mt-1" style={{ color: color || '#102D7F' }}>{value}</div>
      {note && <div className="text-[11px] font-black mt-0.5" style={{ color }}>{note}</div>}
    </div>
  );
}

function Banner({ tone = 'warn', children, onDismiss }) {
  const map = {
    warn:  { bg: '#FFF8E6', bd: '#F0DCA0', fg: '#6B5200' },
    error: { bg: '#FDECEA', bd: '#F3C0BA', fg: '#8A1F14' },
    info:  { bg: '#EAF0FB', bd: '#C3D2EE', fg: '#102D7F' },
    good:  { bg: '#E9F6EF', bd: '#B6DFC9', fg: '#0B5E39' }
  }[tone];
  return (
    <div className="rounded-2xl px-5 py-4 font-bold text-sm flex items-start gap-3"
         style={{ background: map.bg, border: `1px solid ${map.bd}`, color: map.fg }}>
      <div className="min-w-0 flex-1">{children}</div>
      {onDismiss && <button onClick={onDismiss} aria-label="Dismiss"
        className="shrink-0 font-black text-lg leading-none opacity-60 hover:opacity-100">×</button>}
    </div>
  );
}

/* The headline tiles. Filled surfaces, so the governing checks are
   text-on-fill contrast (all ≥ 4.5:1) and mutual separation (worst all-pairs
   CVD ΔE 13.5, normal 27.4). Each also carries an icon and its own words, so
   identity is never colour alone. */
function BigCard({ bg, ink, icon, label, value, sub, foot }) {
  const empty = value === 'Not yet';
  return (
    <div className="rounded-3xl p-5 sm:p-7 lift flex flex-col justify-between min-h-[180px]" style={{ background: bg, color: ink }}>
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm sm:text-base font-black uppercase tracking-[.06em] leading-tight" style={{ opacity: .92 }}>{label}</span>
        <span className="text-2xl sm:text-3xl leading-none shrink-0" aria-hidden="true">{icon}</span>
      </div>
      <div className="figure font-black leading-[0.95] mt-4"
           style={{ fontSize: empty ? 'clamp(1.4rem,3vw,1.9rem)' : 'clamp(2.2rem, 6vw, 3.4rem)', opacity: empty ? .6 : 1 }}>
        {empty ? 'Nothing yet' : value}
      </div>
      {sub && <div className="text-sm font-bold mt-2 leading-snug" style={{ opacity: .88 }}>{sub}</div>}
      {foot && <div className="text-[11px] font-bold mt-2 leading-snug" style={{ opacity: .72 }}>{foot}</div>}
    </div>
  );
}

/* ─────────────────────── money split (stacked) ───────────────────────
   Part-to-whole: 2px surface gap between fills, 4px rounded outer ends,
   legend always present, values direct-laballed so nothing is hover-only. */
function MoneySplit({ pl }) {
  const total = Math.max(pl.revenue, 1);
  const seg = [
    { label: 'Job costs',  value: pl.jobCosts,  color: '#5A6B7F' },
    { label: 'Overhead',   value: pl.operating, color: '#8494A8' },
    { label: 'Below line', value: pl.belowLine + pl.depreciation + pl.draws + pl.tax, color: '#B9C4D0' },
    { label: 'Net profit', value: Math.max(pl.netProfit, 0), color: '#17976B' }
  ].filter(s => s.value > 0);

  return (
    <section className="bg-white rounded-3xl card-shadow p-5 sm:p-7">
      <h3 className="text-xl font-black text-navy">Where every dollar went</h3>
      <p className="text-sm text-muted font-semibold mt-1">Out of {moneyExact(pl.revenue)} collected.</p>
      {pl.revenue > 0 ? (
        <>
          <div className="flex gap-[2px] mt-6 h-11 w-full" role="img"
               aria-label={seg.map(s => `${s.label} ${moneyExact(s.value)}`).join(', ')}>
            {seg.map((s, i) => {
              const w = (s.value / total) * 100;
              return (
                <div key={s.label} style={{ width: w + '%', background: s.color }}
                     className={'flex items-center px-2 min-w-[3px] ' +
                       (i === 0 ? 'rounded-l-[4px] ' : '') + (i === seg.length - 1 ? 'rounded-r-[4px]' : '')}>
                  {w >= 22 && <span className="text-white text-xs sm:text-sm font-black whitespace-nowrap">{moneyExact(s.value)}</span>}
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4">
            {seg.map(s => (
              <span key={s.label} className="flex items-center gap-2 text-sm font-bold text-ink">
                <i className="w-3.5 h-3.5 rounded-[3px] inline-block shrink-0" style={{ background: s.color }} />
                {s.label} <b className="tnum text-muted">{moneyExact(s.value)}</b>
              </span>
            ))}
          </div>
        </>
      ) : <p className="mt-6 text-muted font-bold">Log some money in and this bar fills up.</p>}
    </section>
  );
}
