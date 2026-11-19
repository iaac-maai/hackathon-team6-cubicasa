# 03 · The app

**Team 6 · Plan precedents: floor-plan similarity search**

**Public URL:** https://hackathon-team6-cubicasa-app.hackathon-team6-cubicasa-app.workers.dev

The first version, on Cloudflare Pages, is still at `https://hackathon-team6-cubicasa-app.pages.dev`.

**Log in:** two locks. First the team password, which we give you in the course hand-in, **not** in this repository. Then your own account: sign up with your email and a password, or with Google. The terms and conditions open when you create the account, and nothing is created until you accept them.

⚠️ The model server runs on Render's free plan and sleeps after 15 minutes without requests. The page starts waking it as soon as it opens. If it is still asleep when you search, the page says **"The model is waking up, about one minute"** and tries again by itself (up to 3 times, 10 s apart).

## What the app does

An architect chooses one of our three neural networks, then uploads a floor plan (PNG or JPEG). The app sends both to our model server on Render, which turns the plan into a code of 128 numbers and finds the five closest codes among the 5,000 homes of CubiCasa5K. The page shows your plan next to the five matches, each with its rooms. The room key above them isolates one room type on every room map and gives its share of the rooms in each plan. Clicking a plan number opens it larger.

Before a search, the page shows the collection itself: the 5,000 plans drawn on the map of the chosen network. Choosing another network moves them to where that network puts them.

Below the matches, **Look inside** shows what the network computed for your plan. Every number comes from the ONNX file the server runs, not from a drawing of a network:

| Figure | What it shows | Where the numbers come from |
|---|---|---|
| Where your plan lands among the 5,000 | The 5,000 plans on the UMAP map of this network's codes, as dots shaded by their distance to your plan or as the drawings themselves; your plan and its five matches marked. After a search the plans light up from the closest to the farthest, then the map zooms to your plan | `public/data/atlas.json`, the drawings in `public/data/plans_*.webp` and the 5,000 distances from `/explain_model` |
| How close the five are | Histogram of the 5,000 distances, the five matches and the median marked | The 5,000 distances from `/explain_model` |
| What each layer sees | Every layer in order: the four most active channels of each conv layer, the 128 numbers of the code, the output | The inner layers of the ONNX file, from `/explain_model` |

The map was computed once for the 5,000 plans, so an uploaded plan is placed at the middle of its five matches. In the Plans view each cell shows the plan closest to its centre, as in the atlas figure of the notebook, and paler drawings are farther from your plan. The atlases of v2 and v3 are the ones saved by the notebooks; v1 was never saved, so `scripts/make_atlas.py` computes it with the same UMAP settings (n_neighbors 30, min_dist 0.1, random_state 42).

| Network | ONNX file | What it compares |
|---|---|---|
| v1 · plain autoencoder | `floorplan_ae.onnx` | The plans exactly as drawn |
| v2 · cleaned lines | `floorplan_ae_v2.onnx` | The plans cleaned down to thin lines, so drawing style counts less |
| **v3 · rooms (recommended, default)** | `floorplan_ae_v3.onnx` | Trained to recognise rooms, so matches share the room layout |

Distances of different networks are not on the same scale and can't be compared.

## Accounts, terms and the reading pages

Every search belongs to the account that made it: each query on `searches` has `WHERE user_id = ?`, so user B never sees the rows, the plans or the results of user A, even with the id of A's search. "Delete my account", in the footer, removes the account, its sessions, its searches in D1 and its files in R2.

The accounts run on [Better Auth](https://www.better-auth.com) inside the Worker (`worker/auth.ts`), with its tables in our D1. Passwords are kept only as salted PBKDF2-SHA256 hashes from the Web Crypto of the Worker; the browser keeps only an HttpOnly session cookie. The order of the locks in `worker/index.ts`: team password, then account, then the accepted version of the terms. When the terms change, raising `TERMS_VERSION` asks everyone to accept them again.

`/guide`, `/features`, `/faq`, `/terms` and `/privacy` are readable without logging in and are linked in the footer of every page. The texts are in `src/pages.tsx` and `src/legal.tsx`; they describe what the code stores and who it sends data to, so they change with the code.

## One model server for both

The app has no model of its own. The Worker calls the same server on Render as `02_model_server/call_api.ipynb`, with the same two-step Gradio API: `predict_model` for the five matches and `explain_model` for Look inside. Cloudflare keeps the page, the password, D1 and R2; Render keeps the model.

The two also share what they compute. As in class (deck 03, slide 28), the 128 numbers of every uploaded plan are saved in one D1 column as text, and the Worker compares them itself: under the matches, the page lists the earlier uploads closest to this one. The model server only knows the 5,000 plans of CubiCasa5K, so this list can only come from D1.

## Cloudflare services and why

| Service | What we use it for | Why |
|---|---|---|
| **Workers** | `worker/index.ts`: login check, calls to the model server, reading and writing D1 and R2 | The password and the model calls must run on the server, never in the browser |
| **Static assets** | The React page, built by Vite into `dist/client/`, the example plans and the map data in `data/` | Served by the same Worker; `/api/...` and `/data/...` go through the password check first |
| **D1** | Table `searches`: one row per search (date, file name, network, best match, distance, the five match ids, place on the atlas, the 128 numbers of the plan, the account that made it) · tables `user`, `session`, `account`, `verification` of Better Auth · table `consent`: which version of the terms each user accepted, and when | Small structured rows we list, sort and compare: a SQL table is the right fit for a catalog this small |
| **R2** | `uploads/<id>`: the uploaded plan · `results/<id>.json`: the answer of `/predict_model` · `explain/<id>.json`: the answer of `/explain_model` | Files and big answers don't belong in database rows; a past search reopens with everything while the model server sleeps |
| **Secret `APP_PASSWORD`** | The team password | Kept by Cloudflare, never in the code or on GitHub |
| **Secret `BETTER_AUTH_SECRET`** | Signs the session cookies | Same |
| **Secrets `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`** | "Continue with Google"; the button shows only when both are set | Same |

This version has its own D1 database and R2 bucket, on Luca's Cloudflare account; the searches made with the first version stay with it.

## Endpoints (`worker/index.ts`)

| Endpoint | What it does |
|---|---|
| `POST /api/login` | Checks the password, sets a cookie that holds a hash of it (HttpOnly, 7 days) |
| `POST /api/logout` | Deletes the cookie |
| `/api/auth/*` | Better Auth: sign up, sign in, sign out, Google and its callback |
| `GET /api/session` | Who is signed in and whether they accepted the current terms; 401 tells the page which lock to show |
| `POST /api/terms/accept` | Saves that this user accepted this version of the terms |
| `POST /api/account/delete` | Deletes the account and everything of it, in D1 and R2 |
| `GET /api/wake` | Pokes the model server so it starts waking up when the page opens |
| `POST /api/search` | Sends the plan and the chosen network (v1, v2 or v3) to the model server (`predict_model`), stores the plan and the answer in R2 and a row in D1, answers the page |
| `GET /api/searches/<id>/explain` | What the network computed for that search (`explain_model`); asked once, then read from R2 |
| `GET /api/searches/<id>/earlier` | The three earlier uploads closest to this one with the same network, compared in the Worker from the codes in D1 |
| `GET /api/history` | The 20 latest searches of this account, from D1 |
| `GET /api/searches/<id>` | One past search again, from D1 and R2 |
| `GET /api/images/<id>` | The uploaded plan, from R2 |

Every endpoint except login and logout needs the team cookie. Everything after `/api/auth/*` also needs a session, and the search endpoints also need the accepted terms.

## Files

| File | What it is |
|---|---|
| `wrangler.jsonc` | The Worker, its D1 and R2 bindings and the model server address |
| `worker/index.ts` | The API |
| `worker/auth.ts` | Better Auth and the password hash |
| `src/App.tsx` | The page: the three locks, search, saved searches, the footer |
| `src/components/Account.tsx` | Sign in and sign up, the terms window, "Delete my account" |
| `src/pages.tsx` · `src/legal.tsx` | Guide, features, FAQ · terms and conditions, privacy policy |
| `src/components/Upload.tsx` | Network choice and upload |
| `src/components/Result.tsx` | Your plan and the five matches, the room key, the larger view |
| `src/components/LookInside.tsx` | The three figures: `Atlas.tsx`, `Distances.tsx`, `Layers.tsx` |
| `src/components/History.tsx` | Saved searches |
| `public/data/` | Map positions of the 5,000 plans for v1, v2 and v3 and their drawings at 64 px, made by `scripts/make_atlas.py` |
| `public/examples/` | Four plans of the collection to try; each should find itself first |
| `public/favicon.svg` · `logo.svg` · `logo.png` | The logo, a small flat with three rooms in the colours of the room key: cropped close for the tab and the top bar, with a margin for the 120 px PNG of the Google consent screen |
| `schema.sql` | The D1 table `searches` |
| `accounts.sql` | The account tables, made from Better Auth by `scripts/make_auth_schema.mjs`, plus `consent` |

## Diagrams (`diagrams/`)

- `user_stories.md`: our two user stories
- `system.png`: the parts and who talks to whom
- `sequence_1_search.png`: user story 1, one search
- `sequence_2_history.png`: user story 2, past searches and reopening one

The `.mmd` files are the sources of the PNGs (Mermaid). The same diagrams are on our Miro board: <!-- TODO: Miro link -->

## Our diagrams compared with the app

<!-- TODO Team 6: after drawing your diagrams on Miro, ask your AI tool to compare them with the app and write 3 to 5 lines here, in your own words: what is different, and why. -->

## Run it on your computer

```bash
cd 03_app
npm install                                    # Vite, React and wrangler, pinned in package.json
cp .dev.vars.example .dev.vars                 # then write your own local password in .dev.vars
npm run db:local                               # creates the table in a local copy of D1
npm run db:embedding:local                     # only for a local table made before the codes were saved
npm run db:accounts:local                      # the account tables
npm run db:user:local                          # only for a local table made before the accounts: adds the column user_id
npm run dev                                    # open http://localhost:5173
```

Look inside needs `/explain_model` on the model server. Until Render runs the latest `02_model_server`, start the server on your computer (`python app.py` in `02_model_server/`) and set `MODEL_URL=http://localhost:7860` in `.dev.vars`.

`npm run check` type-checks the page and the Worker.

## Put it online

```bash
npx wrangler login                             # once, in your browser
npm run db:remote                              # creates the table in the real D1 database
npm run db:migrate:remote                      # only for a table made before the network tabs: adds the column model
npm run db:embedding:remote                    # only for a table made before the codes were saved: adds the column embedding
npm run db:accounts:remote                     # the account tables
npm run db:user:remote                         # only for a table made before the accounts: adds the column user_id
npx wrangler secret put APP_PASSWORD           # type the team password when asked
openssl rand -base64 32 | npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put GOOGLE_CLIENT_ID       # optional, both from a Google Cloud OAuth client
npx wrangler secret put GOOGLE_CLIENT_SECRET
npm run deploy                                 # builds the page and deploys the Worker
```

For Google, the OAuth client needs `https://<your worker>/api/auth/callback/google` (and `http://localhost:5173/api/auth/callback/google` to test locally) as redirect URIs, and the `/privacy` page as the privacy policy of its consent screen.

Searches made before the accounts have no `user_id`, so no account sees them.

`.dev.vars` is in `.gitignore`: the passwords and secrets are **never** committed.
