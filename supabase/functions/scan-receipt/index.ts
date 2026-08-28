// PROFIT BOARD — scan-receipt Edge Function
// Reads a receipt/invoice photo with Claude vision and returns structured JSON.
// The Anthropic key lives in a Supabase secret, never in the browser.
//
// Deploy (either way):
//   A) Dashboard → Edge Functions → Deploy new function → name: scan-receipt →
//      paste this file → Deploy. Then: Edge Functions → scan-receipt →
//      Secrets → add ANTHROPIC_API_KEY.
//   B) CLI: supabase functions deploy scan-receipt --project-ref qtgvmsepymifpoamndoo
//      supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// The app calls this automatically when it exists; until then it falls back
// to on-device OCR, so deploying is an upgrade, not a requirement.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const MODEL = "claude-haiku-4-5-20251001"; // fast + cheap; extraction, not prose

Deno.serve(async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY secret is not set" }),
        { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const { image_base64, media_type, categories, job_names } = await req.json();
    if (!image_base64 || !media_type) {
      return new Response(JSON.stringify({ error: "image_base64 and media_type are required" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const catList = (categories || []).map((c: { id: string; name: string }) => `${c.id}: ${c.name}`).join("\n");
    const jobList = (job_names || []).slice(0, 40).map((j: { id: string; name: string }) => `${j.id}: ${j.name}`).join("\n");

    const system = [
      "You read photos of receipts and invoices for a roofing company and return ONLY valid JSON, no prose, no markdown fences.",
      "Schema: {\"vendor\": string, \"amount\": number, \"date\": \"YYYY-MM-DD\" or null,",
      " \"suggested_category\": string or null, \"confidence\": \"high\"|\"medium\"|\"low\",",
      " \"raw_text_summary\": string, \"needs_review\": boolean, \"suggested_job\": string or null}",
      "amount is the final TOTAL actually paid (after tax), never a subtotal.",
      "suggested_category MUST be one of these category ids, or null if none fits. Never invent one:",
      catList,
      jobList ? "If an address or customer on the document clearly matches one of these open jobs, set suggested_job to that job id, else null:\n" + jobList : "suggested_job is always null.",
      "If the image is blurry, partial, or ambiguous: set needs_review true and use null/0 rather than guessing.",
    ].join("\n");

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        system,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type, data: image_base64 } },
            { type: "text", text: "Read this receipt or invoice. JSON only." },
          ],
        }],
      }),
    });

    if (!r.ok) {
      const detail = await r.text();
      return new Response(JSON.stringify({ error: "anthropic " + r.status, detail: detail.slice(0, 300) }),
        { status: 502, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const msg = await r.json();
    const text = (msg.content || []).filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text).join("").trim();

    let parsed;
    try {
      parsed = JSON.parse(text.replace(/^```json?\s*|\s*```$/g, ""));
    } catch {
      parsed = { needs_review: true, error: "model returned non-JSON", raw_text_summary: text.slice(0, 200) };
    }

    // Belt and braces: never pass through a category id that isn't real.
    const validIds = new Set((categories || []).map((c: { id: string }) => c.id));
    if (parsed.suggested_category && !validIds.has(parsed.suggested_category)) parsed.suggested_category = null;

    return new Response(JSON.stringify({ ...parsed, model: MODEL }),
      { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e).slice(0, 300) }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
