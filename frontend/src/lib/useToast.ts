import { useEffect, useState } from "react";

/**
 * Mensaje efímero de feedback (error de una acción, confirmación breve).
 * Extraído del patrón que AdminPanel.tsx ya usaba in-line para reutilizarlo
 * también en AdminUsers.tsx — ver components/Toast.tsx para el render.
 */
export function useToast(durationMs = 3200) {
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), durationMs);
    return () => clearTimeout(t);
  }, [toast, durationMs]);

  return [toast, setToast] as const;
}
