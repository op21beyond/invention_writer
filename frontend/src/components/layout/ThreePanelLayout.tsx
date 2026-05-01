import { useCallback, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";

import { ChatPanel } from "../panels/ChatPanel";
import { PatentDocPanel } from "../panels/PatentDocPanel";
import { SharedDocPanel } from "../panels/SharedDocPanel";

const LS_KEY = "invention_writer_three_panel_splits_v1";
const GUTTER_PX = 10;
const MIN_PANE_PX = 196;
const SUM_FR = 1 + 1.15 + 1;
const DEF_S1 = 1 / SUM_FR;
const DEF_S2 = (1 + 1.15) / SUM_FR;

function loadSplits(): [number, number] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) {
      return [DEF_S1, DEF_S2];
    }
    const j = JSON.parse(raw) as unknown;
    if (Array.isArray(j) && j.length === 2 && typeof j[0] === "number" && typeof j[1] === "number") {
      return [j[0], j[1]];
    }
  } catch {
    /* ignore */
  }
  return [DEF_S1, DEF_S2];
}

function clampSplits(s1: number, s2: number, innerPx: number): [number, number] {
  const minFrac = MIN_PANE_PX / Math.max(innerPx, 1);
  if (innerPx < MIN_PANE_PX * 3 + 1) {
    return [DEF_S1, DEF_S2];
  }
  const lo = minFrac + 1e-4;
  let ns1 = Math.max(lo, Math.min(s1, 1 - 2 * lo));
  let ns2 = Math.max(ns1 + minFrac + 1e-4, Math.min(s2, 1 - lo));
  if (ns2 <= ns1 + minFrac || 1 - ns2 < lo) {
    return [DEF_S1, DEF_S2];
  }
  return [ns1, ns2];
}

export function ThreePanelLayout() {
  const containerRef = useRef<HTMLElement | null>(null);
  const [split, setSplit] = useState<[number, number]>(loadSplits);
  const splitRef = useRef(split);
  splitRef.current = split;
  const [innerPx, setInnerPx] = useState(1200);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") {
      const w = (containerRef.current?.offsetWidth ?? 1200) - 2 * GUTTER_PX;
      const iw = Math.max(480, w);
      setInnerPx(iw);
      setSplit(([a, b]) => clampSplits(a, b, iw));
      return;
    }

    function apply() {
      const node = containerRef.current;
      if (!node) {
        return;
      }
      const w = Math.max(480, node.offsetWidth - 2 * GUTTER_PX);
      setInnerPx(w);
      setSplit(([a, b]) => clampSplits(a, b, w));
    }

    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const dragRef = useRef<{
    which: 1 | 2;
    startClientX: number;
    base: [number, number];
  } | null>(null);

  const persist = useCallback((pair: [number, number]) => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(pair));
    } catch {
      /* ignore */
    }
  }, []);

  const startDrag = useCallback(
    (which: 1 | 2) => (event: ReactMouseEvent) => {
      event.preventDefault();

      dragRef.current = {
        which,
        startClientX: event.clientX,
        base: [splitRef.current[0], splitRef.current[1]],
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const move = (ev: globalThis.MouseEvent) => {
        const d = dragRef.current;
        if (!d) {
          return;
        }
        const el = containerRef.current;
        const iw = Math.max(480, (el?.offsetWidth ?? 1200) - 2 * GUTTER_PX);
        const dx = ev.clientX - d.startClientX;
        const frac = iw > 0 ? dx / iw : 0;
        const ns1 = d.which === 1 ? d.base[0] + frac : d.base[0];
        const ns2 = d.which === 2 ? d.base[1] + frac : d.base[1];
        setSplit(clampSplits(ns1, ns2, iw));
      };

      const up = () => {
        dragRef.current = null;
        document.body.style.removeProperty("cursor");
        document.body.style.removeProperty("user-select");
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);

        const el = containerRef.current;
        const iw = Math.max(480, (el?.offsetWidth ?? 1200) - 2 * GUTTER_PX);
        setSplit((prev) => {
          const next = clampSplits(prev[0], prev[1], iw);
          persist(next);
          return next;
        });
      };

      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    },
    [persist],
  );

  const w1 = Math.round(split[0] * innerPx);
  const w2 = Math.round((split[1] - split[0]) * innerPx);
  const w3 = Math.max(MIN_PANE_PX, innerPx - w1 - w2);

  return (
    <main ref={containerRef} className="layout layout--resizable">
      <div className="layout-pane" style={{ flex: `0 0 ${w1}px`, width: `${w1}px`, minWidth: MIN_PANE_PX }}>
        <ChatPanel />
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="패널 너비 조절 (에이전트 대화와 공유 문서)"
        className="layout-splitter"
        onMouseDown={startDrag(1)}
      />
      <div className="layout-pane" style={{ flex: `0 0 ${w2}px`, width: `${w2}px`, minWidth: MIN_PANE_PX }}>
        <SharedDocPanel />
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="패널 너비 조절 (공유 문서와 발명신고서)"
        className="layout-splitter"
        onMouseDown={startDrag(2)}
      />
      <div className="layout-pane layout-pane--grow" style={{ flex: `1 1 ${w3}px`, minWidth: MIN_PANE_PX }}>
        <PatentDocPanel />
      </div>
    </main>
  );
}
