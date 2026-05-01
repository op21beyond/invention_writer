import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { listActionBarFeedRows } from "../../lib/actionBarConversationDigest";

const STREAM_AGENT_TAG: Record<string, string> = {
  agent0: "구조화",
  agent1: "초안",
  agent2: "확장",
  agent3: "심사",
  search: "검색",
  system: "시스템",
  human: "사람",
};

type Props = {
  conversationLog: unknown;
  streamingLine?: { agentId: string; text: string } | null;
};

function hashLine(s: string): string {
  let h = 0;
  for (let i = 0; i < Math.min(s.length, 400); i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return String(h);
}

/** 새 줄이 바뀔 때마다 시간 기반으로 글자가 채워지는 효과(백엔드 토큰 스트림 없이도 ‘흘러가는’ 느낌). */
function useStreamReveal(fullText: string, animKey: string, maxMs = 900): string {
  const [shown, setShown] = useState(fullText);

  useEffect(() => {
    if (!animKey) {
      setShown(fullText);
      return;
    }

    setShown("");
    const t0 = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const elapsed = now - t0;
      const t = Math.min(1, elapsed / maxMs);
      const len = Math.max(0, Math.floor(fullText.length * t));
      setShown(fullText.slice(0, len));
      if (len < fullText.length) {
        raf = requestAnimationFrame(tick);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animKey, fullText, maxMs]);

  return shown;
}

export function ActionBarLiveStream({ conversationLog, streamingLine }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => listActionBarFeedRows(conversationLog, 5), [conversationLog]);

  const pastRows = rows.length <= 1 ? [] : rows.slice(0, -1);
  const latest = rows[rows.length - 1];

  const animKey = latest ? `${latest.logIndex}:${hashLine(latest.line)}` : "";
  const typedLatest = useStreamReveal(latest?.line ?? "", animKey);

  const streamVisible =
    streamingLine && streamingLine.text.length > 0
      ? streamingLine.text.length > 3000
        ? `…${streamingLine.text.slice(-3000)}`
        : streamingLine.text
      : "";

  const fullDigest = useMemo(() => {
    const base = rows.map((r) => r.line).join("  ·  ");
    if (streamVisible) {
      return `${base}  |  스트림 ${streamVisible.slice(0, 120)}…`.trim();
    }
    return base;
  }, [rows, streamVisible]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [rows.length, typedLatest.length, streamVisible.length]);

  if (rows.length === 0 && !streamVisible) {
    return (
      <p className="action-bar-live__text action-bar-live__text--empty">
        아직 대화 로그가 없습니다. 「다음 단계」로 시작하면 에이전트 메시지가 여기에 실시간으로 이어집니다.
      </p>
    );
  }

  const revealDone = latest ? typedLatest.length >= latest.line.length : true;

  return (
    <div className="action-bar-live__inner" title={fullDigest}>
      <div
        ref={scrollRef}
        className="action-bar-live__scroll"
        role="log"
        aria-relevant="additions text"
        aria-label="최근 에이전트·시스템 메시지(아래가 최신)"
      >
        {pastRows.map((r) => (
          <div key={r.logIndex} className="action-bar-live__row action-bar-live__row--past">
            {r.line}
          </div>
        ))}
        {latest ? (
          <div className="action-bar-live__row action-bar-live__row--latest">
            <span>{typedLatest}</span>
            {!revealDone ? <span className="action-bar-live__caret" aria-hidden /> : null}
          </div>
        ) : null}
        {streamVisible && streamingLine ? (
          <div className="action-bar-live__row action-bar-live__row--streaming">
            <span className="action-bar-live__stream-tag">
              「{STREAM_AGENT_TAG[streamingLine.agentId] ?? streamingLine.agentId}」
            </span>
            <span>{streamVisible}</span>
            <span className="action-bar-live__caret" aria-hidden />
          </div>
        ) : null}
      </div>
    </div>
  );
}
