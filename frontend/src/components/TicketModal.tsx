import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import "./TicketModal.css";

interface TicketModalProps {
  camperId: number;
  nombre: string;
  onClose: () => void;
}

export function TicketModal({ camperId, nombre, onClose }: TicketModalProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    let objectUrl: string | null = null;
    fetch(`/api/admin/registros/${camperId}/ticket`, { credentials: "include" })
      .then((res) => res.blob())
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setIsPdf(blob.type === "application/pdf");
        setSrc(objectUrl);
      });
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [camperId]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeBtnRef.current?.focus();
    document.body.style.overflow = "hidden";

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab" && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    <motion.div
      className="ticket-modal-backdrop"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      role="presentation"
    >
      <motion.div
        className="ticket-modal"
        onClick={(e) => e.stopPropagation()}
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Comprobante de ${nombre}`}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.97 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="ticket-modal-header">
          <span>Comprobante de {nombre}</span>
          <button className="ticket-modal-close" onClick={onClose} aria-label="Cerrar" ref={closeBtnRef}>
            ×
          </button>
        </div>
        <div className="ticket-modal-body">
          {!src && <span className="spinner spinner-light" />}
          {src && isPdf && <iframe title="Comprobante PDF" src={src} className="ticket-modal-pdf" />}
          {src && !isPdf && <img src={src} alt={`Comprobante de ${nombre}`} />}
        </div>
      </motion.div>
    </motion.div>
  );
}
