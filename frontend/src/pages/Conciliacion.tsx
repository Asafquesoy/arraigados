import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { AnimatePresence } from "motion/react";
import { ConciliacionGrupo, pesos } from "../components/ConciliacionGrupo";
import type { ComprobanteDatos } from "../components/ComprobanteDatosForm";
import { Reveal } from "../components/Reveal";
import { SkeletonRow } from "../components/Skeleton";
import { StatTile } from "../components/StatTile";
import { TicketModal } from "../components/TicketModal";
import { Toast } from "../components/Toast";
import { CheckIcon, ReceiptIcon, SearchIcon, ShieldCheckIcon } from "../components/icons";
import { useAdminAuth } from "../lib/AdminAuthContext";
import {
  apiFetch,
  ApiError,
  type ComprobanteMiembro,
  type ConciliacionGrupo as Grupo,
  type ConciliacionResponse,
  type ProcesarEstado,
} from "../lib/api";
import { destinoPorRol } from "../lib/roles";
import { useToast } from "../lib/useToast";
import "./Conciliacion.css";

type Filtro = "alerta" | "compartidos" | "dinero" | "sin_leer" | "promocion" | "revisados" | "todos";

const tieneAlerta = (g: Grupo, ...codigos: string[]) => g.alertas.some((a) => codigos.includes(a.codigo));

const FILTROS: { id: Filtro; label: string; test: (g: Grupo) => boolean }[] = [
  { id: "alerta", label: "Con alerta", test: (g) => g.estado === "alerta" },
  { id: "compartidos", label: "Comparten comprobante", test: (g) => g.miembros.length > 1 },
  { id: "dinero", label: "Falta dinero / repetidas", test: (g) => tieneAlerta(g, "FALTA_DINERO", "CAPTURA_REPETIDA") },
  { id: "sin_leer", label: "Sin leer", test: (g) => tieneAlerta(g, "SIN_LECTURA", "SIN_MONTO") },
  { id: "promocion", label: "Promoción", test: (g) => tieneAlerta(g, "PROMOCION", "CUPON") },
  { id: "revisados", label: "Revisados", test: (g) => g.estado === "revisado" },
  { id: "todos", label: "Todos", test: () => true },
];

export function Conciliacion() {
  const { username, role, loading: authLoading } = useAdminAuth();
  const [data, setData] = useState<ConciliacionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>("alerta");
  const [q, setQ] = useState("");
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [proceso, setProceso] = useState<ProcesarEstado | null>(null);
  const [ticketModal, setTicketModal] = useState<{ id: number; nombre: string } | null>(null);
  const [toast, setToast] = useToast();
  const sondeo = useRef<ReturnType<typeof setInterval> | null>(null);

  const puede = role === "ADMIN" || role === "VERIFICADOR_PAGO";

  const cargar = useCallback(async () => {
    try {
      setData(await apiFetch<ConciliacionResponse>("/admin/conciliacion"));
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "No se pudo cargar la conciliación.");
    } finally {
      setLoading(false);
    }
  }, [setToast]);

  useEffect(() => {
    if (!authLoading && username && puede) cargar();
  }, [authLoading, username, puede, cargar]);

  useEffect(() => () => {
    if (sondeo.current) clearInterval(sondeo.current);
  }, []);

  const grupos = data?.grupos ?? [];
  const conteos = useMemo(
    () => Object.fromEntries(FILTROS.map((f) => [f.id, grupos.filter(f.test).length])) as Record<Filtro, number>,
    [grupos]
  );
  const visibles = useMemo(() => {
    const test = FILTROS.find((f) => f.id === filtro)!.test;
    const needle = q.trim().toLowerCase();
    return grupos.filter(
      (g) =>
        test(g) &&
        (!needle ||
          g.miembros.some((m) =>
            [m.nombre, m.folio, m.iglesia, m.comp_referencia, m.comp_clave_rastreo].some((v) => v?.toLowerCase().includes(needle))
          ))
    );
  }, [grupos, filtro, q]);

  if (!authLoading && !username) return <Navigate to="/admin" replace />;
  if (!authLoading && username && !puede) return <Navigate to={destinoPorRol(role)} replace />;

  async function togglePago(m: ComprobanteMiembro, verificado: boolean) {
    const poner = (valor: boolean) =>
      setData((prev) =>
        prev
          ? {
              ...prev,
              grupos: prev.grupos.map((g) => ({
                ...g,
                miembros: g.miembros.map((x) => (x.id === m.id ? { ...x, pago_verificado: valor } : x)),
              })),
            }
          : prev
      );
    poner(verificado); // optimista, igual que togglePago en AdminPanel.tsx
    try {
      await apiFetch(`/admin/registros/${m.id}/pago`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verificado }),
      });
    } catch (err) {
      poner(!verificado);
      setToast(err instanceof ApiError ? err.message : "No se pudo actualizar el pago.");
    }
  }

  async function guardarDatos(g: Grupo, datos: ComprobanteDatos): Promise<boolean> {
    setOcupado(g.id);
    try {
      // Misma transferencia → mismos datos para todos los miembros del grupo.
      await Promise.all(
        g.miembros.map((m) =>
          apiFetch(`/admin/registros/${m.id}/comprobante`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(datos),
          })
        )
      );
      await cargar();
      setToast("Datos del comprobante guardados");
      return true;
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "No se pudieron guardar los datos.");
      return false;
    } finally {
      setOcupado(null);
    }
  }

  async function marcarRevisado(g: Grupo, revisado: boolean, nota: string) {
    setOcupado(g.id);
    try {
      await apiFetch("/admin/comprobantes/revisado", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: g.miembros.map((m) => m.id), revisado, nota }),
      });
      await cargar();
      setToast(revisado ? "Marcado como revisado" : "Ya no está marcado como revisado");
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "No se pudo actualizar la revisión.");
    } finally {
      setOcupado(null);
    }
  }

  async function leerPendientes() {
    try {
      setProceso(await apiFetch<ProcesarEstado>("/admin/comprobantes/procesar", { method: "POST" }));
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "No se pudo iniciar la lectura.");
      return;
    }
    if (sondeo.current) clearInterval(sondeo.current);
    sondeo.current = setInterval(async () => {
      try {
        const e = await apiFetch<ProcesarEstado>("/admin/comprobantes/procesar/estado");
        setProceso(e);
        if (!e.corriendo) {
          if (sondeo.current) clearInterval(sondeo.current);
          await cargar();
          setToast(e.error ? "La lectura terminó con errores." : "Lectura terminada");
        }
      } catch {
        if (sondeo.current) clearInterval(sondeo.current);
      }
    }, 2000);
  }

  const r = data?.resumen;
  const leyendo = proceso?.corriendo ?? false;
  const primeraCarga = loading && data === null;
  const ticketMiembro = ticketModal
    ? grupos.flatMap((g) => g.miembros).find((m) => m.id === ticketModal.id)
    : undefined;

  return (
    <div className="page-container conciliacion">
      <Reveal>
        <p className="eyebrow">Panel administrativo</p>
        <h1 className="display-title conciliacion-title">Conciliación de pagos</h1>
        <p className="muted conciliacion-sub">
          Cada comprobante se lee para sacar monto, fecha y referencia. Aquí ves quién comparte una transferencia, si el
          dinero alcanza para todas las inscripciones y qué capturas se repiten.
        </p>
      </Reveal>

      <Reveal delay={0.06}>
        <div className="conciliacion-stats">
          <StatTile
            label="Comprobantes leídos"
            value={r ? `${r.leidos}/${r.con_comprobante}` : "—"}
            tone="verde"
            icon={<ReceiptIcon size={18} />}
          />
          <StatTile label="Grupos con alerta" value={r?.grupos_con_alerta ?? "—"} tone="amarillo" icon={<ShieldCheckIcon size={18} />} />
          <StatTile label="Comparten comprobante" value={r?.grupos_compartidos ?? "—"} icon={<CheckIcon size={18} />} />
          <StatTile
            label={r ? `Dinero leído (esperado ${pesos(r.dinero_esperado_centavos)})` : "Dinero leído"}
            value={r ? pesos(r.dinero_leido_centavos) : "—"}
            icon={<ReceiptIcon size={18} />}
          />
        </div>
      </Reveal>

      <div className="conciliacion-lector glass-card">
        <div>
          <p className="conciliacion-lector-titulo">
            {r?.sin_leer ? `${r.sin_leer} comprobante(s) sin leer` : "Todos los comprobantes están leídos"}
          </p>
          <p className="muted conciliacion-lector-sub">
            {r?.lector === "gemini"
              ? "Lector: IA gratuita (Gemini) con respaldo local."
              : "Lector: solo local (sin IA). Puede equivocarse: corrige a mano lo que no cuadre."}
          </p>
          {leyendo && proceso && (
            <p className="conciliacion-progreso" role="status">
              Leyendo {proceso.hechos} de {proceso.total}…
            </p>
          )}
        </div>
        <button type="button" className="btn btn-primary" disabled={leyendo} onClick={leerPendientes}>
          {leyendo ? "Leyendo…" : "Leer comprobantes pendientes"}
        </button>
      </div>

      <div className="conciliacion-controles glass-card">
        <div className="field">
          <label htmlFor="conc-q">
            <SearchIcon size={16} /> Buscar
          </label>
          <input
            id="conc-q"
            type="text"
            placeholder="Nombre, folio, iglesia, referencia o clave de rastreo"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="conciliacion-filtros" role="group" aria-label="Filtrar grupos">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={filtro === f.id ? "is-active" : ""}
              aria-pressed={filtro === f.id}
              onClick={() => setFiltro(f.id)}
            >
              {f.label} <span className="mono">{conteos[f.id]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="conciliacion-lista">
        {primeraCarga && Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)}
        {!primeraCarga && visibles.length === 0 && (
          <div className="conciliacion-vacio">
            <p className="muted">
              {q ? `Nada coincide con «${q}» en este filtro.` : "No hay grupos en este filtro."}
            </p>
          </div>
        )}
        {visibles.map((g) => (
          <ConciliacionGrupo
            key={g.id}
            grupo={g}
            puedeVerificarPago={puede}
            ocupado={ocupado === g.id}
            onVerComprobante={(m) => setTicketModal({ id: m.id, nombre: m.nombre })}
            onTogglePago={togglePago}
            onGuardarDatos={guardarDatos}
            onRevisado={marcarRevisado}
          />
        ))}
      </div>

      <AnimatePresence>
        {ticketModal && (
          <TicketModal
            camperId={ticketModal.id}
            nombre={ticketModal.nombre}
            onClose={() => setTicketModal(null)}
            verificado={ticketMiembro?.pago_verificado ?? false}
            puedeVerificar={puede}
            onToggleVerificado={(c) => ticketMiembro && togglePago(ticketMiembro, c)}
          />
        )}
      </AnimatePresence>

      <Toast message={toast} />
    </div>
  );
}
