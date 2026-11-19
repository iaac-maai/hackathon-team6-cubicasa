// The API of the app. It runs on Cloudflare Workers for every /api/... request; every other path is the React page.
// Two locks, in this order: the team password of Wednesday, then a user account (Better Auth, worker/auth.ts).
// Every search belongs to the account that made it, and every query below is filtered by that user id.
import { makeAuth, type AuthEnv } from "./auth";

interface Env extends AuthEnv {
  DB: D1Database;
  BUCKET: R2Bucket;
  ASSETS: Fetcher;
  APP_PASSWORD: string;
  MODEL_URL: string;
  MODEL_API_NAME: string;
  EXPLAIN_API_NAME: string;
}

// The versions of the model the user can choose; the server on Render knows the same names
const MODELS = ["v1", "v2", "v3"];
// The version of the terms and privacy policy a user accepts at sign-up (src/legal.tsx shows the same date)
const TERMS_VERSION = "2026-11-19";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (path === "/api/login" && method === "POST") return login(request, env);
    if (path === "/api/logout" && method === "POST") return logout();

    // Lock 1, the team password: everything below needs its cookie
    if (!(await loggedIn(request, env))) return Response.json({ error: "Not logged in", need: "password" }, { status: 401 });

    if (path.startsWith("/data/")) return env.ASSETS.fetch(request); // the map data: no personal data in it

    // Lock 2, the user account: sign up, sign in, Google and sign out are Better Auth's own routes
    const auth = makeAuth(env, url.origin);
    if (path.startsWith("/api/auth/")) return auth.handler(request);
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return Response.json({ error: "Sign in to your account.", need: "account", google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) }, { status: 401 });
    }
    const user = session.user;
    const termsAccepted = await accepted(env, user.id);

    if (path === "/api/session") {
      return Response.json({ user: { name: user.name, email: user.email, image: user.image ?? null }, termsAccepted, termsVersion: TERMS_VERSION });
    }
    if (path === "/api/terms/accept" && method === "POST") return accept(env, user.id);
    if (path === "/api/account/delete" && method === "POST") return deleteAccount(env, user.id);
    if (!termsAccepted) return Response.json({ error: "Accept the terms first.", need: "terms" }, { status: 403 });

    if (path === "/api/wake") return wake(env);
    if (path === "/api/search" && method === "POST") return search(request, env, user.id);
    if (path === "/api/history") return history(env, user.id);

    const image = path.match(/^\/api\/images\/([\w-]+)$/);
    if (image) return uploadedImage(image[1], env, user.id);
    const explained = path.match(/^\/api\/searches\/([\w-]+)\/explain$/);
    if (explained) return explain(explained[1], env, user.id);
    const earlierOnes = path.match(/^\/api\/searches\/([\w-]+)\/earlier$/);
    if (earlierOnes) return earlier(earlierOnes[1], env, user.id);
    const saved = path.match(/^\/api\/searches\/([\w-]+)$/);
    if (saved) return savedSearch(saved[1], env, user.id);

    return Response.json({ error: "No such endpoint." }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;

// ---- Log in and out ----------------------------------------------------------

// The cookie stores a hash of the password, never the password itself
async function authToken(password: string) {
  const bytes = new TextEncoder().encode(`hackathon:${password}`);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function loggedIn(request: Request, env: Env) {
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/(?:^|;\s*)auth=([a-f0-9]+)/)?.[1];
  return Boolean(env.APP_PASSWORD && token && token === (await authToken(env.APP_PASSWORD)));
}

// POST /api/login with a form field "password": sets the login cookie
async function login(request: Request, env: Env) {
  const form = await request.formData();
  const password = String(form.get("password") || "");
  if (!env.APP_PASSWORD || password !== env.APP_PASSWORD) {
    return Response.json({ error: "Wrong password. Try again." }, { status: 401 });
  }
  // Secure: only sent over https (always online; locally the app runs on http://localhost)
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return Response.json({ ok: true }, {
    headers: {
      // HttpOnly: page scripts can't read it; SameSite=Lax: other sites can't use it, but it comes back
      // with the redirect from Google's sign-in page (Strict would lock that redirect out); 7 days
      "Set-Cookie": `auth=${await authToken(env.APP_PASSWORD)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secure}`,
    },
  });
}

function logout() {
  return Response.json({ ok: true }, { headers: { "Set-Cookie": "auth=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" } });
}

// ---- Terms and the account ----------------------------------------------------------

async function accepted(env: Env, userId: string) {
  const row = await env.DB.prepare('SELECT 1 AS yes FROM consent WHERE "userId" = ? AND "termsVersion" = ?').bind(userId, TERMS_VERSION).first();
  return Boolean(row);
}

// POST /api/terms/accept: the user ticked "I agree" in the terms window; we keep which version and when
async function accept(env: Env, userId: string) {
  await env.DB.prepare('INSERT OR IGNORE INTO consent ("userId", "termsVersion", "acceptedAt") VALUES (?, ?, ?)')
    .bind(userId, TERMS_VERSION, new Date().toISOString())
    .run();
  return Response.json({ ok: true, termsVersion: TERMS_VERSION });
}

// POST /api/account/delete: deletes everything of this user, as the privacy policy promises:
// the uploaded plans and answers in R2, the searches in D1, the sessions, the Google link and the account
async function deleteAccount(env: Env, userId: string) {
  const { results } = await env.DB.prepare("SELECT id FROM searches WHERE user_id = ?").bind(userId).all<{ id: string }>();
  const keys = results.flatMap(({ id }) => [`uploads/${id}`, `results/${id}.json`, `explain/${id}.json`]);
  for (let i = 0; i < keys.length; i += 1000) await env.BUCKET.delete(keys.slice(i, i + 1000));
  await env.DB.batch([
    env.DB.prepare("DELETE FROM searches WHERE user_id = ?").bind(userId),
    env.DB.prepare('DELETE FROM consent WHERE "userId" = ?').bind(userId),
    env.DB.prepare('DELETE FROM session WHERE "userId" = ?').bind(userId),
    env.DB.prepare('DELETE FROM account WHERE "userId" = ?').bind(userId),
    env.DB.prepare('DELETE FROM "user" WHERE id = ?').bind(userId),
  ]);
  const headers = new Headers();
  for (const name of ["better-auth.session_token", "__Secure-better-auth.session_token"]) {
    headers.append("Set-Cookie", `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  }
  return Response.json({ deleted: { searches: results.length, files: keys.length } }, { headers });
}

// ---- The model server ----------------------------------------------------------

// GET /api/wake: pokes the model server so a sleeping Render server starts waking up as soon as the page opens
async function wake(env: Env) {
  try {
    const response = await fetchWithTimeout(`${env.MODEL_URL}/`, {}, 8000);
    return Response.json({ awake: response.ok });
  } catch {
    return Response.json({ awake: false }); // still starting: the next search will wait for it
  }
}

class ModelError extends Error {
  constructor(message: string, readonly waking: boolean) {
    super(message);
  }
}

// Gradio's HTTP API has two steps: start a job, then read its result
async function callModel(env: Env, apiName: string, data: unknown[]) {
  const base = `${env.MODEL_URL}/gradio_api/call/${apiName}`;
  let started: Response;
  try {
    started = await fetchWithTimeout(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data }),
    });
  } catch (err) {
    throw new ModelError(String(err), true); // no answer at all: the free server is asleep or starting
  }
  // 404: the server is awake but has no such endpoint (an older deploy); 5xx: Render is still starting it
  if (!started.ok) throw new ModelError(`Model server answered ${started.status} for ${apiName}`, started.status >= 500);
  const { event_id } = (await started.json()) as { event_id: string };

  const text = await (await fetchWithTimeout(`${base}/${event_id}`)).text(); // "event: complete\ndata: [ {...} ]"
  const complete = text.split("event: complete")[1];
  if (!complete) throw new ModelError(`No result from the model server: ${text.slice(0, 200)}`, false);
  return JSON.parse(complete.split("data:")[1].trim())[0];
}

function modelFailed(err: unknown) {
  if (err instanceof ModelError && !err.waking) {
    const error = err.message.includes("answered 404")
      ? "The model server runs an older version without this endpoint."
      : "The model server could not answer this request.";
    return Response.json({ error, detail: err.message }, { status: 502 });
  }
  // "waking: true" tells the page to say so and to try again by itself
  return Response.json({ waking: true, error: "The model is waking up, about one minute.", detail: String(err) }, { status: 503 });
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, ms = 90000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

// ---- Search ----------------------------------------------------------------------

// POST /api/search with a form field "plan" (an image file) and "model" (v1, v2 or v3):
// 1. send it to our model server, 2. store the plan and the full answer in R2, 3. store one row in D1, 4. answer the page
async function search(request: Request, env: Env, userId: string) {
  const form = await request.formData();
  const file = form.get("plan");
  if (!file || typeof file === "string") {
    return Response.json({ error: "Send a floor-plan image in the field 'plan'." }, { status: 400 });
  }
  if (!(file.type || "").startsWith("image/")) {
    return Response.json({ error: "Send an image (PNG or JPEG)." }, { status: 415 });
  }
  if (file.size > 5 * 1024 * 1024) {
    return Response.json({ error: "Image too large (max 5 MB)." }, { status: 413 });
  }
  const model = String(form.get("model") || "v3");
  if (!MODELS.includes(model)) {
    return Response.json({ error: `Unknown model: choose one of ${MODELS.join(", ")}.` }, { status: 400 });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());

  let result;
  try {
    result = await callModel(env, env.MODEL_API_NAME, [toBase64(bytes), model]);
  } catch (err) {
    return modelFailed(err);
  }
  if (!Array.isArray(result.matches) || result.matches.length === 0) {
    return Response.json({ error: "The model server answered without matches." }, { status: 502 });
  }

  const id = crypto.randomUUID();
  const imageKey = `uploads/${id}`;
  const resultKey = `results/${id}.json`;
  await env.BUCKET.put(imageKey, bytes, { httpMetadata: { contentType: file.type } });
  await env.BUCKET.put(resultKey, JSON.stringify(result), { httpMetadata: { contentType: "application/json" } });

  // The "?" placeholders keep user input out of the SQL text
  const createdAt = new Date().toISOString();
  const best = result.matches[0];
  const [atlasX, atlasY] = result.atlas_xy || [null, null]; // v1 has no atlas on the server: both stay empty
  await env.DB.prepare(
    `INSERT INTO searches (id, created_at, file_name, image_key, result_key, best_id, best_distance, match_ids, atlas_x, atlas_y, model, user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, createdAt, file.name || null, imageKey, resultKey, best.id, best.distance,
      JSON.stringify(result.matches.map((m: { id: string }) => m.id)), atlasX, atlasY, model, userId)
    .run();

  return Response.json({ id, created_at: createdAt, file_name: file.name || null, model, ...result });
}

// GET /api/searches/<id>/explain: what the network computed for this search's plan.
// Asked once from the model server, then kept in R2, so a past search opens even while the server sleeps.
async function explain(id: string, env: Env, userId: string) {
  const row = await env.DB.prepare("SELECT image_key, model, embedding FROM searches WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .first<{ image_key: string; model: string | null; embedding: string | null }>();
  if (!row) return Response.json({ error: "No such search." }, { status: 404 });

  const key = `explain/${id}.json`;
  const cached = await env.BUCKET.get(key);
  if (cached) {
    const text = await cached.text();
    if (!row.embedding) await saveEmbedding(env, id, text); // searches explained before the column existed
    return new Response(text, { headers: { "Content-Type": "application/json" } });
  }

  const image = await env.BUCKET.get(row.image_key);
  if (!image) return Response.json({ error: "The uploaded plan is missing." }, { status: 404 });
  let result;
  try {
    result = await callModel(env, env.EXPLAIN_API_NAME, [toBase64(new Uint8Array(await image.arrayBuffer())), row.model || "v3"]);
  } catch (err) {
    return modelFailed(err);
  }
  const text = JSON.stringify(result);
  await env.BUCKET.put(key, text, { httpMetadata: { contentType: "application/json" } });
  await saveEmbedding(env, id, text);
  return new Response(text, { headers: { "Content-Type": "application/json" } });
}

// The 128 numbers of the uploaded plan go into one D1 column, as JSON text: for a catalog this small
// one column is enough and the worker can compare the codes itself (no vector database needed)
async function saveEmbedding(env: Env, id: string, explainText: string) {
  const steps = (JSON.parse(explainText) as { steps: { tensor: string; values?: number[] }[] }).steps;
  const code = steps.find((step) => step.tensor === "code")?.values;
  if (code) await env.DB.prepare("UPDATE searches SET embedding = ? WHERE id = ?").bind(JSON.stringify(code), id).run();
}

// GET /api/searches/<id>/earlier: the three earlier uploads closest to this one, with the same network.
// The model server knows only the 5,000 plans of CubiCasa5K; the uploads people made are only in D1.
async function earlier(id: string, env: Env, userId: string) {
  const row = await env.DB.prepare("SELECT model, embedding FROM searches WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .first<{ model: string | null; embedding: string | null }>();
  if (!row) return Response.json({ error: "No such search." }, { status: 404 });
  if (!row.embedding) return Response.json([]);

  const code: number[] = JSON.parse(row.embedding);
  const { results } = await env.DB.prepare(
    "SELECT id, created_at, file_name, embedding FROM searches WHERE user_id = ? AND model IS ? AND embedding IS NOT NULL AND id != ? ORDER BY created_at DESC LIMIT 2000",
  )
    .bind(userId, row.model, id)
    .all<{ id: string; created_at: string; file_name: string | null; embedding: string }>();
  const closest = results
    .map(({ embedding, ...other }) => {
      const theirs: number[] = JSON.parse(embedding);
      return { ...other, distance: Math.hypot(...code.map((v, i) => v - theirs[i])) };
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3);
  return Response.json(closest);
}

// ---- Saved searches ------------------------------------------------------------

// GET /api/history: this user's 20 most recent searches, read from D1
async function history(env: Env, userId: string) {
  const { results } = await env.DB.prepare(
    "SELECT id, created_at, file_name, best_id, best_distance, match_ids, model FROM searches WHERE user_id = ? ORDER BY created_at DESC LIMIT 20",
  ).bind(userId).all<Record<string, unknown> & { match_ids: string }>();
  return Response.json(results.map((row) => ({ ...row, match_ids: JSON.parse(row.match_ids) })));
}

// GET /api/searches/<id>: a past search again, with its five matches, read from D1 and R2
async function savedSearch(id: string, env: Env, userId: string) {
  const row = await env.DB.prepare("SELECT id, created_at, file_name, result_key, model FROM searches WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .first<{ id: string; created_at: string; file_name: string | null; result_key: string; model: string | null }>();
  if (!row) return Response.json({ error: "No such search." }, { status: 404 });
  const object = await env.BUCKET.get(row.result_key);
  if (!object) return Response.json({ error: "The stored result is missing." }, { status: 404 });
  const result = await object.json<object>();
  return Response.json({ id: row.id, created_at: row.created_at, file_name: row.file_name, model: row.model || "v3", ...result });
}

// GET /api/images/<id>: the uploaded image, read back from R2, only for the user who uploaded it
async function uploadedImage(id: string, env: Env, userId: string) {
  const mine = await env.DB.prepare("SELECT 1 AS yes FROM searches WHERE id = ? AND user_id = ?").bind(id, userId).first();
  if (!mine) return new Response("Not found", { status: 404 });
  const object = await env.BUCKET.get(`uploads/${id}`);
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, {
    headers: { "Content-Type": object.httpMetadata?.contentType || "application/octet-stream" },
  });
}
