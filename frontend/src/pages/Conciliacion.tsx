import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { ConciliacionGrupo, pesos } from "../components/ConciliacionGrupo";
import type { ComprobanteDatos } from "../components/ComprobanteDatosForm";
import { HistorialLista } from "../components/ComprobanteHistorial";
import { Reveal } from "../components/Reveal";
import { SkeletonRow } from "../components/Skeleton";
import { StatTile } from "../components/StatTile";
import { TicketModal } from "../components/TicketModal";
import { Toast } from "../components/Toast";
import { CheckIcon, EquiposIcon, ReceiptIcon, SearchIcon, ShieldCheckIcon } from "../components/icons";
import { useAdminAuth } from "../lib/AdminAuthContext";
import {
  apiFetch,
  ApiError,
  type ComprobanteEvento,
  type ComprobanteMiembro,
  type ConciliacionGrupo as Grupo,
  type ConciliacionResponse,
  type ProcesarEstado,
} from "../lib/api";
import { destinoPorRol } from "../lib/roles";
import { useToast } from "../lib/useToast";
import "./Conciliacion.css";

/** Cada pestaña es un estado distinto: lo que tiene alertas nunca se mezcla con lo ya verificado. */
type Pestana = "revisar" | "sin_alertas" | "verificados" | "historial";
type Clase = "todos" | "individual" | "grupal";
type Motivo = "dinero" | "sin_leer" | "promocion" | "fecha";

const tieneAlerta = (g: Grupo, ...codigos: string[]) => g.alertas.some((a) => codigos.includes(a.codigo));

const PESTANAS: { id: Exclude<Pestana, "historial">; label: string; ayuda: string; test: (g: Grupo) => boolean }[] = [
  { id: "revisar", label: "Por revisar", ayuda: "Tienen una alerta: alguien debe mirarlos.", test: (g) => g.estado === "alerta" },
  { id: "sin_alertas", label: "Sin alertas", ayuda: "Todo cuadra, pero falta que una persona los apruebe.", test: (g) => g.estado === "ok" },
  { id: "verificados", label: "Verificados", ayuda: "Ya aprobados: pago verificado y sin copias.", test: (g) => g.estado === "revisado" },
];

const MOTIVOS: { id: Motivo; label: string; test: (g: Grupo) => boolean }[] = [
  { id: "dinero", label: "Falta dinero / repetidas", test: (g) => tieneAlerta(g, "FALTA_DINERO", "CAPTURA_REPETIDA") },
  { id: "sin_leer", label: "Sin leer", test: (g) => tieneAlerta(g, "SIN_LECTURA", "SIN_MONTO") },
  { id: "fecha", label: "Fecha no coincide", test: (g) => tieneAlerta(g, "FECHA_NO_COINCIDE") },
  { id: "promocion", label: "Promoción", test: (g) => tieneAlerta(g, "PROMOCION", "CUPON") },
];

const CLASES: { id: Clase; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "individual", label: "Individuales" },
  { id: "grupal", label: "En grupo" },
];

/** Menor = más urgente: problema → por revisar → sin alertas → ya revisados. */
function urgencia(g: Grupo): number {
  if (g.estado === "revisado") return 3;
  if (g.alertas.some((a) => a.nivel === "alta")) return 0;
  if (g.alertas.some((a) => a.nivel === "media")) return 1;
  return 2;
}

const aprobadoEn = (g: Grupo) => g.miembros.map((m) => m.comp_revisado_en ?? "").sort().at(-1) ?? "";

export function Conciliacion() {
  const { username, role, loading: authLoading } = useAdminAuth();
  const [data, setData] = useState<ConciliacionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [pestana, setPestana] = useState<Pestana>("revisar");
  const [clase, setClase] = useState<Clase>("todos");
  const [motivo, setMotivo] = useState<Motivo | null>(null);
  const [q, setQ] = useState("");
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [proceso, setProceso] = useState<ProcesarEstado | null>(null);
  const [eventos, setEventos] = useState<ComprobanteEvento[] | null>(null);
  const [ticketModal, setTicketModal] = useState<{ id: number; nombre: string } | null>(null);
  const [toast, setToast] = useToast();
  const sondeo = useRef<ReturnType<typeof setInterval> | null>(null);
  const reduce = useReducedMotion();

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

  const cargarHistorial = useCallback(async () => {
    try {
      setEventos(await apiFetch<ComprobanteEvento[]>("/admin/comprobantes/historial?limit=300"));
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "No se pudo cargar el historial.");
    }
  }, [setToast]);

  useEffect(() => {
    if (!authLoading && username && puede) cargar();
  }, [authLoading, username, puede, cargar]);

  useEffect(() => {
    if (pestana === "historial" && puede) cargarHistorial();
  }, [pestana, puede, cargarHistorial]);

  useEffect(() => () => {
    if (sondeo.current) clearInterval(sondeo.current);
  }, []);

  const grupos = data?.grupos ?? [];
  const delaPestana = useMemo(() => {
    const test = PESTANAS.find((p) => p.id === pestana)?.test;
    return test ? grupos.filter(test) : [];
  }, [grupos, pestana]);

  const conteos = useMemo(
    () => Object.fromEntries(PESTANAS.map((p) => [p.id, grupos.filter(p.test).length])) as Record<string, number>,
    [grupos]
  );
  const conteosClase = useMemo(
    () => ({
      todos: delaPestana.length,
      individual: delaPestana.filter((g) => g.clase === "individual").length,
      grupal: delaPestana.filter((g) => g.clase === "grupal").length,
    }),
    [delaPestana]
  );
  const porClase = useMemo(() => (clase === "todos" ? delaPestana : delaPestana.filter((g) => g.clase === clase)), [delaPestana, clase]);
  const conteosMotivo = useMemo(
    () => Object.fromEntries(MOTIVOS.map((m) => [m.id, porClase.filter(m.test).length])) as Record<Motivo, number>,
    [porClase]
  );

  const visibles = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const testMotivo = pestana === "revisar" && motivo ? MOTIVOS.find((m) => m.id === motivo)!.test : () => true;
    return porClase
      .filter(
        (g) =>
          testMotivo(g) &&
          (!needle ||
            g.miembros.some((m) =>
              [m.nombre, m.folio, m.iglesia, m.comp_referencia, m.comp_clave_rastreo].some((v) => v?.toLowerCase().includes(needle))
            ))
      )
      .sort((a, b) =>
        pestana === "verificados"
          ? aprobadoEn(b).localeCompare(aprobadoEn(a))
          : urgencia(a) - urgencia(b) || b.miembros.length - a.miembros.length
      );
  }, [porClase, pestana, motivo, q]);

  const eventosVisibles = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (eventos ?? []).filter((e) => !needle || e.nombre.toLowerCase().includes(needle) || e.folio.toLowerCase().includes(needle));
  }, [eventos, q]);

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
      setToast(g.estado === "revisado" ? "Datos guardados: el grupo volvió a «Por revisar»" : "Datos del comprobante guardados");
      return true;
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "No se pudieron guardar los datos.");
      return false;
    } finally {
      setOcupado(null);
    }
  }

  async function quitarAprobacion(g: Grupo, revisado: boolean, nota: string) {
    setOcupado(g.id);
    try {
      await apiFetch("/admin/comprobantes/revisado", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: g.miembros.map((m) => m.id), revisado, nota }),
      });
      await cargar();
      setToast(revisado ? "Marcado como revisado" : "Aprobación quitada: vuelve a su pestaña anterior");
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "No se pudo actualizar la revisión.");
    } finally {
      setOcupado(null);
    }
  }

  async function aprobar(g: Grupo, nota: string) {
    setOcupado(g.id);
    try {
      await apiFetch("/admin/comprobantes/aprobar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: g.miembros.map((m) => m.id), nota }),
      });
      await cargar();
      setToast("Pago aprobado y verificado. Lo encuentras en «Verificados».");
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "No se pudo aprobar el pago.");
    } finally {
      setOcupado(null);
    }
  }

  async function separar(m: ComprobanteMiembro, separado: boolean) {
    setOcupado(m.id);
    try {
      await apiFetch(`/admin/registros/${m.id}/comprobante/separar`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ separado }),
      });
      await cargar();
      setToast(separado ? `${m.nombre} ya no va con ese grupo` : `${m.nombre} puede volver a agruparse`);
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "No se pudo separar el registro.");
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
  const ayuda = PESTANAS.find((p) => p.id === pestana)?.ayuda;

  return (
    <div className="page-container conciliacion">
      <Reveal>
        <p className="eyebrow">Panel administrativo</p>
        <h1 className="display-title conciliacion-title">Conciliación de pagos</h1>
        <p className="muted conciliacion-sub">
          Cada comprobante se lee para sacar monto, fecha y referencia. Aquí ves quién comparte una transferencia, si el
          dinero alcanza, qué capturas se repiten y qué ya quedó verificado, con su historial por si luego hay dudas.
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
          <StatTile label="Por revisar" value={r?.grupos_con_alerta ?? "—"} tone="amarillo" icon={<ShieldCheckIcon size={18} />} />
          <StatTile
            label={r ? `Verificados (${r.verificados_individuales} indiv. · ${r.verificados_grupales} en grupo)` : "Verificados"}
            value={r?.grupos_revisados ?? "—"}
            tone="verde"
            icon={<CheckIcon size={18} />}
          />
          <StatTile
            label={r ? `Dinero leído (esperado ${pesos(r.dinero_esperado_centavos)})` : "Dinero leído"}
            value={r ? pesos(r.dinero_leido_centavos) : "—"}
            icon={<EquiposIcon size={18} />}
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
        <div className="conc-tabs" role="tablist" aria-label="Estado de los pagos">
          {PESTANAS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={pestana === p.id}
              className={`conc-tab ${pestana === p.id ? "is-active" : ""}`}
              onClick={() => {
                setPestana(p.id);
                setMotivo(null);
              }}
            >
              {p.label} <span className="mono">{conteos[p.id]}</span>
            </button>
          ))}
          <button
            type="button"
            role="tab"
            aria-selected={pestana === "historial"}
            className={`conc-tab ${pestana === "historial" ? "is-active" : ""}`}
            onClick={() => setPestana("historial")}
          >
            Historial
          </button>
        </div>

        {ayuda && <p className="muted conciliacion-ayuda">{ayuda}</p>}

        <div className="field">
          <label htmlFor="conc-q">
            <SearchIcon size={16} /> Buscar
          </label>
          <input
            id="conc-q"
            type="text"
            placeholder={pestana === "historial" ? "Nombre o folio" : "Nombre, folio, iglesia, referencia o clave de rastreo"}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {pestana !== "historial" && (
          <div className="conciliacion-filtros" role="group" aria-label="Individuales o en grupo">
            {CLASES.map((c) => (
              <button key={c.id} type="button" className={clase === c.id ? "is-active" : ""} aria-pressed={clase === c.id} onClick={() => setClase(c.id)}>
                {c.label} <span className="mono">{conteosClase[c.id]}</span>
              </button>
            ))}
          </div>
        )}

        {pestana === "revisar" && (
          <div className="conciliacion-filtros conciliacion-filtros--motivo" role="group" aria-label="Motivo de la alerta">
            {MOTIVOS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={motivo === f.id ? "is-active" : ""}
                aria-pressed={motivo === f.id}
                onClick={() => setMotivo(motivo === f.id ? null : f.id)}
              >
                {f.label} <span className="mono">{conteosMotivo[f.id]}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Solo animación de entrada, con la key en la pestaña real: el contenido cambia al instante y nunca
          depende de que termine una animación de salida (la trampa de PageTransition, ver CLAUDE.md). */}
      <m.div
        key={pestana}
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduce ? 0 : 0.22, ease: "easeOut" }}
      >
        {pestana === "historial" ? (
          <div className="conciliacion-historial glass-card">
            {eventos === null ? <p className="muted">Cargando historial…</p> : <HistorialLista eventos={eventosVisibles} mostrarPersona />}
          </div>
        ) : (
          <div className="conciliacion-lista">
            {primeraCarga && Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)}
            {!primeraCarga && visibles.length === 0 && (
              <div className="conciliacion-vacio">
                <p className="muted">
                  {q ? `Nada coincide con «${q}» en esta pestaña.` : "No hay pagos en esta pestaña con ese filtro."}
                </p>
              </div>
            )}
            {visibles.map((g, i) => (
              <m.div
                key={g.id}
                className="conciliacion-item"
                initial={reduce ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, ease: "easeOut", delay: reduce ? 0 : Math.min(i, 8) * 0.045 }}
              >
                <ConciliacionGrupo
                  grupo={g}
                  puedeVerificarPago={puede}
                  ocupado={ocupado === g.id || g.miembros.some((mm) => mm.id === ocupado)}
                  onVerComprobante={(mm) => setTicketModal({ id: mm.id, nombre: mm.nombre })}
                  onTogglePago={togglePago}
                  onGuardarDatos={guardarDatos}
                  onRevisado={quitarAprobacion}
                  onAprobar={aprobar}
                  onSeparar={separar}
                />
              </m.div>
            ))}
          </div>
        )}
      </m.div>

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
