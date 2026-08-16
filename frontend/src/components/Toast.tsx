import { AnimatePresence, motion } from "motion/react";
import "./Toast.css";

export function Toast({ message }: { message: string | null }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          className="toast"
          role="alert"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
