import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api, ApiError, MODELS, postJson, ROOM_COLOURS, untilAwake, type Atlas as AtlasData, type Earlier, type Explain, type Me, type Model, type SavedSearch, type SearchResult } from "./api";
import { AccountScreen, DeleteAccount, PENDING_TERMS, TermsDialog } from "./components/Account";
import { TERMS_VERSION } from "./legal";
import { InfoPage, PAGES, type PagePath } from "./pages";
import { Atlas } from "./components/Atlas";
import { History } from "./components/History";
import { Login } from "./components/Login";
import { LookInside } from "./components/LookInside";
import { Result, RoomKey } from "./components/Result";
import { Upload } from "./components/Upload";

type Status = { text: string; tone: "info" | "waking" | "error" } | null;
const WAKING = "The model is waking up, about one minute.";

// The three locks, in order: the team password, your account, the terms you accepted
type Gate = "checking" | "password" | "account" | "terms" | "in";

export function App() {
  const [session, setSession] = useState<Gate>("checking");
  const [me, setMe] = useState<Me | null>(null);
  const [google, setGoogle] = useState(false);
  const [view, setView] = useState<"search" | "history">("search");
  const [model, setModel] = useState<Model>("v3");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [shown, setShown] = useState<{ result: SearchResult; uploadedUrl: string } | null>(null);
  const [explain, setExplain] = useState<Explain | null>(null);
  const [explainError, setExplainError] = useState<string | null>(null);
  const [atlas, setAtlas] = useState<AtlasData | null>(null);
  const [earlier, setEarlier] = useState<Earlier[] | null>(null);
  const [history, setHistory] = useState<SavedSearch[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [focusRoom, setFocusRoom] = useState<string | null>(null);
  const [hoverRank, setHoverRank] = useState<number | null>(null);
  const [selectedRank, setSelectedRank] = useState<number | null>(null);
  const current = useRef<string | null>(null);
  const flight = useRef<DOMRect | null>(null); // where your plan was on screen when you pressed search

  // your plan flies from the upload box to its sheet next to the five matches
  useLayoutEffect(() => {
    const from = flight.current;
    flight.current = null;
    const target = document.querySelector<HTMLImageElement>(".yours .upload-image");
    if (!from || !target || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    window.scrollTo({ top: 0 });
    const to = target.getBoundingClientRect();
    const ghost = target.cloneNode() as HTMLImageElement;
    Object.assign(ghost.style, { position: "fixed", left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`,
      height: `${to.height}px`, margin: "0", zIndex: "40", pointerEvents: "none", transformOrigin: "0 0" });
    document.body.append(ghost);
    target.style.visibility = "hidden";
    const scale = Math.min(from.width / to.width, from.height / to.height);
    ghost.animate([
      { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${scale})`, boxShadow: "0 0 0 rgb(0 0 0 / 0)" },
      { transform: `translate(${(from.left - to.left) / 3}px, ${(from.top - to.top) / 3 - 24}px) scale(${(scale + 1) / 2})`, boxShadow: "0 18px 40px rgb(27 33 41 / 0.22)", offset: 0.6 },
      { transform: "none", boxShadow: "0 0 0 rgb(0 0 0 / 0)" },
    ], { duration: 850, easing: "cubic-bezier(.16,1,.3,1)" }).finished.finally(() => {
      target.style.visibility = "";
      ghost.remove();
    });
  }, [shown?.result.id]);

  async function checkSession() {
    try {
      const answer = await api<Me>("/api/session");
      setMe(answer);
      let pending: string | null = null;
      try {
        pending = sessionStorage.getItem(PENDING_TERMS);
        sessionStorage.removeItem(PENDING_TERMS);
      } catch { /* private window */ }
      if (!answer.termsAccepted && pending === TERMS_VERSION) {
        await api("/api/terms/accept", { method: "POST" }); // accepted in the window, just before going to Google
        answer.termsAccepted = true;
      }
      setSession(answer.termsAccepted ? "in" : "terms");
    } catch (err) {
      if (err instanceof ApiError && err.body.need === "account") {
        setGoogle(Boolean(err.body.google));
        setSession("account");
      } else {
        setSession("password");
      }
    }
  }

  const signOut = () => postJson("/api/auth/sign-out", {}).finally(() => window.location.assign("/"));

  useEffect(() => {
    checkSession();
  }, []);

  useEffect(() => {
    if (session !== "in") return;
    fetch("/api/wake"); // a sleeping Render server starts waking while the user chooses a plan
    fetch("/data/atlas.json").then((r) => r.json()).then(setAtlas, () => setAtlas(null));
  }, [session]);

  useEffect(() => {
    if (session !== "in" || view !== "history") return;
    setHistory(null);
    setHistoryError(null);
    api<SavedSearch[]>("/api/history").then(setHistory, (err) => failed(err, setHistoryError));
  }, [session, view]);

  function failed(err: unknown, show: (text: string) => void) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return void checkSession();
    show(err instanceof ApiError ? (err.waking ? `${WAKING} Please try again in a minute.` : err.message) : "Could not reach the app. Check your connection.");
  }

  async function loadExplain(id: string) {
    setExplain(null);
    setExplainError(null);
    setEarlier(null);
    try {
      const answer = await untilAwake(() => api<Explain>(`/api/searches/${id}/explain`), () => {}, 3);
      if (current.current !== id) return;
      setExplain(answer);
      // the explain call saved this plan's code in D1, so the worker can now compare it with earlier uploads
      const others = await api<Earlier[]>(`/api/searches/${id}/earlier`);
      if (current.current === id) setEarlier(others);
    } catch (err) {
      if (current.current === id) failed(err, setExplainError);
    }
  }

  function show(result: SearchResult, uploadedUrl: string) {
    current.current = result.id;
    setShown({ result, uploadedUrl });
    setFocusRoom(null);
    setSelectedRank(null);
    loadExplain(result.id);
  }

  async function search() {
    if (!file) return;
    setBusy(true);
    setStatus({ text: `Searching with ${model}…`, tone: "info" });
    const slow = setTimeout(() => setStatus({ text: `${WAKING} Your search continues by itself.`, tone: "waking" }), 4000);
    try {
      const body = new FormData();
      body.append("plan", file);
      body.append("model", model);
      const result = await untilAwake(
        () => api<SearchResult>("/api/search", { method: "POST", body }),
        (attempt) => setStatus({ text: `${WAKING} Trying again (${attempt}/3)…`, tone: "waking" }),
      );
      flight.current = document.querySelector(".upload .drop img")?.getBoundingClientRect() ?? null;
      show(result, URL.createObjectURL(file));
      setStatus(null);
    } catch (err) {
      failed(err, (text) => setStatus({ text, tone: "error" }));
    } finally {
      clearTimeout(slow);
      setBusy(false);
    }
  }

  async function open(id: string) {
    try {
      const result = await api<SearchResult>(`/api/searches/${id}`);
      setModel(result.model);
      show(result, `/api/images/${id}`);
      setView("search");
      window.scrollTo({ top: 0 });
    } catch (err) {
      failed(err, setHistoryError);
    }
  }

  const route = window.location.pathname;
  if (route in PAGES) return <><InfoPage path={route as PagePath} /><Colophon me={me} /></>;
  if (session === "checking") return null;
  if (session === "password") return <><Login onLoggedIn={checkSession} /><Colophon me={null} /></>;
  if (session === "account") return <><AccountScreen google={google} onSignedIn={checkSession} /><Colophon me={null} /></>;
  if (session === "terms") {
    return (
      <>
        <main className="login" />
        <TermsDialog intro="The terms have to be accepted before you use the app." acceptLabel="Accept" cancelLabel="Decline and sign out"
          onAccept={() => api("/api/terms/accept", { method: "POST" }).then(checkSession, checkSession)} onCancel={signOut} />
      </>
    );
  }

  return (
    <>
      <header className="bar">
        <div className="bar-inner">
          <p className="product"><img src="/favicon.svg" alt="" width="22" height="22" />Plan precedents <span>Team 6 · CubiCasa5K</span></p>
          <nav aria-label="Views">
            <button type="button" aria-current={view === "search" ? "page" : undefined} onClick={() => setView("search")}>Search</button>
            <button type="button" aria-current={view === "history" ? "page" : undefined} onClick={() => setView("history")}>Saved searches</button>
          </nav>
          <p className="who" title={me?.user.email}>{me?.user.name}</p>
          <button type="button" className="logout" onClick={signOut}>Log out</button>
        </div>
      </header>

      <main className="page">
        {view === "history" ? (
          <History rows={history} error={historyError} onOpen={open} />
        ) : (
          <>
            {shown ? (
              <>
                <h1 className="visually-hidden">Find similar floor plans</h1>
                <div className="workspace">
                  <Upload model={model} setModel={setModel} file={file} setFile={setFile} onSearch={search} busy={busy} status={status} />
                  <Result result={shown.result} uploadedUrl={shown.uploadedUrl} earlier={earlier} onOpen={open} focusRoom={focusRoom} setFocusRoom={setFocusRoom}
                    hoverRank={hoverRank} setHoverRank={setHoverRank} selectedRank={selectedRank} setSelectedRank={setSelectedRank} />
                </div>
                <LookInside result={shown.result} uploadedUrl={shown.uploadedUrl} explain={explain} explainError={explainError} retryExplain={() => loadExplain(shown.result.id)}
                  atlas={atlas} hoverRank={hoverRank} setHoverRank={setHoverRank} focusRoom={focusRoom} />
              </>
            ) : (
              // before a search the page is a cover: the collection itself, as the chosen network arranges it
              <section className="cover" aria-labelledby="cover-title">
                <Upload model={model} setModel={setModel} file={file} setFile={setFile} onSearch={search} busy={busy} status={status} strip />
                <div className="cover-head">
                  <h1 id="cover-title">5,000 homes</h1>
                  <p className="muted">
                    The plans of CubiCasa5K, arranged by {model} · {MODELS[model].name.toLowerCase()}: the network puts the plans it
                    finds alike next to each other. Choose a plan above and the five closest to yours appear, with what the
                    network computed to find them.
                  </p>
                </div>
                <RoomKey colours={ROOM_COLOURS} focus={focusRoom} setFocus={setFocusRoom} />
                {atlas ? (
                  <Atlas atlas={atlas} model={model} distances={null} matches={[]} uploadedUrl={null} hoverRank={null} setHoverRank={() => {}}
                    initialMode="plans" tall focusRoom={focusRoom} colours={ROOM_COLOURS} label={`The 5,000 plans of CubiCasa5K, arranged by ${model}`} />
                ) : (
                  <div className="skeleton strip" />
                )}
                <p className="reading">
                  Choose another network above and watch the plans move. Drag to look around, pinch or double-click to zoom,
                  and pick a room type to see where it is across the whole collection.
                </p>
              </section>
            )}
          </>
        )}
      </main>

      <Colophon me={me} />
    </>
  );
}

// The close of every page: who made it, where it runs, and the terms, the privacy policy and your account
function Colophon({ me }: { me: Me | null }) {
  return (
    <footer className="colophon">
      <div>
        <p><b>Plan precedents</b> · Team 6, AI Methods I, IAAC 2026</p>
        <p>Plans and rooms from CubiCasa5K, Kalervo et al., 2019</p>
        <p>The model runs on Render, the page and the data on Cloudflare</p>
        <p className="legal-links">
          <a href="/guide">Guide</a>
          <a href="/features">Features</a>
          <a href="/faq">FAQ</a>
          <a href="/terms">Terms and conditions</a>
          <a href="/privacy">Privacy policy</a>
          {me && <DeleteAccount onDeleted={() => window.location.assign("/")} />}
          <a href="/humans.txt">humans.txt</a>
        </p>
      </div>
    </footer>
  );
}
