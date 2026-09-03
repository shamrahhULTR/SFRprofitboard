/* ===========================================================================
   PROFIT BOARD, charts (Recharts)
   Loaded after core.js. Every chart reads live data, never hardcoded values.
   =========================================================================== */

const RC = window.Recharts || {};

/* Sequential ramp for "where the money went". Ordered categories, so one hue
   stepped light → dark rather than a rainbow; net profit is the one green
   accent so the eye lands on what's left. */
const SPEND_RAMP = ['#3A4664', '#4E5E86', '#6B7EAD', '#8FA3D4', '#B4C6F0'];
const NET_GREEN = '#3DDC84';

function ChartCard({ title, subtitle, children, note }) {
  return (
    <section className="bg-panel rounded-3xl card-shadow p-5 sm:p-7">
      <h3 className="text-xl font-black text-lite">{title}</h3>
      {subtitle && <p className="text-sm text-muted font-semibold mt-1">{subtitle}</p>}
      <div className="mt-5">{children}</div>
      {note && <p className="text-xs font-bold text-muted mt-3">{note}</p>}
    </section>
  );
}

function ChartTip({ active, payload, label, total }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-panel rounded-2xl px-4 py-3 border-2 border-line card-shadow">
      {label && <div className="font-black text-lite text-sm mb-1">{label}</div>}
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2 text-sm font-bold text-ink">
          <i className="w-3 h-3 rounded-[3px] inline-block shrink-0" style={{ background: p.color || p.fill }} />
          {p.name}
          <b className="tnum ml-auto pl-3">
            {moneyExact(p.value)}
            {total > 0 ? ` · ${Math.round((p.value / total) * 100)}%` : ''}
          </b>
        </div>
      ))}
    </div>
  );
}

/* ─── Where each dollar goes ───
   Part-to-whole at a glance, ≤6 segments. Both the % and the dollar amount
   are reachable, the legend carries the numbers, so nothing is hover-only. */
function SpendPie({ pl, byCategory }) {
  if (!RC.PieChart) return null;
  const { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } = RC;

  const data = (byCategory && byCategory.length ? byCategory : [
    { name: 'Materials & job costs', value: pl.jobCosts },
    { name: 'Overhead', value: pl.operating },
    { name: 'Interest & depreciation', value: pl.belowLine + pl.depreciation },
    { name: 'Owner draws', value: pl.draws },
    { name: 'Tax set-aside', value: pl.tax }
  ]).filter(d => d.value > 0);

  const net = Math.max(pl.netProfit, 0);
  const slices = [...data, ...(net > 0 ? [{ name: 'Net profit left', value: net, net: true }] : [])];
  const total = slices.reduce((a, s) => a + s.value, 0);

  if (!total) {
    return <ChartCard title="Where every dollar goes" subtitle="Add costs and this fills in.">
      <p className="text-muted font-bold">Nothing to show yet.</p>
    </ChartCard>;
  }

  return (
    <ChartCard title="Where every dollar goes"
               subtitle={`Out of ${moneyExact(pl.revenue)} of work.`}
               note="Hover or tap a slice for the exact dollars.">
      <div style={{ width: '100%', height: 260 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={slices} dataKey="value" nameKey="name" innerRadius={58} outerRadius={104}
                 paddingAngle={2} stroke="#131B2E" strokeWidth={2}>
              {slices.map((s, i) => (
                <Cell key={s.name} fill={s.net ? NET_GREEN : SPEND_RAMP[i % SPEND_RAMP.length]} />
              ))}
            </Pie>
            <Tooltip content={<ChartTip total={total} />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="grid gap-2 mt-4">
        {slices.map((s, i) => (
          <div key={s.name} className="flex items-center gap-2 text-sm font-bold text-ink">
            <i className="w-3.5 h-3.5 rounded-[3px] inline-block shrink-0"
               style={{ background: s.net ? NET_GREEN : SPEND_RAMP[i % SPEND_RAMP.length] }} />
            <span className="min-w-0 truncate">{s.name}</span>
            <b className="tnum ml-auto pl-3 text-muted whitespace-nowrap">
              {moneyExact(s.value)} · {Math.round((s.value / total) * 100)}%
            </b>
          </div>
        ))}
      </div>
    </ChartCard>
  );
}

/* ─── Monthly: costs vs overhead vs what's left ───
   Stacked bars make cost creep visible immediately. 2px surface gap between
   segments; one axis only, never two scales. */
function MonthlyBars({ series }) {
  if (!RC.BarChart || !series.length) return null;
  const { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } = RC;
  const data = series.slice(-12).map(m => ({
    label: m.label,
    'Job costs': Math.round(m.jobCosts),
    'Overhead': Math.round(m.operating + m.belowLine + m.depreciation),
    'Net profit': Math.round(Math.max(m.netProfit, 0))
  }));

  return (
    <ChartCard title="Month by month" subtitle="Job costs, overhead, and what was left.">
      <div style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 4, right: 8, left: 4, bottom: 4 }}>
            <CartesianGrid stroke="#232D47" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12, fontWeight: 700, fill: '#8891A8' }} tickLine={false} axisLine={{ stroke: '#232D47' }} />
            <YAxis tick={{ fontSize: 12, fontWeight: 700, fill: '#8891A8' }} tickLine={false} axisLine={false}
                   tickFormatter={v => (Math.abs(v) >= 1000 ? '$' + Math.round(v / 1000) + 'k' : '$' + v)} width={54} />
            <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(255,255,255,.05)' }} />
            <Legend wrapperStyle={{ fontSize: 12, fontWeight: 800 }} formatter={v => <span style={{ color: '#8891A8' }}>{v}</span>} />
            <Bar dataKey="Job costs" stackId="a" fill="#8891A8" maxBarSize={38} />
            <Bar dataKey="Overhead"  stackId="a" fill="#5A6B8C" maxBarSize={38} />
            <Bar dataKey="Net profit" stackId="a" fill={NET_GREEN} maxBarSize={38} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

/* ─── Company value over time, read like a stock chart ───
   One headline figure, one filled line, almost no chrome. A range switcher
   picks the window; a metric switcher picks which line, so it stays one
   scale and one series rather than four fighting for attention. */
function StockChart({ series, perSeries, metric, setMetric, range, setRange, growth, setGrowth,
                      grain, setGrain, running, setRunning }) {
  if (!RC.AreaChart || !series.length) return null;
  const { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, defs } = RC;

  const METRICS = [
    { v: 'revenue',     t: 'Revenue',      color: '#8FA9FF' },
    { v: 'grossProfit', t: 'Gross profit', color: '#3DDC84' },
    { v: 'ebitda',      t: 'EBITDA',       color: '#B685FF' },
    { v: 'netProfit',   t: 'Net profit',   color: '#F5B942' }
  ];
  const RANGES = grain === 'day'
    ? [{ v: 30, t: '30D' }, { v: 90, t: '90D' }, { v: 365, t: '1Y' }, { v: 0, t: 'All' }]
    : [{ v: 3, t: '3M' }, { v: 6, t: '6M' }, { v: 12, t: '1Y' }, { v: 0, t: 'All' }];
  const mm = METRICS.find(x => x.v === metric) || METRICS[0];

  const windowed = range ? series.slice(-range) : series;

  // Pace comes from the raw per-period values, never the cumulative line.
  const per = perSeries && perSeries.length ? perSeries : series;
  const lastN = per.slice(-30);
  const recentPace = lastN.length
    ? lastN.reduce((a, m) => a + (m[metric] || 0), 0) / lastN.length
    : 0;
  const mult = { conservative: 0.5, current: 1, aggressive: 2 }[growth] || 1;
  const pace = recentPace * mult;   // average gain per period at the chosen assumption

  const hist = windowed.map(m => ({ label: m.label, value: Math.round(m[metric]), projected: null }));

  const proj = [];
  let cur = (series[series.length - 1] || {})[metric] || 0;
  const stepsLeft = grain === 'day'
    ? Math.min(Math.max(Math.round((new Date(new Date().getFullYear(), 11, 31) - new Date()) / 86400000), 0), 200)
    : Math.max(12 - (new Date().getMonth() + 1), 0);
  for (let i = 1; i <= stepsLeft; i++) {
    cur = running ? cur + pace : pace;   // running: keeps climbing; per-period: the expected value each period
    const d = new Date();
    if (grain === 'day') d.setDate(d.getDate() + i); else d.setMonth(d.getMonth() + i);
    proj.push({
      label: grain === 'day' ? dayLabel(d.toISOString().slice(0, 10))
                             : d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      value: null, projected: Math.round(cur)
    });
  }
  if (hist.length && proj.length) hist[hist.length - 1].projected = hist[hist.length - 1].value;

  const data = [...hist, ...proj];
  const latest = (series[series.length - 1] || {})[metric] || 0;
  const first = (windowed[0] || {})[metric] || 0;
  const change = first !== 0 ? ((latest - first) / Math.abs(first)) * 100 : null;
  const up = change !== null && change >= 0;

  return (
    <section className="bg-panel rounded-3xl card-shadow p-5 sm:p-7">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="text-[11px] font-black uppercase tracking-[.1em] text-muted">{mm.t}{running ? ', all time so far' : grain === 'day' ? ', latest day' : ', this month'}</div>
          <div className="figure font-black leading-none mt-1" style={{ fontSize: 'clamp(2.2rem,6vw,3.2rem)', color: mm.color }}>
            {money(latest)}
          </div>
          {change !== null && (
            <div className="text-sm font-black mt-2" style={{ color: up ? '#3DDC84' : '#FF6B6B' }}>
              {up ? '\u25B2' : '\u25BC'} {Math.abs(Math.round(change))}% over this window
            </div>
          )}
        </div>
        <div className="flex gap-1.5 flex-wrap justify-end">
          <div className="flex gap-1.5 w-full justify-end mb-1">
            {[{ v: 'day', t: 'Day by day' }, { v: 'month', t: 'Month by month' }].map(o => (
              <button key={o.v} onClick={() => { setGrain(o.v); setRange(o.v === 'day' ? 90 : 12); }}
                className={'px-3 py-2 rounded-xl font-black text-xs border-2 transition ' +
                  (grain === o.v ? 'bg-panel2 text-white border-lite' : 'bg-panel text-lite border-line')}>{o.t}</button>
            ))}
            <button onClick={() => setRunning(!running)}
              className={'px-3 py-2 rounded-xl font-black text-xs border-2 transition ' +
                (running ? 'bg-money border-money' : 'bg-panel text-lite border-line')}>
              <span style={running ? { color: '#0B1220' } : null}>{running ? 'Running total' : 'Per day'}</span>
            </button>
          </div>
          {RANGES.map(r => (
            <button key={r.t} onClick={() => setRange(r.v)}
              className={'px-3 py-2 rounded-xl font-black text-xs border-2 transition ' +
                (range === r.v ? 'bg-panel2 text-white border-lite' : 'bg-panel text-lite border-line')}>{r.t}</button>
          ))}
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap mt-4">
        {METRICS.map(o => (
          <button key={o.v} onClick={() => setMetric(o.v)}
            className={'px-3.5 py-2 rounded-xl font-black text-xs border-2 transition ' +
              (metric === o.v ? '' : 'bg-panel text-lite border-line')}
            style={metric === o.v ? { background: o.color, borderColor: o.color, color: '#0B1220' } : {}}>{o.t}</button>
        ))}
      </div>

      <div style={{ width: '100%', height: 300 }} className="mt-5">
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
            <defs>
              <linearGradient id="stockFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={mm.color} stopOpacity={0.22} />
                <stop offset="100%" stopColor={mm.color} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="projFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={mm.color} stopOpacity={0.08} />
                <stop offset="100%" stopColor={mm.color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#232D47" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fontWeight: 700, fill: '#8891A8' }}
                   tickLine={false} axisLine={false} minTickGap={grain === "day" ? 44 : 18} />
            <YAxis tick={{ fontSize: 11, fontWeight: 700, fill: '#8891A8' }} tickLine={false} axisLine={false}
                   tickFormatter={v => (Math.abs(v) >= 1000 ? '$' + Math.round(v / 1000) + 'k' : '$' + v)} width={52} />
            <Tooltip content={<ChartTip />} />
            <ReferenceLine y={0} stroke="#2A3550" />
            <Area type="monotone" dataKey="value" name={mm.t} stroke={mm.color} strokeWidth={2.5}
                  fill="url(#stockFill)" dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: '#131B2E' }} connectNulls />
            <Area type="monotone" dataKey="projected" name={mm.t + ' (projected)'} stroke={mm.color} strokeWidth={2}
                  strokeDasharray="6 5" strokeOpacity={0.55} fill="url(#projFill)" dot={false} connectNulls />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex gap-1.5 flex-wrap mt-4 items-center">
        <span className="text-[11px] font-black uppercase tracking-[.08em] text-muted mr-1">Projection assumes</span>
        {[{ v: 'conservative', t: 'Half pace' }, { v: 'current', t: 'Recent pace' }, { v: 'aggressive', t: 'Aggressive' }].map(o => (
          <button key={o.v} onClick={() => setGrowth(o.v)}
            className={'px-3 py-2 rounded-xl font-black text-xs border-2 transition ' +
              (growth === o.v ? 'bg-panel2 text-white border-lite' : 'bg-panel text-lite border-line')}>{o.t}</button>
        ))}
        <span className="text-xs font-bold text-muted w-full mt-1">
          The lighter dotted line is a guess: it assumes about {money(pace)} of {mm.t.toLowerCase()} per {grain === 'day' ? 'day' : 'month'}, based on your recent pace. Not a promise.
        </span>
      </div>
    </section>
  );
}

// Trailing 3-month average month-over-month growth in revenue.
function growthRate(series) {
  const s = series.filter(m => m.revenue > 0).slice(-4);
  if (s.length < 2) return 0;
  let sum = 0, n = 0;
  for (let i = 1; i < s.length; i++) {
    if (s[i - 1].revenue > 0) { sum += (s[i].revenue - s[i - 1].revenue) / s[i - 1].revenue; n++; }
  }
  const r = n ? sum / n : 0;
  return Math.max(Math.min(r, 0.5), -0.5);   // keep the projection sane
}

/* ─── Where every dollar of ONE job goes ───
   Same part-to-whole rules as the company pie, but scoped to a single job and
   with company overhead shared in by that job's revenue share, so "what did we
   actually keep on this roof" is an honest number rather than gross profit. */
function JobDollarPie({ job, expenses, categories, pl, jobs }) {
  if (!RC.PieChart) return null;
  const { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } = RC;

  const revenue = jobRevenue(job);
  const mine = expenses.filter(e => e.job_id === job.id);

  const sumOf = names => mine
    .filter(e => names.some(n => (bucketOf(e, categories).name || '').toLowerCase().includes(n)))
    .reduce((a, e) => a + num(e.amount), 0);

  const materials = sumOf(['material', 'shingle', 'underlayment', 'flashing', 'decking', 'vent', 'ridge', 'gutter', 'skylight']);
  const labour    = sumOf(['labor', 'labour', 'sub']);
  const disposal  = sumOf(['dumpster', 'disposal']);
  const permits   = sumOf(['permit']);
  const otherJob  = mine.filter(e => bucketOf(e, categories).bucket === 'job_cost')
                        .reduce((a, e) => a + num(e.amount), 0) - materials - labour - disposal - permits;

  // Overhead is shared out by this job's share of all revenue.
  const share = pl.revenue > 0 ? revenue / pl.revenue : 0;
  const allocatedOverhead = pl.operating * share;

  const spent = materials + labour + disposal + permits + Math.max(otherJob, 0) + allocatedOverhead;
  const left = revenue - spent;

  const slices = [
    { name: 'Materials', value: materials },
    { name: 'Labour and subs', value: labour },
    { name: 'Dumpster and disposal', value: disposal },
    { name: 'Permits', value: permits },
    { name: 'Other job costs', value: Math.max(otherJob, 0) },
    { name: 'Share of overhead', value: allocatedOverhead },
    { name: 'Net profit left', value: Math.max(left, 0), net: true }
  ].filter(s => s.value > 0.5);

  const total = slices.reduce((a, s) => a + s.value, 0);

  if (!revenue || !total) {
    return <ChartCard title="Where this job's money went" subtitle={job.name}>
      <p className="text-muted font-bold">Add a contract total and some costs to this job first.</p>
    </ChartCard>;
  }

  return (
    <ChartCard title="Where this job's money went"
               subtitle={`${job.name}, out of ${moneyExact(revenue)}`}
               note={left < 0 ? 'This job spent more than it brought in.' : 'Overhead is shared in by this job’s share of revenue.'}>
      <div style={{ width: '100%', height: 260 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={slices} dataKey="value" nameKey="name" innerRadius={58} outerRadius={104}
                 paddingAngle={2} stroke="#131B2E" strokeWidth={2}>
              {slices.map((s, i) => <Cell key={s.name} fill={s.net ? NET_GREEN : SPEND_RAMP[i % SPEND_RAMP.length]} />)}
            </Pie>
            <Tooltip content={<ChartTip total={total} />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="grid gap-2 mt-4">
        {slices.map((s, i) => (
          <div key={s.name} className="flex items-center gap-2 text-sm font-bold text-ink">
            <i className="w-3.5 h-3.5 rounded-[3px] inline-block shrink-0"
               style={{ background: s.net ? NET_GREEN : SPEND_RAMP[i % SPEND_RAMP.length] }} />
            <span className="min-w-0 truncate">{s.name}</span>
            <b className="tnum ml-auto pl-3 text-muted whitespace-nowrap">
              {moneyExact(s.value)} · {Math.round((s.value / total) * 100)}%
            </b>
          </div>
        ))}
      </div>
    </ChartCard>
  );
}

/* ─── Owner pay over time ───
   The number the owners actually care about, on its own chart so it isn't
   fighting revenue for the axis. Same visual language as the stock chart:
   one solid line for what happened, a lighter dashed one for the projection,
   with the assumption stated in dollars underneath. */
function OwnerPayChart({ series, running, setRunning, grain, setGrain, pace, setPace }) {
  if (!RC.AreaChart || !series.length) return null;
  const { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } = RC;

  const ORANGE = '#FF6B1A';
  const last = series[series.length - 1] || {};

  // Pace from the raw per-period values, never the cumulative line.
  const perPeriod = running
    ? series.map((p, i) => ({ ...p, ownerPool: p.ownerPool - (i ? series[i - 1].ownerPool : 0) }))
    : series;
  const lastN = perPeriod.slice(-30);
  const avg = lastN.length ? lastN.reduce((a, p) => a + p.ownerPool, 0) / lastN.length : 0;
  const mult = pace === 'half' ? 0.5 : pace === 'aggressive' ? 1.5 : 1;
  const step = avg * mult;

  const hist = series.map(p => ({ label: p.label, value: Math.round(p.ownerPool), projected: null }));
  const proj = [];
  let cur = last.ownerPool || 0;
  const end = new Date(new Date().getFullYear(), 11, 31);
  const spanDays = Math.max(Math.round((end - new Date()) / 86400000), 0);
  const steps = grain === 'day' ? Math.min(spanDays, 180) : Math.max(12 - (new Date().getMonth() + 1), 0);
  for (let i = 1; i <= steps; i++) {
    cur = running ? cur + step : step;
    const d = new Date();
    if (grain === 'day') d.setDate(d.getDate() + i); else d.setMonth(d.getMonth() + i);
    proj.push({
      label: grain === 'day' ? dayLabel(d.toISOString().slice(0, 10))
                             : d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      value: null, projected: Math.round(cur)
    });
  }
  if (hist.length) hist[hist.length - 1].projected = hist[hist.length - 1].value;
  const data = [...hist, ...proj];

  return (
    <section className="bg-panel rounded-3xl card-shadow p-5 sm:p-7">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[.1em] text-muted">
            Owners' pay{running ? ', all time so far' : grain === 'day' ? ', latest day' : ', this month'}
          </div>
          <div className="figure font-black mt-1" style={{ fontSize: 'clamp(2rem,5vw,3rem)', color: ORANGE }}>
            {money(last.ownerPool || 0)}
          </div>
          <div className="text-xs font-bold text-muted mt-1">
            After the company's 20%{last.companyCut ? ` · company kept ${money(last.companyCut)}` : ''}
          </div>
        </div>
        <div className="flex gap-1.5 flex-wrap justify-end">
          {[{ v: 'day', t: 'Day by day' }, { v: 'month', t: 'Month by month' }].map(o => (
            <button key={o.v} onClick={() => setGrain(o.v)}
              className={'px-3 py-2 rounded-xl font-black text-xs border-2 transition ' +
                (grain === o.v ? 'bg-panel2 text-white border-lite' : 'bg-panel text-lite border-line')}>{o.t}</button>
          ))}
          <button onClick={() => setRunning(!running)}
            className={'px-3 py-2 rounded-xl font-black text-xs border-2 transition ' +
              (running ? 'text-white' : 'bg-panel text-lite border-line')}
            style={running ? { background: ORANGE, borderColor: ORANGE } : {}}>
            {running ? 'Running total' : 'Per period'}
          </button>
        </div>
      </div>

      <div style={{ width: '100%', height: 300 }} className="mt-5">
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
            <defs>
              <linearGradient id="ownerFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ORANGE} stopOpacity={0.28} />
                <stop offset="100%" stopColor={ORANGE} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#232D47" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fontWeight: 700, fill: '#8891A8' }}
                   tickLine={false} axisLine={{ stroke: '#232D47' }} minTickGap={grain === 'day' ? 44 : 18} />
            <YAxis tick={{ fontSize: 11, fontWeight: 700, fill: '#8891A8' }} tickLine={false} axisLine={false}
                   tickFormatter={v => (Math.abs(v) >= 1000 ? '$' + Math.round(v / 1000) + 'k' : '$' + v)} width={54} />
            <ReferenceLine y={0} stroke="#2A3550" />
            <Tooltip content={<ChartTip />} />
            <Area type="monotone" dataKey="value" name="Owners' pay" stroke={ORANGE} strokeWidth={2}
                  fill="url(#ownerFill)" dot={false} connectNulls />
            <Area type="monotone" dataKey="projected" name="Projected" stroke={ORANGE} strokeWidth={2}
                  strokeDasharray="6 5" strokeOpacity={0.55} fill="url(#ownerFill)" fillOpacity={0.25}
                  dot={false} connectNulls />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center gap-2 flex-wrap mt-4">
        <span className="text-[11px] font-black uppercase tracking-[.1em] text-muted">Projection assumes</span>
        {[{ v: 'half', t: 'Half pace' }, { v: 'recent', t: 'Recent pace' }, { v: 'aggressive', t: 'Aggressive' }].map(o => (
          <button key={o.v} onClick={() => setPace(o.v)}
            className={'px-3 py-2 rounded-xl font-black text-xs border-2 transition ' +
              (pace === o.v ? 'bg-panel2 text-white border-lite' : 'bg-panel text-lite border-line')}>{o.t}</button>
        ))}
      </div>
      <p className="text-xs font-bold text-muted mt-3">
        The dotted line is a guess: about {moneyExact(step)} of owner pay per {grain === 'day' ? 'day' : 'month'},
        based on your recent pace. Not a promise.
      </p>
    </section>
  );
}
