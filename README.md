# Profit Board — Square Foot Roofing

Job costing, profit, and marketing ROI in one dead-simple dashboard.
Single-file React app (no build step). Works on a phone, installs as a PWA.

---

## What's left to turn on sign-in

Two things. Takes about five minutes.

### 1. Paste your key into `config.js`

Supabase → your project → **Settings → API** → copy the **Publishable key**
(older projects call it **anon public**). Paste it here:

```js
supabaseKey: 'sb_publishable_...',   // ← in config.js, line 29
```

The Project URL is already filled in (`qtgvmsepymifpoamndoo`).

> Use the **publishable / anon** key. Never the `service_role` secret key —
> that one bypasses every security rule.

### 2. Run the database setup

Supabase → **SQL Editor** → **New query** → paste in all of
[`supabase-setup.sql`](supabase-setup.sql) → **Run**.

### 3. Make yourself the admin

Reload the app, sign in once with your email (this creates your account), then
run this one line back in the SQL Editor:

```sql
update public.profiles set role = 'admin' where email = 'reakwonjones@outlook.com';
```

Everyone who signs in after that starts as **crew**. You promote them from the
"Who can get in" panel at the bottom of the dashboard.

---

## Who sees what

| | Crew | Admin |
|---|---|---|
| Job list, mark installs done | ✅ | ✅ |
| Upload invoices & receipts | ✅ | ✅ |
| Revenue, costs, profit, margin | ❌ | ✅ |
| Marketing ROI, CPL, CAC, close rate | ❌ | ✅ |
| Add/remove people, change roles | ❌ | ✅ |

**This is enforced by the database, not by hiding buttons.** The dollar figures
live in a separate `job_money` table that the crew role has no read policy on,
so a crew member gets nothing back even if they call the API directly.

---

## Without a key

Leave `supabaseKey` blank and the app still runs — it just saves to that one
device and nothing is shared. Use the **Back up** button to export a JSON copy.
File uploads are disabled in this mode (there's nowhere to put the file).

---

## Files

| File | What it is |
|---|---|
| `index.html` | The whole app — React 18 + Tailwind, loaded from CDN, no build step |
| `config.js` | Your Supabase URL + key. The only file you edit |
| `supabase-setup.sql` | Tables, security rules, and the storage bucket |
| `service-worker.js` | Offline caching. Deliberately never caches `config.js` |
| `sfr-logo*.png`, `icon.svg` | Brand assets |

## Brand

Sampled from squarefootroofing.com — navy `#102D7F`, orange `#F6821F`, DM Sans.

The four headline cards were checked for colourblind separation and text
contrast rather than eyeballed: worst all-pairs CVD ΔE **13.5** and normal-vision
ΔE **27.4** (floors are 8 and 15), and every card's text clears 4.5:1 —
green 5.38, navy 12.33, purple 5.38, orange-on-navy 5.96.

## Run it locally

```bash
python3 -m http.server 4178 --directory profit-board
```

Then open http://localhost:4178.

> Magic-link sign-in needs the page served over `http://localhost` or a real
> https:// domain — opening `index.html` as a `file://` path won't work.
