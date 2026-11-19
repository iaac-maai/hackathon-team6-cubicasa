import { useEffect, useMemo, useRef, useState } from "react";
import { planNumber, planSource, type Atlas as AtlasData, type Match, type Model } from "../api";
import { LEVELS, levelColours, ranks } from "../scale";

// The 5,000 plans on the UMAP map of one network's codes. Drag to move, pinch or double-click to zoom.
// Zoomed in, the "Plans" view replaces each dot with the drawing itself, one plan per cell, like the
// atlas figure of the notebook; "Rooms" shows the room maps of the annotations instead, and the room key
// keeps one room type on all of them. After a search the map plays the search once: the plans light up from
// the closest to the farthest, then it flies to your plan.

type View = { x: number; y: number; k: number }; // centre of the view in map units (0-1) and zoom (1 = all)
type Mode = "dots" | "plans" | "rooms";
type Kind = "plans" | "rooms";
type Key = "wave" | "rings" | "plans" | "morph" | "land";
type Tween = { from: number | View; to: number | View; start: number; ms: number; ease: (t: number) => number; done: () => void };

const PAD = 18;
const CELL = 50; // px of one plan drawing at the middle of a zoom level
const MAX_ZOOM = 32;
const WHOLE: View = { x: 0.5, y: 0.5, k: 1 };
const FAINT = "rgb(160 168 178)"; // dots when there is no plan to measure against

const easeOut = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// The drawings and the room maps: 1,024 plans of 64 px per sheet, shared by every map on the page, loaded on first use
const sheets: Record<Kind, HTMLImageElement[]> = { plans: [], rooms: [] };
function loadSheets(kind: Kind, count: number, onLoad: () => void) {
  const list = sheets[kind];
  for (let i = 0; i < count; i++) {
    if (!list[i]) {
      list[i] = new Image();
      list[i].src = kind === "plans" ? `/data/plans_${i}.webp` : `/data/rooms_${i}.png`;
    }
    if (!list[i].complete) list[i].addEventListener("load", onLoad, { once: true });
  }
}

// A room sheet with every room but one faded, as on the room maps of the sheets; made once per room type
const faded = new Map<string, HTMLCanvasElement>();
function roomSheet(i: number, hex: string | null) {
  const sheet = sheets.rooms[i];
  if (!sheet?.complete || !hex) return sheet?.complete ? sheet : null;
  const key = `${i}:${hex}`;
  if (!faded.has(key)) {
    const canvas = document.createElement("canvas");
    canvas.width = sheet.width;
    canvas.height = sheet.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(sheet, 0, 0);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = image.data;
    const keep = parseInt(hex.slice(1), 16);
    for (let p = 0; p < data.length; p += 4) {
      const colour = (data[p] << 16) | (data[p + 1] << 8) | data[p + 2];
      if (colour === keep || colour === 0xffffff) continue;
      for (let c = 0; c < 3; c++) data[p + c] = Math.round(data[p + c] + (255 - data[p + c]) * 0.86);
    }
    context.putImageData(image, 0, 0);
    faded.set(key, canvas);
  }
  return faded.get(key)!;
}

interface Props {
  atlas: AtlasData;
  model: Model;
  distances: number[] | null;
  matches: Match[];
  uploadedUrl: string | null;
  hoverRank: number | null;
  setHoverRank: (rank: number | null) => void;
  introKey?: string; // a new key plays the search once, when the map comes into view
  initialMode: Mode;
  label: string;
  focusRoom?: string | null; // the room type chosen in the room key
  colours?: Record<string, string>;
  tall?: boolean; // a wide plate: starts a little zoomed in, so the plans fill the width
}

export function Atlas({ atlas, model, distances, matches, uploadedUrl, hoverRank, setHoverRank, introKey, initialMode, label,
  focusRoom = null, colours = {}, tall = false }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 600, h: 480 });
  const [mode, setMode] = useState<Mode>(initialMode);
  const [tip, setTip] = useState<{ x: number; y: number; index: number } | null>(null);
  const n = atlas.ids.length;

  // Everything the drawing reads lives in one ref, so animation frames never see stale React state
  const s = useRef({
    view: { ...WHOLE, k: tall ? 1.4 : 1 } as View,
    wave: 1, rings: 1, morph: 1, land: 1,
    plans: initialMode === "dots" ? 0 : 1,
    mode: initialMode,
    kind: (initialMode === "rooms" ? "rooms" : "plans") as Kind, // which sheets the tiles show, kept while they fade out
    hover: null as number | null,
    tiles: [] as { index: number; x: number; y: number; size: number }[],
    tweens: new Map<Key | "view", Tween>(),
    frame: 0,
    you: null as HTMLImageElement | null,
  }).current;

  // map positions, with y turned upwards like in the notebook
  const target = useMemo(() => {
    const xy = atlas[model];
    const out = new Float32Array(2 * n);
    for (let i = 0; i < n; i++) {
      out[2 * i] = xy[2 * i];
      out[2 * i + 1] = 1 - xy[2 * i + 1];
    }
    return out;
  }, [atlas, model, n]);
  const from = useRef(target);
  const to = useRef(target);
  const shown = useRef(new Float32Array(2 * n)); // where each plan is drawn right now (between two networks while morphing)

  const scale = useMemo(() => (distances ? ranks(distances) : null), [distances]);
  const indexOf = useMemo(() => new Map(atlas.ids.map((id, i) => [id, i])), [atlas]);
  const matchIndex = useMemo(() => matches.map((m) => indexOf.get(m.id) ?? -1), [matches, indexOf]);

  const focusHex = focusRoom ? colours[focusRoom] ?? null : null;
  const live = useRef({ size, scale, matchIndex, matches, focusHex });
  live.current = { size, scale, matchIndex, matches, focusHex };

  // ---- animation ----------------------------------------------------------------------
  function requestDraw() {
    if (!s.frame) s.frame = requestAnimationFrame(frame);
  }

  function frame(now: number) {
    s.frame = 0;
    for (const [key, t] of s.tweens) {
      const p = clamp((now - t.start) / t.ms, 0, 1);
      const e = t.ease(p);
      if (key === "view") {
        const a = t.from as View;
        const b = t.to as View;
        // zoom moves in log space, so a fly-in feels like the same speed at every scale
        s.view = { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, k: Math.exp(Math.log(a.k) + (Math.log(b.k) - Math.log(a.k)) * e) };
      } else {
        s[key] = (t.from as number) + ((t.to as number) - (t.from as number)) * e;
      }
      if (p >= 1) {
        s.tweens.delete(key);
        t.done();
      }
    }
    draw();
    if (s.tweens.size) requestDraw();
  }

  function tween(key: Key | "view", value: number | View, ms: number, ease = easeOut) {
    return new Promise<void>((done) => {
      s.tweens.get(key)?.done();
      if (reducedMotion()) {
        if (key === "view") s.view = value as View;
        else s[key] = value as number;
        s.tweens.delete(key);
        requestDraw();
        return done();
      }
      s.tweens.set(key, { from: key === "view" ? { ...s.view } : s[key], to: value, start: performance.now(), ms, ease, done });
      requestDraw();
    });
  }

  function showMode(next: Mode) {
    s.mode = next;
    setMode(next);
    if (next !== "dots") {
      s.kind = next;
      loadSheets(next, Math.ceil(n / atlas.per_sheet), requestDraw);
    }
    tween("plans", next === "dots" ? 0 : 1, 380);
  }

  // ---- geometry -----------------------------------------------------------------------
  const base = () => Math.min(live.current.size.w, live.current.size.h) - 2 * PAD;
  const toScreen = (mx: number, my: number) => {
    const { w, h } = live.current.size;
    const k = base() * s.view.k;
    return [w / 2 + (mx - s.view.x) * k, h / 2 + (my - s.view.y) * k];
  };
  const toMap = (sx: number, sy: number) => {
    const { w, h } = live.current.size;
    const k = base() * s.view.k;
    return [s.view.x + (sx - w / 2) / k, s.view.y + (sy - h / 2) / k];
  };
  const keepInside = (v: View): View => ({ x: clamp(v.x, 0, 1), y: clamp(v.y, 0, 1), k: clamp(v.k, 1, MAX_ZOOM) });

  function youPosition() {
    const idx = live.current.matchIndex.filter((i) => i >= 0);
    if (!idx.length) return null;
    const p = shown.current;
    // the map was computed once for the 5,000 plans, so a new plan sits at the middle of its matches
    return [idx.reduce((a, i) => a + p[2 * i], 0) / idx.length, idx.reduce((a, i) => a + p[2 * i + 1], 0) / idx.length];
  }

  function neighbourhood(): View {
    const you = youPosition();
    if (!you) return { ...WHOLE };
    const p = shown.current;
    const idx = live.current.matchIndex.filter((i) => i >= 0);
    const span = Math.max(0.03, ...idx.map((i) => Math.max(Math.abs(p[2 * i] - you[0]), Math.abs(p[2 * i + 1] - you[1]))));
    return keepInside({ x: you[0], y: you[1], k: clamp(0.32 / span, 3, 9) });
  }

  // ---- drawing ------------------------------------------------------------------------
  function draw() {
    const c = canvas.current;
    if (!c) return;
    const context = c.getContext("2d")!;
    const { w, h } = live.current.size;
    const ratio = window.devicePixelRatio || 1;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, w, h);

    const p = shown.current;
    const a = from.current;
    const b = to.current;
    const m = easeInOut(s.morph);
    for (let i = 0; i < 2 * n; i++) p[i] = a[i] + (b[i] - a[i]) * m;

    const { scale: sc, matchIndex: mi } = live.current;
    const zoomPx = base() * s.view.k;
    const ox = w / 2 - s.view.x * zoomPx;
    const oy = h / 2 - s.view.y * zoomPx;

    // dots, drawn shade by shade from pale to dark, so the plans closest to yours end up on top
    if (s.plans < 1) {
      context.globalAlpha = 1 - 0.9 * s.plans;
      const r = clamp(1.5 * Math.sqrt(s.view.k), 1.4, 4.5) * (w < 420 ? 0.85 : 1);
      if (!sc) {
        context.fillStyle = FAINT;
        context.beginPath();
        for (let i = 0; i < n; i++) dot(context, ox + p[2 * i] * zoomPx, oy + p[2 * i + 1] * zoomPx, r);
        context.fill();
      } else {
        const levels = new Uint8Array(n);
        for (let i = 0; i < n; i++) {
          // the wave: a plan takes its shade once the search has reached its rank
          const reveal = clamp((s.wave * 1.25 - sc.rank[i]) / 0.25, 0, 1);
          levels[i] = Math.round((1 - reveal * (1 - sc.rank[i])) * (LEVELS - 1));
        }
        for (let level = LEVELS - 1; level >= 0; level--) {
          context.fillStyle = levelColours[level];
          context.beginPath();
          for (let i = 0; i < n; i++) if (levels[i] === level) dot(context, ox + p[2 * i] * zoomPx, oy + p[2 * i + 1] * zoomPx, r);
          context.fill();
        }
      }
    }

    // plans: one drawing per cell; cells double at each zoom level so they stay put while you drag
    s.tiles = [];
    if (s.plans > 0) {
      const level = Math.max(0, Math.round(Math.log2(s.view.k)));
      const cell = CELL / (base() * 2 ** level); // map units
      const best = new Map<number, [number, number]>();
      const isMatch = new Set(mi);
      for (let i = 0; i < n; i++) {
        if (s.kind === "rooms" && atlas.has_rooms[i] === "0") continue; // 8 plans have no room annotation
        const sx = ox + p[2 * i] * zoomPx;
        const sy = oy + p[2 * i + 1] * zoomPx;
        if (sx < -CELL * 2 || sy < -CELL * 2 || sx > w + CELL * 2 || sy > h + CELL * 2) continue;
        const cx = Math.floor(p[2 * i] / cell);
        const cy = Math.floor(p[2 * i + 1] / cell);
        const key = cx * 65536 + cy;
        const d = isMatch.has(i) ? -1 : (p[2 * i] - (cx + 0.5) * cell) ** 2 + (p[2 * i + 1] - (cy + 0.5) * cell) ** 2;
        const kept = best.get(key);
        if (!kept || d < kept[1]) best.set(key, [i, d]);
      }
      const size = cell * zoomPx - 4;
      for (const [key, [i, d]] of best) {
        if (d > (0.7 * cell) ** 2) continue; // an empty cell stays empty, as in the notebook figure
        const x = ox + (Math.floor(key / 65536) + 0.5) * cell * zoomPx;
        const y = oy + ((key % 65536) + 0.5) * cell * zoomPx;
        s.tiles.push({ index: i, x, y, size });
      }
      for (const t of s.tiles) {
        // paler drawings are farther from your plan, the same reading as the dots
        context.globalAlpha = s.plans * (sc ? 1 - 0.62 * sc.rank[t.index] ** 0.8 : 1);
        plan(context, t.index, t.x - t.size / 2, t.y - t.size / 2, t.size);
      }
      context.globalAlpha = s.plans;
      for (const t of s.tiles) {
        const rank = mi.indexOf(t.index);
        if (rank >= 0) badge(context, t.x - t.size / 2, t.y - t.size / 2, t.size, String(rank + 1), s.hover === rank + 1);
      }
    }

    // the course: your plan and its five matches, above everything
    const you = youPosition();
    if (you) {
      const [yx, yy] = [ox + you[0] * zoomPx, oy + you[1] * zoomPx];
      context.globalAlpha = (1 - s.plans) * s.rings;
      context.strokeStyle = "#c93b1b";
      mi.forEach((i, r) => {
        if (i < 0) return;
        const hover = s.hover === r + 1;
        context.lineWidth = hover ? 2.6 : 1.6;
        context.beginPath();
        context.arc(ox + p[2 * i] * zoomPx, oy + p[2 * i + 1] * zoomPx, (hover ? 9 : 6) * s.rings, 0, 2 * Math.PI);
        context.stroke();
      });
      context.globalAlpha = s.rings;
      if (s.plans > 0.5 && s.you?.complete && s.tiles.length) {
        context.globalAlpha = s.rings * s.land;
        const size = s.tiles[0].size * 1.2 * (1 + 0.9 * (1 - s.land)); // your plan lands on the map
        context.fillStyle = "#fff";
        context.fillRect(yx - size / 2, yy - size / 2, size, size);
        contain(context, s.you, yx - size / 2, yy - size / 2, size);
        badge(context, yx - size / 2, yy - size / 2, size, "You", true);
      } else {
        context.lineWidth = 2.6;
        context.beginPath();
        context.moveTo(yx - 6, yy);
        context.lineTo(yx + 6, yy);
        context.moveTo(yx, yy - 6);
        context.lineTo(yx, yy + 6);
        context.stroke();
        context.font = "650 12px \"Archivo Variable\", system-ui, sans-serif";
        context.lineWidth = 3;
        context.strokeStyle = "#fff";
        context.strokeText("Your plan", yx + 10, yy - 8);
        context.fillStyle = "#c93b1b";
        context.fillText("Your plan", yx + 10, yy - 8);
      }
    }
    context.globalAlpha = 1;
  }

  function dot(context: CanvasRenderingContext2D, x: number, y: number, r: number) {
    context.moveTo(x + r, y);
    context.arc(x, y, r, 0, 2 * Math.PI);
  }

  function plan(context: CanvasRenderingContext2D, index: number, x: number, y: number, size: number) {
    context.fillStyle = "#fff";
    context.fillRect(x, y, size, size);
    const i = Math.floor(index / atlas.per_sheet);
    const sheet = s.kind === "rooms" ? roomSheet(i, live.current.focusHex) : sheets.plans[i]?.complete ? sheets.plans[i] : null;
    const j = index % atlas.per_sheet;
    if (sheet) {
      context.drawImage(sheet, (j % atlas.cols) * atlas.tile, Math.floor(j / atlas.cols) * atlas.tile, atlas.tile, atlas.tile, x, y, size, size);
    }
    context.strokeStyle = "rgb(27 33 41 / 0.16)";
    context.lineWidth = 1;
    context.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
  }

  function badge(context: CanvasRenderingContext2D, x: number, y: number, size: number, text: string, strong: boolean) {
    context.strokeStyle = "#c93b1b";
    context.lineWidth = strong ? 2.5 : 1.8;
    context.strokeRect(x, y, size, size);
    context.font = "650 11px \"Archivo Variable\", system-ui, sans-serif";
    const width = context.measureText(text).width + 8;
    context.fillStyle = "#c93b1b";
    context.fillRect(x - 1, y - 15, width, 15);
    context.fillStyle = "#fff";
    context.fillText(text, x + 3, y - 4);
  }

  function contain(context: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, size: number) {
    const f = Math.min(size / image.width, size / image.height);
    context.drawImage(image, x + (size - image.width * f) / 2, y + (size - image.height * f) / 2, image.width * f, image.height * f);
  }

  // ---- React side -----------------------------------------------------------------------
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      setSize({ w, h: Math.round(tall ? clamp(w * 0.62, 360, 760) : clamp(w * 0.78, 320, 620)) });
    });
    observer.observe(box.current!);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const ratio = window.devicePixelRatio || 1;
    canvas.current!.width = size.w * ratio;
    canvas.current!.height = size.h * ratio;
    draw();
  }, [size]);

  useEffect(() => {
    s.hover = hoverRank;
    requestDraw();
  }, [hoverRank]);

  useEffect(() => {
    if (!uploadedUrl) return void (s.you = null);
    const image = new Image();
    image.onload = requestDraw;
    image.src = uploadedUrl;
    s.you = image;
  }, [uploadedUrl]);

  useEffect(() => {
    if (initialMode !== "dots") loadSheets(initialMode, Math.ceil(n / atlas.per_sheet), requestDraw);
  }, []);

  // choosing a room type in the key shows the room maps, where it can be seen
  useEffect(() => {
    if (focusRoom && s.mode !== "rooms") showMode("rooms");
    requestDraw();
  }, [focusRoom]);

  // another network: the same 5,000 plans move to where that network puts them
  useEffect(() => {
    if (to.current === target) return requestDraw();
    from.current = shown.current.slice();
    to.current = target;
    s.morph = 0;
    const wasPlans = s.mode === "plans";
    if (wasPlans) tween("plans", 0, 180);
    tween("morph", 1, 1100, (t) => t).then(() => {
      if (s.mode === "plans") tween("plans", 1, 380);
    });
  }, [target]);

  // the search, played once when the map scrolls into view
  useEffect(() => {
    if (!introKey || !scale) return requestDraw();
    Object.assign(s, { wave: 0, rings: 0, plans: 0, land: 0, mode: "dots", view: { ...WHOLE } });
    setMode("dots");
    requestDraw();
    let cancelled = false;
    const observer = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      loadSheets("plans", Math.ceil(n / atlas.per_sheet), requestDraw);
      await tween("wave", 1, 1900, easeInOut);
      await tween("rings", 1, 450);
      if (cancelled || reducedMotion()) return void (s.land = 1);
      await new Promise((resolve) => setTimeout(resolve, 350));
      if (cancelled) return;
      await tween("view", neighbourhood(), 1400, easeInOut);
      if (cancelled) return;
      showMode(s.kind);
      await tween("land", 1, 700);
    }, { threshold: 0.45 });
    observer.observe(box.current!);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [introKey, scale]);

  // wheel zoom only with a pinch or ctrl/cmd, so the page still scrolls normally over the map
  useEffect(() => {
    const c = canvas.current!;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = c.getBoundingClientRect();
      zoomAt(event.clientX - rect.left, event.clientY - rect.top, Math.exp(-event.deltaY * 0.01), false);
    };
    c.addEventListener("wheel", onWheel, { passive: false });
    return () => c.removeEventListener("wheel", onWheel);
  }, []);

  function zoomAt(sx: number, sy: number, factor: number, animated = true) {
    const [mx, my] = toMap(sx, sy);
    const k = clamp(s.view.k * factor, 1, MAX_ZOOM);
    const { w, h } = live.current.size;
    const next = keepInside({ x: mx - (sx - w / 2) / (base() * k), y: my - (sy - h / 2) / (base() * k), k });
    if (animated) tween("view", next, 450);
    else {
      s.tweens.delete("view");
      s.view = next;
      requestDraw();
    }
  }

  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  function hitTest(sx: number, sy: number) {
    if (s.plans > 0.5) {
      const t = s.tiles.find((t) => Math.abs(t.x - sx) <= t.size / 2 && Math.abs(t.y - sy) <= t.size / 2);
      return t ? t.index : -1;
    }
    let best = -1;
    let bestD = 81;
    const p = shown.current;
    for (let i = 0; i < n; i++) {
      const [x, y] = toScreen(p[2 * i], p[2 * i + 1]);
      const d = (x - sx) ** 2 + (y - sy) ** 2;
      if (d < bestD) [best, bestD] = [i, d];
    }
    return best;
  }

  function onPointerMove(event: React.PointerEvent) {
    const rect = canvas.current!.getBoundingClientRect();
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;
    if (drag.current && event.buttons) {
      const dx = sx - drag.current.x;
      const dy = sy - drag.current.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) drag.current.moved = true;
      drag.current.x = sx;
      drag.current.y = sy;
      s.tweens.delete("view");
      const k = base() * s.view.k;
      s.view = keepInside({ x: s.view.x - dx / k, y: s.view.y - dy / k, k: s.view.k });
      setTip(null);
      return requestDraw();
    }
    const index = hitTest(sx, sy);
    setTip(index >= 0 ? { x: sx, y: sy, index } : null);
    const rank = matchIndex.indexOf(index);
    setHoverRank(index >= 0 && rank >= 0 ? rank + 1 : null);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const step = 80 / (base() * s.view.k);
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[event.key]) {
      event.preventDefault();
      tween("view", keepInside({ ...s.view, x: s.view.x + moves[event.key][0], y: s.view.y + moves[event.key][1] }), 200);
    } else if (event.key === "+" || event.key === "=") zoomAt(size.w / 2, size.h / 2, 2);
    else if (event.key === "-") zoomAt(size.w / 2, size.h / 2, 0.5);
    else if (event.key === "0") tween("view", { ...WHOLE }, 700, easeInOut);
  }

  return (
    <div className="map" ref={box}>
      <canvas
        ref={canvas}
        style={{ width: size.w, height: size.h }}
        tabIndex={0}
        role="img"
        aria-label={label}
        onPointerDown={(event) => {
          const rect = canvas.current!.getBoundingClientRect();
          drag.current = { x: event.clientX - rect.left, y: event.clientY - rect.top, moved: false };
          canvas.current!.setPointerCapture(event.pointerId);
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerMove={onPointerMove}
        onPointerLeave={() => {
          setTip(null);
          setHoverRank(null);
        }}
        onDoubleClick={(event) => {
          const rect = canvas.current!.getBoundingClientRect();
          zoomAt(event.clientX - rect.left, event.clientY - rect.top, 2);
        }}
        onKeyDown={onKeyDown}
      />
      <div className="map-tools">
        <div className="segmented" role="group" aria-label="Show the plans as">
          <button type="button" aria-pressed={mode === "dots"} onClick={() => showMode("dots")}>Dots</button>
          <button type="button" aria-pressed={mode === "plans"} onClick={() => showMode("plans")}>Plans</button>
          <button type="button" aria-pressed={mode === "rooms"} onClick={() => showMode("rooms")}>Rooms</button>
        </div>
        <div className="segmented" role="group" aria-label="Zoom">
          <button type="button" aria-label="Zoom out" onClick={() => zoomAt(size.w / 2, size.h / 2, 0.5)}>
            <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6h8" /></svg>
          </button>
          <button type="button" aria-label="Zoom in" onClick={() => zoomAt(size.w / 2, size.h / 2, 2)}>
            <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6h8M6 2v8" /></svg>
          </button>
        </div>
        <button type="button" className="tool" onClick={() => tween("view", { ...WHOLE }, 900, easeInOut)}>All 5,000</button>
        {matches.length > 0 && (
          <button type="button" className="tool" onClick={() => tween("view", neighbourhood(), 1100, easeInOut)}>Your plan</button>
        )}
      </div>
      {tip && (
        <div className="tip" style={{ left: Math.min(tip.x + 14, size.w - 190), top: Math.max(tip.y - 58, 0) }}>
          <b>Plan {planNumber(atlas.ids[tip.index])}</b>
          <span>{planSource(atlas.ids[tip.index])}</span>
          {distances && <span>distance {distances[tip.index].toFixed(1)}</span>}
        </div>
      )}
    </div>
  );
}
