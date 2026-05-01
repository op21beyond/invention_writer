import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

type DetailModalProps = {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
};

const MIN_W = 300;
const MIN_H = 200;

export function DetailModal({ title, open, onClose, children, footer }: DetailModalProps) {
  const [size, setSize] = useState({ w: 720, h: 580 });
  const sizeRef = useRef(size);
  sizeRef.current = size;

  const dragRef = useRef<{
    pointerId: number;
    originX: number;
    originY: number;
    startW: number;
    startH: number;
  } | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    setSize({
      w: Math.min(760, Math.floor(vw * 0.9)),
      h: Math.min(620, Math.floor(vh * 0.8)),
    });
  }, [open]);

  const endDrag = useCallback(() => {
    dragRef.current = null;
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) {
        return;
      }
      const vw = window.innerWidth - 16;
      const vh = window.innerHeight - 16;
      const nw = Math.min(vw, Math.max(MIN_W, d.startW + (e.clientX - d.originX)));
      const nh = Math.min(vh, Math.max(MIN_H, d.startH + (e.clientY - d.originY)));
      setSize({ w: Math.round(nw), h: Math.round(nh) });
    };
    const onUp = (e: PointerEvent) => {
      if (dragRef.current && e.pointerId === dragRef.current.pointerId) {
        endDrag();
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [open, endDrag]);

  const onResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const s = sizeRef.current;
    dragRef.current = {
      pointerId: e.pointerId,
      originX: e.clientX,
      originY: e.clientY,
      startW: s.w,
      startH: s.h,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div aria-modal className="detail-modal-root" role="presentation">
      <button
        aria-label="닫기"
        className="detail-modal-backdrop"
        type="button"
        onClick={onClose}
      />
      <div
        className="detail-modal-dialog"
        role="dialog"
        aria-labelledby="detail-modal-title"
        style={{
          width: size.w,
          height: size.h,
        }}
      >
        <header className="detail-modal-header">
          <h2 className="detail-modal-title" id="detail-modal-title">
            {title}
          </h2>
          <button className="detail-modal-close" type="button" onClick={onClose}>
            닫기
          </button>
        </header>
        <div className="detail-modal-body">{children}</div>
        {footer ? <div className="detail-modal-footer">{footer}</div> : null}
        <div
          aria-label="창 크기 조절"
          className="detail-modal-resize-handle"
          onPointerDown={onResizePointerDown}
          role="separator"
        />
      </div>
    </div>,
    document.body,
  );
}
