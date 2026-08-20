import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { ConfirmButton } from "../components/ConfirmButton";
import { Reveal } from "../components/Reveal";
import { SkeletonRow } from "../components/Skeleton";
import { StatTile } from "../components/StatTile";
import { Toast } from "../components/Toast";
import { TIPO_LABEL } from "../components/TipoParticipanteField";
import { ZONA_LABEL } from "../components/ZonaField";
import { CheckIcon, ReceiptIcon, SearchIcon, ShieldCheckIcon } from "../components/icons";
import { useAdminAuth } from "../lib/AdminAuthContext";
import { apiFetch, ApiError, type AsistenciaStats, type CamperListResponse, type CamperOut } from "../lib/api";
import { useSettings } from "../lib/SettingsContext";
import { useToast } from "../lib/useToast";
import "./Recepcion.css";

const PAGE_SIZE = 25;

type FiltroAsistencia = "false" | "true" | "";

export function Recepcion() {
  const { username, loading: authLoading } = useAdminAuth();
  const { showShirtSize } = useSettings();

  const [data, setData] = useState<CamperListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<FiltroAsistencia>("false");
  const [page, setPage] = useState(1);
  const [stats, setStats] = useState<AsistenciaStats | null>(null);
  const [toast, setToast] = useToast();

  function buildQuery() {
    const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
    if (q) params.set("q", q);
    if (filtro) params.set("asistio", filtro);
    return params;
  }

  async function fetchData() {
    setLoading(true);
    try {
      const res = await apiFetch<CamperListResponse>(`/admin/registros?${buildQuery()}`);
      setData(res);
    } finally {
      setLoading(false);
    }
  }

  async function fetchStats() {
    try {
      const res = await apiFetch<AsistenciaStats>("/admin/stats/asistencia");
      setStats(res);
    } catch {
      /* las tarjetas de arriba se quedan vacías si falla — no es bloqueante */
    }
  }

  useEffect(() => {
    if (!authLoading && username) {
      fetchData();
      fetchStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, username, page]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (page !== 1) setPage(1);
      else if (!authLoading && username) fetchData();
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, filtro]);

  if (!authLoading && !username) {
    return <Navigate to="/admin" replace />;
  }

  async function marcarAsistencia(camper: CamperOut, asistio: boolean) {
    // Optimista, mismo patrón que togglePago en AdminPanel.tsx: refleja de
    // inmediato y revierte si el PATCH falla.
    setData((prev) =>
      prev ? { ...prev, items: prev.items.map((c) => (c.id === camper.id ? { ...c, asistio } : c)) } : prev
    );
    try {
      const updated = await apiFetch<CamperOut>(`/admin/registros/${camper.id}/asistencia`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asistio }),
      });
      setData((prev) =>
        prev ? { ...prev, items: prev.items.map((c) => (c.id === camper.id ? updated : c)) } : prev
      );
      setToast(asistio ? `✓ ${updated.nombre} registrado` : `${updated.nombre} vuelve a estar pendiente`);
      fetchStats();
    } catch (err) {
      setData((prev) =>
        prev ? { ...prev, items: prev.items.map((c) => (c.id === camper.id ? { ...c, asistio: !asistio } : c)) } : prev
      );
      setToast(err instanceof ApiError ? err.message : "No se pudo registrar la llegada. Intenta de nuevo.");
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  // Solo la carga inicial (sin datos previos) muestra el skeleton — las búsquedas
  // posteriores mantienen la lista anterior en pantalla mientras llega la
  // respuesta, para no reemplazarla por skeletons y luego por el mensaje vacío
  // (ese doble cambio de alto es lo que hacía "brincar" la pantalla al escribir).
  const isInitialLoad = loading && data === null;

  return (
    <div className="page-container recepcion">
      <Reveal>
        <p className="eyebrow">Panel administrativo</p>
        <h1 className="display-title recepcion-title">Recepción</h1>
        <p className="muted recepcion-sub">Busca al campero y marca su llegada.</p>
      </Reveal>

      <Reveal delay={0.06}>
        <div className="recepcion-stats">
          <StatTile label="Ya llegaron" value={stats?.asistieron ?? "—"} tone="verde" icon={<CheckIcon size={18} />} />
          <StatTile label="Faltan por llegar" value={stats?.faltan ?? "—"} tone="amarillo" icon={<SearchIcon size={18} />} />
          <StatTile label="Total registrados" value={stats?.total ?? "—"} icon={<ReceiptIcon size={18} />} />
        </div>
      </Reveal>

      <div className="recepcion-search glass-card">
        <div className="field">
          <label htmlFor="recepcion-q">
            <SearchIcon size={16} /> Buscar campero
          </label>
          <div className="recepcion-search-row">
            <input
              id="recepcion-q"
              type="text"
              autoFocus
              placeholder="Escribe un nombre, iglesia, ciudad, teléfono o folio"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {q && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setQ("")}>
                Borrar
              </button>
            )}
          </div>
        </div>

        <div className="recepcion-segmented" role="group" aria-label="Filtrar por asistencia">
          <button
            type="button"
            className={filtro === "false" ? "is-active" : ""}
            onClick={() => setFiltro("false")}
          >
            Faltan por llegar
          </button>
          <button type="button" className={filtro === "true" ? "is-active" : ""} onClick={() => setFiltro("true")}>
            Ya llegaron
          </button>
          <button type="button" className={filtro === "" ? "is-active" : ""} onClick={() => setFiltro("")}>
            Todos
          </button>
        </div>
      </div>

      <div className="recepcion-list">
        {isInitialLoad && Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)}

        {!isInitialLoad && !q && data?.items.length === 0 && (
          <div className="recepcion-empty">
            <SearchIcon size={32} className="recepcion-empty-icon" />
            <p className="muted">Escribe arriba para buscar al campero.</p>
          </div>
        )}

        {!isInitialLoad && q && data?.items.length === 0 && (
          <div className="recepcion-empty">
            <p className="muted">
              No encontramos a nadie con «{q}». Revisa cómo se escribe el nombre o busca por iglesia.
            </p>
          </div>
        )}

        {!isInitialLoad &&
          data?.items.map((camper) => (
              <div
                key={camper.id}
                className={`glass-card recepcion-card ${camper.asistio ? "recepcion-card--llego" : ""}`}
              >
                <div className="recepcion-card-info">
                  <p className="recepcion-card-name">{camper.nombre}</p>
                  <p className="mono muted recepcion-card-folio">{camper.folio}</p>

                  <div className="recepcion-card-chips">
                    <span className="recepcion-chip">{camper.tipo ? TIPO_LABEL[camper.tipo] : "—"}</span>
                    <span className="recepcion-chip">
                      {camper.edad} años · {camper.sexo === "M" ? "Masculino" : "Femenino"}
                    </span>
                    <span className="recepcion-chip">{camper.iglesia}</span>
                    {camper.ciudad && <span className="recepcion-chip">{camper.ciudad}</span>}
                    {camper.zona && <span className="recepcion-chip">{ZONA_LABEL[camper.zona]}</span>}
                    {camper.telefono && <span className="recepcion-chip mono">{camper.telefono}</span>}
                    {showShirtSize && camper.talla_camisa && (
                      <span className="recepcion-chip">
                        Talla {camper.talla_camisa === "OTRA" ? camper.talla_otra || "Otra" : camper.talla_camisa}
                      </span>
                    )}
                    {camper.equipo && (
                      <span className="recepcion-chip" style={{ borderColor: camper.equipo.color }}>
                        {camper.equipo.nombre}
                      </span>
                    )}
                    <span className={`recepcion-chip ${camper.pago_verificado ? "recepcion-chip--verde" : "recepcion-chip--ambar"}`}>
                      <ShieldCheckIcon size={13} /> {camper.pago_verificado ? "Pago verificado" : "Pago pendiente"}
                    </span>
                  </div>
                </div>

                <div className="recepcion-card-action">
                  {camper.asistio ? (
                    <div className="recepcion-card-llego-row">
                      <p
                        className="recepcion-card-llego"
                        title={
                          camper.asistio_en
                            ? `${new Date(camper.asistio_en).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}${camper.asistio_por ? ` · registró ${camper.asistio_por}` : ""}`
                            : undefined
                        }
                      >
                        <CheckIcon size={16} /> Llegó
                      </p>
                      <ConfirmButton
                        label="Deshacer"
                        confirmLabel="¿Seguro?"
                        className="btn-sm"
                        onConfirm={() => marcarAsistencia(camper, false)}
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary recepcion-marcar-btn"
                      onClick={() => marcarAsistencia(camper, true)}
                    >
                      <CheckIcon size={20} /> Marcar llegada
                    </button>
                  )}
                </div>
              </div>
          ))}
      </div>

      {data && totalPages > 1 && (
        <div className="recepcion-pagination">
          <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ← Anterior
          </button>
          <span className="muted mono">
            Página {page} de {totalPages}
          </span>
          <button className="btn btn-ghost" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Siguiente →
          </button>
        </div>
      )}

      <Toast message={toast} />
    </div>
  );
}
