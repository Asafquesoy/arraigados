import { motion } from "motion/react";
import "./StepProgress.css";

interface StepProgressProps {
  steps: string[];
  current: number; // 0-indexed
}

export function StepProgress({ steps, current }: StepProgressProps) {
  return (
    <ol className="step-progress" aria-label="Progreso del formulario">
      {steps.map((label, i) => {
        const state = i < current ? "done" : i === current ? "active" : "pending";
        return (
          <li key={label} className={`step-progress-item is-${state}`}>
            <span className="step-progress-dot">
              {state === "done" ? (
                "✓"
              ) : (
                <motion.span
                  className="step-progress-dot-inner"
                  animate={state === "active" ? { scale: [1, 1.25, 1] } : { scale: 1 }}
                  transition={{ duration: 1.6, repeat: state === "active" ? Infinity : 0, ease: "easeInOut" }}
                />
              )}
            </span>
            <span className="step-progress-label">{label}</span>
            {i < steps.length - 1 && (
              <span className="step-progress-line">
                <motion.span
                  className="step-progress-line-fill"
                  initial={false}
                  animate={{ scaleX: i < current ? 1 : 0 }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
