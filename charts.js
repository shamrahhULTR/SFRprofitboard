/* ===========================================================================
   PROFIT BOARD, charts (Recharts)
   Loaded after core.js. Every chart reads live data, never hardcoded values.
   =========================================================================== */

const RC = window.Recharts || {};

/* Sequential ramp for "where the money went". Ordered categories, so one hue
   stepped light → dark rather than a rainbow; net profit is the one green
   accent so the eye lands on what's left. */
const SPEND_RAMP = ['#B9C4D0', '#8494A8', '#5A6B7F', '#3D4C5E', '#26313E'];
const NET_GREEN = '#17976B';

function ChartCard({ title, subtitle, children, note }) {
  return (
    <section className="bg-white rounded-3xl card-shadow p-5 sm:p-7">
      <h3 className="text-xl font-black text-navy">{title}</h3>
      {subtitle && <p className="text-sm text-muted font-semibold mt-1">{subtitle}</p>}
      <div className="mt-5">{children}</div>
      {note && <p className="text-xs font-bold text-muted mt-3">{note}</p>}
    </section>
  );
}

function ChartTip({ active, payload, label, total }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-white rounded-2xl px-4 py-3 border-2 border-line card-shadow">
      {label && <div className="font-black text-navy text-sm mb-1">{label}</div>}
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
                 paddingAngle={2} stroke="#FFFFFF" strokeWidth={2}>
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
            <CartesianGrid stroke="#E8EDF2" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12, fontWeight: 700, fill: '#657381' }} tickLine={false} axisLine={{ stroke: '#E8EDF2' }} />
            <YAxis tick={{ fontSize: 12, fontWeight: 700, fill: '#657381' }} tickLine={false} axisLine={false}
                   tickFormatter={v => (Math.abs(v) >= 1000 ? '$' + Math.round(v / 1000) + 'k' : '$' + v)} width={54} />
            <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(16,45,127,.05)' }} />
            <Legend wrapperStyle={{ fontSize: 12, fontWeight: 800 }} />
            <Bar dataKey="Job costs" stackId="a" fill="#5A6B7F" maxBarSize={38} />
            <Bar dataKey="Overhead"  stackId="a" fill="#8494A8" maxBarSize={38} />
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
function StockChart({ series, metric, setMetric, range, setRange, growth, setGrowth }) {
  if (!RC.AreaChart || !series.length) return null;
  const { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, defs } = RC;

  const METRICS = [
    { v: 'revenue',     t: 'Revenue',      color: '#102D7F' },
    { v: 'grossProfit', t: 'Gross profit', color: '#0E7A4A' },
    { v: 'ebitda',      t: 'EBITDA',       color: '#9333EA' },
    { v: 'netProfit',   t: 'Net profit',   color: '#B4620A' }
  ];
  const RANGES = [{ v: 3, t: '3M' }, { v: 6, t: '6M' }, { v: 12, t: '1Y' }, { v: 0, t: 'All' }];
  const mm = METRICS.find(x => x.v === metric) || METRICS[0];

  const windowed = range ? series.slice(-range) : series;
  const rate = { conservative: 0, current: growthRate(series), aggressive: growthRate(series) * 2 }[growth] || 0;

  const hist = windowed.map(m => ({ label: m.label, value: Math.round(m[metric]), projected: null }));

  // Projection to year end. Dashed, labelled, and driven by a control the user
  // can see, so it never reads as a promise.
  const monthsLeft = Math.max(12 - (new Date().getMonth() + 1), 0);
  const proj = [];
  let cur = (series[series.length - 1] || {})[metric] || 0;
  for (let i = 1; i <= monthsLeft; i++) {
    cur = cur * (1 + rate);
    const d = new Date(); d.setMonth(d.getMonth() + i);
    proj.push({ label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
                value: null, projected: Math.round(cur) });
  }
  // Join the two lines so there is no visual gap at the handover.
  if (hist.length && proj.length) hist[hist.length - 1].projected = hist[hist.length - 1].value;

  const data = [...hist, ...proj];
  const latest = (series[series.length - 1] || {})[metric] || 0;
  const first = (windowed[0] || {})[metric] || 0;
  const change = first !== 0 ? ((latest - first) / Math.abs(first)) * 100 : null;
  const up = change !== null && change >= 0;

  return (
    <section className="bg-white rounded-3xl card-shadow p-5 sm:p-7">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="text-[11px] font-black uppercase tracking-[.1em] text-muted">{mm.t}, this month</div>
          <div className="figure font-black leading-none mt-1" style={{ fontSize: 'clamp(2.2rem,6vw,3.2rem)', color: mm.color }}>
            {money(latest)}
          </div>
          {change !== null && (
            <div className="text-sm font-black mt-2" style={{ color: up ? '#0E7A4A' : '#BE2B1D' }}>
              {up ? '\u25B2' : '\u25BC'} {Math.abs(Math.round(change))}% over this window
            </div>
          )}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {RANGES.map(r => (
            <button key={r.t} onClick={() => setRange(r.v)}
              className={'px-3 py-2 rounded-xl font-black text-xs border-2 transition ' +
                (range === r.v ? 'bg-navy text-white border-navy' : 'bg-white text-navy border-line')}>{r.t}</button>
          ))}
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap mt-4">
        {METRICS.map(o => (
          <button key={o.v} onClick={() => setMetric(o.v)}
            className={'px-3.5 py-2 rounded-xl font-black text-xs border-2 transition ' +
              (metric === o.v ? 'text-white' : 'bg-white text-navy border-line')}
            style={metric === o.v ? { background: o.color, borderColor: o.color } : {}}>{o.t}</button>
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
            </defs>
            <CartesianGrid stroke="#EEF2F6" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fontWeight: 700, fill: '#657381' }}
                   tickLine={false} axisLine={false} minTickGap={18} />
            <YAxis tick={{ fontSize: 11, fontWeight: 700, fill: '#657381' }} tickLine={false} axisLine={false}
                   tickFormatter={v => (Math.abs(v) >= 1000 ? '$' + Math.round(v / 1000) + 'k' : '$' + v)} width={52} />
            <Tooltip content={<ChartTip />} />
            <ReferenceLine y={0} stroke="#DCE3EB" />
            <Area type="monotone" dataKey="value" name={mm.t} stroke={mm.color} strokeWidth={2.5}
                  fill="url(#stockFill)" dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }} connectNulls />
            <Area type="monotone" dataKey="projected" name={mm.t + ' (projected)'} stroke={mm.color} strokeWidth={2}
                  strokeDasharray="6 5" fill="none" dot={false} connectNulls />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex gap-1.5 flex-wrap mt-4 items-center">
        <span className="text-[11px] font-black uppercase tracking-[.08em] text-muted mr-1">Projection assumes</span>
        {[{ v: 'conservative', t: 'No growth' }, { v: 'current', t: 'Recent pace' }, { v: 'aggressive', t: 'Aggressive' }].map(o => (
          <button key={o.v} onClick={() => setGrowth(o.v)}
            className={'px-3 py-2 rounded-xl font-black text-xs border-2 transition ' +
              (growth === o.v ? 'bg-navy text-white border-navy' : 'bg-white text-navy border-line')}>{o.t}</button>
        ))}
        <span className="text-xs font-bold text-muted w-full mt-1">
          The dotted part is a guess based on {(rate * 100).toFixed(1)}% growth a month, not a promise.
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

  const revenue = num(job.contract_total ?? job.revenue);
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
                 paddingAngle={2} stroke="#FFFFFF" strokeWidth={2}>
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
