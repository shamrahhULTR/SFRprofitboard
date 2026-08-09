/* ===========================================================================
   PROFIT BOARD — connection settings
   ---------------------------------------------------------------------------
   Leave these blank and the app works on this one device only (nothing shared).

   To let your partners sign in and share the same jobs:
     1. Go to supabase.com, sign in, create a project (the free plan is fine).
     2. In that project open  Settings → API.
     3. Copy "Project URL"        → paste between the quotes on supabaseUrl.
     4. Copy the "publishable" /
        "anon public" key         → paste between the quotes on supabaseKey.
     5. Open the SQL Editor, paste in everything from supabase-setup.sql, Run.
     6. Reload this app, sign in with your email, then run the last line of
        supabase-setup.sql to make yourself the admin.

   The publishable key is meant to be public — it is safe in this file. It only
   grants what the database's security rules allow. Never paste the
   "service_role" / secret key here.
   =========================================================================== */

window.SFR_CONFIG = {
  // Your project (ref qtgvmsepymifpoamndoo) — already filled in.
  supabaseUrl: 'https://qtgvmsepymifpoamndoo.supabase.co',

  // ⬇️  PASTE YOUR KEY BETWEEN THESE QUOTES  ⬇️
  // Supabase → Settings → API → "Publishable key" (or "anon public").
  // It starts with  sb_publishable_...  or  eyJ...
  // NOT the "service_role" / secret key — that one must never go in this file.
  supabaseKey: 'sb_publishable_94Qe_ln979Gd16M3iJfxYA_LF8gtAkZ',

  // Shown on the sign-in screen so people know they're in the right place.
  companyName: 'Square Foot Roofing'
};
