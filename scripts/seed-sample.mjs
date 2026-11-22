import { randomUUID } from "node:crypto";

const origin = process.env.FOLD_SEED_ORIGIN;
const email = process.env.FOLD_SEED_EMAIL;
const password = process.env.FOLD_SEED_PASSWORD;
if (!origin || !email || !password) throw new Error("Set FOLD_SEED_ORIGIN, FOLD_SEED_EMAIL and FOLD_SEED_PASSWORD for an existing registered owner. No account is created or auth bypassed.");
const url = new URL(origin);
if (url.protocol !== "https:" && !["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error("Use HTTPS except for local development.");
let cookie = "";
async function request(path, method = "GET", body) {
  const response = await fetch(new URL(path, url.origin), { method, headers: { "Content-Type": "application/json", Origin: url.origin, ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), redirect: "error" });
  const data = await response.json();
  if (!response.ok) throw new Error(`${path}: ${response.status} ${data.error || data.message || "Request failed"}`);
  if (path === "/api/auth/sign-in/email") cookie = response.headers.getSetCookie().map((item) => item.split(";")[0]).join("; ");
  return data;
}
try {
  await request("/api/auth/sign-in/email", "POST", { email, password });
  const marker = "a6e4bb3d-cb5d-4a6d-bbda-92403facf801";
  const forms = await request("/api/forms");
  let form = forms.find((form) => form.draft.blocks?.some((block) => block.id === marker));
  if (!form) {
    form = await request("/api/forms", "POST", {});
    const draft = { title: "Customer feedback — synthetic sample", description: "A demonstration form with fictional responses. Please do not enter sensitive information.", confirmation: "Thanks for helping us improve this sample experience!", blocks: [
      { id: marker, type: "short_text", label: "What worked well?", required: true },
      { id: "a6e4bb3d-cb5d-4a6d-bbda-92403facf802", type: "rating", label: "How was your experience?", required: true, min: 1, max: 5 },
      { id: "a6e4bb3d-cb5d-4a6d-bbda-92403facf803", type: "multi_choice", label: "What should we focus on?", required: false, options: ["Clarity", "Speed", "Support"] },
      { id: "a6e4bb3d-cb5d-4a6d-bbda-92403facf804", type: "long_text", label: "Anything else?", required: false },
    ] };
    form = await request(`/api/forms/${form.id}`, "PATCH", draft);
    form = await request(`/api/forms/${form.id}/publish`, "POST", {});
    await request(`/api/public/forms/${form.id}`, "POST", { answers: { [marker]: "Synthetic example: clear instructions", [draft.blocks[1].id]: 5, [draft.blocks[2].id]: ["Speed"], [draft.blocks[3].id]: "Fictional feedback only — no real customer data." } });
  } else {
    console.log("Sample already exists; existing edits, publication state and responses preserved.");
  }
  console.log(JSON.stringify({ formId: form.id, publicUrl: `${url.origin}/f/${form.id}`, published: form.isPublished, archived: form.archived, runId: randomUUID() }));
} finally {
  if (cookie) await request("/api/auth/sign-out", "POST", {}).catch(() => {});
}
