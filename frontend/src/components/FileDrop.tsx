import { useRef, useState, type DragEvent } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { ReceiptIcon, UploadIcon } from "./icons";
import "./FileDrop.css";

interface FileDropProps {
  file: File | null;
  onChange: (file: File | null) => void;
  error?: string;
}

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_BYTES = 8 * 1024 * 1024;

export function FileDrop({ file, onChange, error }: FileDropProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const reduce = useReducedMotion();

  function handleFile(f: File | null) {
    setLocalError(null);
    if (!f) {
      onChange(null);
      setPreview(null);
      return;
    }
    if (!ACCEPTED.includes(f.type)) {
      setLocalError("Ese archivo no es válido. Usa JPG, PNG, WEBP o PDF.");
      onChange(null);
      setPreview(null);
      return;
    }
    if (f.size > MAX_BYTES) {
      setLocalError("El archivo pesa más de 8MB. Comprímelo e inténtalo de nuevo.");
      onChange(null);
      setPreview(null);
      return;
    }
    onChange(f);
    setPreview(f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files?.[0] ?? null);
  }

  const shownError = error ?? localError ?? undefined;

  return (
    <div className={`field span-2 ${shownError ? "has-error" : ""}`}>
      <label>
        <ReceiptIcon size={14} /> Comprobante de pago
      </label>
      <div
        className={`file-drop ${dragging ? "is-dragging" : ""} ${file ? "has-file" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        role="button"
        tabIndex={0}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          hidden
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />
        <AnimatePresence mode="wait">
          {preview ? (
            <motion.div
              key="preview"
              className="file-drop-preview-wrap"
              initial={reduce ? { opacity: 1 } : { opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            >
              <img src={preview} alt="Vista previa del comprobante" className="file-drop-preview" />
            </motion.div>
          ) : file ? (
            <motion.p
              key="filename"
              initial={reduce ? { opacity: 1 } : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="file-drop-filename"
            >
              📄 {file.name}
            </motion.p>
          ) : (
            <motion.div key="empty" initial={false}>
              <UploadIcon size={26} />
              <p>Arrastra tu comprobante aquí o haz clic para elegirlo</p>
              <span className="muted">JPG, PNG, WEBP o PDF · máx. 8MB</span>
            </motion.div>
          )}
        </AnimatePresence>
        {file && (
          <button
            type="button"
            className="file-drop-remove"
            onClick={(e) => {
              e.stopPropagation();
              handleFile(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
          >
            Quitar archivo
          </button>
        )}
      </div>
      {shownError && <span className="field-error">{shownError}</span>}
    </div>
  );
}
