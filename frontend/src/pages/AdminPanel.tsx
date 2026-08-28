import { Fragment, useEffect, useRef, useState, type CSSProperties } from "react";
import { Navigate } from "react-router-dom";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { AdminAjustes } from "../components/AdminAjustes";
import { AdminComprobanteStats } from "../components/AdminComprobanteStats";
import { AdminRegistroToggle } from "../components/AdminRegistroToggle";
import { AdminResumen } from "../components/AdminResumen";
import { AdminShirtStats } from "../components/AdminShirtStats";
import { ConfirmButton } from "../components/ConfirmButton";
import { EditarCamperModal } from "../components/EditarCamperModal";
import { Reveal } from "../components/Reveal";
import { SkeletonRow } from "../components/Skeleton";
import { StatTile } from "../components/StatTile";
import { TicketModal } from "../components/TicketModal";
import { Toast } from "../components/Toast";
import { ToggleSwitch } from "../components/ToggleSwitch";
import { TIPO_LABEL } from "../components/TipoParticipanteField";
import { ZONA_LABEL } from "../components/ZonaField";
import { ChevronDownIcon, DownloadIcon, PencilIcon, ReceiptIcon, SearchIcon, ShieldCheckIcon } from "../components/icons";
import { useAdminAuth } from "../lib/AdminAuthContext";
import {
  apiFetch,
  ApiError,
  type CamperListResponse,
  type CamperOut,
  type DistribucionOut,
  type EquipoOut,
  type Sexo,
  type TipoParticipante,
  type Zona,
} from "../lib/api";
import { useMediaQuery } from "../lib/useMediaQuery";
import { useSettings } from "../lib/SettingsContext";
import { useToast } from "../lib/useToast";
import "./AdminPanel.css";

const PAGE_SIZE = 15;

export function AdminPanel() {
  const { username, role, loading: authLoading } = useAdminAuth();
  const { showShirtSize } = useSettings();
  const [data, setData] = useState<CamperListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [pago, setPago] = useState<"" | "true" | "false">("");
  const [zona, setZona] = useState<"" | Zona>("");
  const [sexo, setSexo] = useState<"" | Sexo>("");
  const [tipo, setTipo] = useState<"" | TipoParticipante>("");
  const [asistio, setAsistio] = useState<"" | "true" | "false">("");
  // "" = todos, "0" = sin equipo (centinela que también usa el backend), o el id del equipo.
  const [equipoFiltro, setEquipoFiltro] = useState("");
  const [equiposList, setEquiposList] = useState<EquipoOut[]>([]);
  const [page, setPage] = useState(1);
  const [ticketModal, setTicketModal] = useState<{ id: number; nombre: string } | null>(null);
  const [toast, setToast] = useToast();
  // Fila de detalle expandida en la tabla de escritorio — una sola a la vez.
  const [expandido, setExpandido] = useState<number | null>(null);
  const detailRefs = useRef<Record<number, HTMLTableRowElement | null>>({});
  // Id de la fila que se está abriendo — se consulta en onAnimationComplete para
  // hacer scroll solo cuando termina la animación de apertura, nunca la de cierre.
  const openingIdRef = useRef<number | null>(null);
  const reduceMotion = useReducedMotion();
  // Coincide con el breakpoint de .admin-table-wrap en AdminPanel.css — se renderiza una
  // sola variante (tabla o tarjetas) en vez de las dos a la vez con una oculta por CSS.
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  const puedeVerificarPago = role === "ADMIN" || role === "VERIFICADOR_PAGO";
  const puedeBorrar = role === "ADMIN";
  const puedeEditar = role === "ADMIN";
  const [editando, setEditando] = useState<CamperOut | null>(null);

  function buildQuery(extra: Record<string, string> = {}) {
    const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE), ...extra });
    if (q) params.set("q", q);
    if (pago) params.set("pago", pago);
    if (zona) params.set("zona", zona);
    if (sexo) params.set("sexo", sexo);
    if (tipo) params.set("tipo", tipo);
    if (asistio) params.set("asistio", asistio);
    if (equipoFiltro) params.set("equipo_id", equipoFiltro);
    return params;
  }

  async function fetchData() {
    setLoading(true);
    setExpandido(null);
    try {
      const res = await apiFetch<CamperListResponse>(`/admin/registros?${buildQuery()}`);
      setData(res);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!authLoading && username) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, username, page]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (page !== 1) setPage(1);
      else if (!authLoading && username) fetchData();
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, pago, zona, sexo, tipo, asistio, equipoFiltro]);

  useEffect(() => {
    if (!authLoading && username) {
      apiFetch<DistribucionOut>("/admin/equipos/distribucion")
        .then((res) => setEquiposList(res.equipos))
        .catch(() => {
          /* el filtro de equipo simplemente no se llena si esto falla — no es bloqueante */
        });
    }
  }, [authLoading, username]);

  if (!authLoading && !username) {
    return <Navigate to="/admin" replace />;
  }
  if (!authLoading && role === "RECEPCION") {
    return <Navigate to="/admin/recepcion" replace />;
  }

  function toggleDetalle(id: number) {
    if (expandido === id) {
      openingIdRef.current = null;
      setExpandido(null);
      return;
    }
    openingIdRef.current = id;
    setExpandido(id);
  }

  async function togglePago(camper: CamperOut, verificado: boolean) {
    // Optimista: refleja el cambio de inmediato y revierte si el PATCH falla.
    setData((prev) =>
      prev ? { ...prev, items: prev.items.map((c) => (c.id === camper.id ? { ...c, pago_verificado: verificado } : c)) } : prev
    );
    try {
      const updated = await apiFetch<CamperOut>(`/admin/registros/${camper.id}/pago`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verificado }),
      });
      setData((prev) =>
        prev ? { ...prev, items: prev.items.map((c) => (c.id === camper.id ? updated : c)) } : prev
      );
    } catch (err) {
      setData((prev) =>
        prev ? { ...prev, items: prev.items.map((c) => (c.id === camper.id ? { ...c, pago_verificado: !verificado } : c)) } : prev
      );
      setToast(err instanceof ApiError ? err.message : "No se pudo actualizar el pago. Intenta de nuevo.");
    }
  }

  function onRegistroActualizado(actualizado: CamperOut) {
    setData((prev) =>
      prev ? { ...prev, items: prev.items.map((c) => (c.id === actualizado.id ? actualizado : c)) } : prev
    );
    setToast("Datos actualizados.");
  }

  async function borrarRegistro(camper: CamperOut) {
    try {
      await apiFetch(`/admin/registros/${camper.id}`, { method: "DELETE" });
      await fetchData();
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "No se pudo borrar el registro. Intenta de nuevo.");
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const verificados = data?.items.filter((c) => c.pago_verificado).length ?? 0;
  const pendientes = data ? data.items.length - verificados : 0;
  const activeFilters = [
    q && { key: "q", label: `"${q}"`, clear: () => setQ("") },
    zona && { key: "zona", label: ZONA_LABEL[zona], clear: () => setZona("") },
    sexo && { key: "sexo", label: sexo === "M" ? "Masculino" : "Femenino", clear: () => setSexo("") },
    tipo && { key: "tipo", label: TIPO_LABEL[tipo], clear: () => setTipo("") },
    pago && { key: "pago", label: pago === "true" ? "Verificado" : "Pendiente", clear: () => setPago("") },
    asistio && { key: "asistio", label: asistio === "true" ? "Llegó" : "No ha llegado", clear: () => setAsistio("") },
    equipoFiltro && {
      key: "equipo",
      label: equipoFiltro === "0" ? "Sin equipo" : equiposList.find((e) => String(e.id) === equipoFiltro)?.nombre ?? "Equipo",
      clear: () => setEquipoFiltro(""),
    },
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[];

  return (
    <div className="page-container admin-panel">
      <Reveal>
        <p className="eyebrow">Panel administrativo</p>
        <h1 className="display-title admin-title">Registros del campamento</h1>
      </Reveal>

      <Reveal delay={0.06}>
        <div className="admin-stats">
          <StatTile label="Registros totales" value={data?.total ?? "—"} tone="amarillo" icon={<ReceiptIcon size={18} />} />
          <StatTile label="Verificados (esta página)" value={verificados} tone="verde" icon={<ShieldCheckIcon size={18} />} />
          <StatTile label="Pendientes (esta página)" value={pendientes} icon={<SearchIcon size={18} />} />
        </div>
      </Reveal>

      <AdminRegistroToggle canEdit={role === "ADMIN"} />

      <AdminAjustes canEdit={role === "ADMIN"} />

      <AdminShirtStats canEdit={role === "ADMIN"} />

      <AdminComprobanteStats canEdit={role === "ADMIN"} />

      <AdminResumen />

      <div className="glass-card admin-filters">
        <div className="field">
          <label htmlFor="q">
            <SearchIcon size={14} /> Buscar
          </label>
          <input
            id="q"
            type="text"
            placeholder="Nombre, iglesia, ciudad, teléfono o folio"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="zona-filter">Zona</label>
          <select id="zona-filter" value={zona} onChange={(e) => setZona(e.target.value as Zona | "")}>
            <option value="">Todas</option>
            {(Object.keys(ZONA_LABEL) as Zona[]).map((z) => (
              <option key={z} value={z}>
                {ZONA_LABEL[z]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="tipo-filter">Tipo</label>
          <select id="tipo-filter" value={tipo} onChange={(e) => setTipo(e.target.value as TipoParticipante | "")}>
            <option value="">Todos</option>
            {(Object.keys(TIPO_LABEL) as TipoParticipante[]).map((t) => (
              <option key={t} value={t}>
                {TIPO_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sexo-filter">Sexo</label>
          <select id="sexo-filter" value={sexo} onChange={(e) => setSexo(e.target.value as Sexo | "")}>
            <option value="">Todos</option>
            <option value="M">Masculino</option>
            <option value="F">Femenino</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="pago-filter">Estado de pago</label>
          <select id="pago-filter" value={pago} onChange={(e) => setPago(e.target.value as typeof pago)}>
            <option value="">Todos</option>
            <option value="true">Verificado</option>
            <option value="false">Pendiente</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="asistio-filter">Asistencia</label>
          <select id="asistio-filter" value={asistio} onChange={(e) => setAsistio(e.target.value as typeof asistio)}>
            <option value="">Todos</option>
            <option value="true">Llegó</option>
            <option value="false">No ha llegado</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="equipo-filter">Equipo</label>
          <select id="equipo-filter" value={equipoFiltro} onChange={(e) => setEquipoFiltro(e.target.value)}>
            <option value="">Todos</option>
            <option value="0">Sin equipo</option>
            {equiposList.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="admin-export-row">
          <a
            className="btn btn-ghost admin-export"
            href={`/api/admin/registros.csv?${buildQuery()}`}
            target="_blank"
            rel="noreferrer"
          >
            <DownloadIcon size={16} /> Exportar CSV
          </a>
          <a
            className="btn btn-ghost admin-export"
            href={`/api/admin/registros.xlsx?${buildQuery()}`}
            target="_blank"
            rel="noreferrer"
          >
            <DownloadIcon size={16} /> Exportar Excel
          </a>
        </div>
      </div>

      {activeFilters.length > 0 && (
        <div className="admin-chips">
          {activeFilters.map((f) => (
            <button key={f.key} className="admin-chip" onClick={f.clear}>
              {f.label} <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}

      <div className="admin-list">
        {loading && Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}

        {!loading && data?.items.length === 0 && (
          <div className="admin-empty">
            <p className="muted">No hay registros con estos filtros.</p>
          </div>
        )}

        {!loading && (data?.items.length ?? 0) > 0 && isDesktop && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <colgroup>
                <col style={{ width: "26%" }} />
                <col style={{ width: "17%" }} />
                <col style={{ width: "15%" }} />
                <col style={{ width: "15%" }} />
                <col style={{ width: "13%" }} />
                <col style={{ width: "9%" }} />
                <col style={{ width: "5%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Campero</th>
                  <th>Perfil</th>
                  <th>Equipo</th>
                  <th>Pago</th>
                  <th>Recibo</th>
                  <th>Llegó</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data!.items.map((camper) => {
                  const abierto = expandido === camper.id;
                  return (
                    <Fragment key={camper.id}>
                      <tr
                        className={`admin-table-row ${abierto ? "is-expanded" : ""}`}
                        style={{ "--color-equipo": camper.equipo?.color ?? "transparent" } as CSSProperties}
                        onClick={() => toggleDetalle(camper.id)}
                      >
                        <td>
                          <div className="admin-table-campero">
                            <span className="muted mono admin-table-folio">{camper.folio}</span>
                            <span className="admin-table-name">{camper.nombre}</span>
                            <span className="muted admin-table-truncate">{camper.iglesia}</span>
                          </div>
                        </td>
                        <td>
                          <div className="admin-table-perfil">
                            <span className="admin-chip-tipo">{camper.tipo ? TIPO_LABEL[camper.tipo] : "—"}</span>
                            <span className="muted admin-table-perfil-meta">
                              {camper.zona ? ZONA_LABEL[camper.zona] : "—"} · {camper.edad} años ·{" "}
                              {camper.sexo === "M" ? "M" : "F"}
                            </span>
                          </div>
                        </td>
                        <td className="admin-table-truncate">
                          {camper.equipo ? (
                            <span className="admin-equipo-chip">
                              <span className="admin-equipo-dot" style={{ background: camper.equipo.color }} />
                              {camper.equipo.nombre}
                            </span>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className={`admin-table-pago ${camper.pago_verificado ? "is-verificado" : ""}`}>
                            <span className="mono admin-table-fecha-pago">{camper.fecha_pago ?? "—"}</span>
                            <ToggleSwitch
                              checked={camper.pago_verificado}
                              disabled={!puedeVerificarPago}
                              onChange={(checked) => togglePago(camper, checked)}
                            />
                          </div>
                        </td>
                        <td>
                          {camper.tiene_comprobante ? (
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setTicketModal({ id: camper.id, nombre: camper.nombre });
                              }}
                            >
                              <ReceiptIcon size={14} /> Ver
                            </button>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td>
                          {camper.asistio ? (
                            <span className="admin-asistio-si">✓ Llegó</span>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className={`admin-table-expand ${abierto ? "is-open" : ""}`}
                            aria-label={abierto ? "Ocultar detalle" : "Ver detalle"}
                            aria-expanded={abierto}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleDetalle(camper.id);
                            }}
                          >
                            <ChevronDownIcon size={16} />
                          </button>
                        </td>
                      </tr>
                      <AnimatePresence initial={false}>
                        {abierto && (
                          <tr
                            className="admin-table-detail-row"
                            key="detail"
                            ref={(el) => {
                              detailRefs.current[camper.id] = el;
                            }}
                          >
                            <td colSpan={7}>
                              <m.div
                                className="admin-table-detail"
                                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
                                animate={
                                  reduceMotion
                                    ? { opacity: 1, transition: { duration: 0.15 } }
                                    : { opacity: 1, height: "auto", transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] } }
                                }
                                exit={
                                  reduceMotion
                                    ? { opacity: 0, transition: { duration: 0.15 } }
                                    : // --ease-salida (tokens.css): arranca lenta y acelera hacia el
                                      // final, a diferencia de easeSuave (pensada para entradas) que
                                      // frena mucho cerca del final y hacía ver el cierre "atorado".
                                      { opacity: 0, height: 0, transition: { duration: 0.2, ease: [0.7, 0, 0.84, 0] } }
                                }
                                onAnimationComplete={() => {
                                  // Solo la animación de apertura deja este id armado en
                                  // openingIdRef (toggleDetalle lo limpia al cerrar) — así el
                                  // cierre de una fila nunca dispara un scroll de otra.
                                  if (openingIdRef.current === camper.id) {
                                    openingIdRef.current = null;
                                    detailRefs.current[camper.id]?.scrollIntoView({
                                      behavior: reduceMotion ? "auto" : "smooth",
                                      block: "nearest",
                                    });
                                  }
                                }}
                              >
                                <div className="admin-table-detail-grid">
                                  {showShirtSize && (
                                    <div className="admin-table-detail-item">
                                      <span className="admin-table-detail-label">Talla</span>
                                      <span>{camper.talla_camisa === "OTRA" ? camper.talla_otra || "Otra" : camper.talla_camisa ?? "—"}</span>
                                    </div>
                                  )}
                                  <div className="admin-table-detail-item">
                                    <span className="admin-table-detail-label">Teléfono</span>
                                    <span className="mono">{camper.telefono || "—"}</span>
                                  </div>
                                  <div className="admin-table-detail-item">
                                    <span className="admin-table-detail-label">Bautizado</span>
                                    <span>
                                      {camper.bautizado
                                        ? camper.bautismo_mes && camper.bautismo_anio
                                          ? `Sí (${camper.bautismo_mes}/${camper.bautismo_anio})`
                                          : "Sí"
                                        : "No"}
                                    </span>
                                  </div>
                                  <div className="admin-table-detail-item">
                                    <span className="admin-table-detail-label">Promoción</span>
                                    <span>{camper.tiene_promocion ? camper.promocion_detalle || "Sí" : "No"}</span>
                                  </div>
                                  {camper.pago_verificado && (
                                    <div className="admin-table-detail-item">
                                      <span className="admin-table-detail-label">Verificado por</span>
                                      <span>
                                        {camper.verificado_por ?? "—"}
                                        {camper.verificado_en && <><br /><span className="muted mono">{camper.verificado_en}</span></>}
                                      </span>
                                    </div>
                                  )}
                                  {camper.asistio && (
                                    <div className="admin-table-detail-item">
                                      <span className="admin-table-detail-label">Llegada registrada por</span>
                                      <span>
                                        {camper.asistio_por ?? "—"}
                                        {camper.asistio_en && <><br /><span className="muted mono">{camper.asistio_en}</span></>}
                                      </span>
                                    </div>
                                  )}
                                  <div className="admin-table-detail-item">
                                    <span className="admin-table-detail-label">Registrado el</span>
                                    <span className="mono">{camper.created_at}</span>
                                  </div>
                                </div>
                                {(puedeEditar || puedeBorrar) && (
                                  <div className="admin-table-detail-actions">
                                    {puedeEditar && (
                                      <button
                                        type="button"
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => setEditando(camper)}
                                      >
                                        <PencilIcon size={14} /> Editar
                                      </button>
                                    )}
                                    {puedeBorrar && (
                                      <ConfirmButton
                                        label="Borrar registro"
                                        confirmLabel="¿Seguro? Sí, borrar"
                                        className="btn-sm admin-delete-btn"
                                        onConfirm={() => borrarRegistro(camper)}
                                      />
                                    )}
                                  </div>
                                )}
                              </m.div>
                            </td>
                          </tr>
                        )}
                      </AnimatePresence>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading &&
          !isDesktop &&
          data?.items.map((camper) => (
            <div className="glass-card admin-row" key={camper.id}>
              <div className="admin-row-main">
                <div>
                  <p className="admin-row-name">{camper.nombre}</p>
                  <p className="muted admin-row-meta mono">
                    {camper.folio} · {camper.tipo ? TIPO_LABEL[camper.tipo] : "—"} ·{" "}
                    {camper.zona ? ZONA_LABEL[camper.zona] : "—"} · {camper.edad} años ·{" "}
                    {camper.sexo === "M" ? "Masculino" : "Femenino"}
                    {showShirtSize && camper.talla_camisa
                      ? ` · Talla ${camper.talla_camisa === "OTRA" ? camper.talla_otra || "Otra" : camper.talla_camisa}`
                      : ""}
                  </p>
                  <p className="muted admin-row-meta">{camper.iglesia}</p>
                  <p className="muted admin-row-meta">
                    Pago: {camper.fecha_pago ?? "—"} · Promoción: {camper.tiene_promocion ? camper.promocion_detalle || "Sí" : "No"} ·{" "}
                    {camper.tipo === "CONSEJERO"
                      ? `Teléfono: ${camper.telefono || "—"}`
                      : `Bautizado: ${camper.bautizado ? "Sí" : "No"}`}
                  </p>
                  <p className="muted admin-row-meta">
                    {camper.asistio ? <span className="admin-asistio-si">✓ Llegó</span> : "Aún no llega"}
                  </p>
                  <p className="muted admin-row-meta">
                    {camper.equipo ? (
                      <span className="admin-equipo-chip">
                        <span className="admin-equipo-dot" style={{ background: camper.equipo.color }} />
                        {camper.equipo.nombre}
                      </span>
                    ) : (
                      "Sin equipo"
                    )}
                  </p>
                </div>

                <div className="admin-row-actions">
                  {camper.tiene_comprobante && (
                    <button
                      className="btn btn-ghost admin-ticket-btn"
                      onClick={() => setTicketModal({ id: camper.id, nombre: camper.nombre })}
                    >
                      <ReceiptIcon size={16} /> Ver comprobante
                    </button>
                  )}
                  {puedeEditar && (
                    <button className="btn btn-ghost admin-ticket-btn" onClick={() => setEditando(camper)}>
                      <PencilIcon size={16} /> Editar
                    </button>
                  )}
                  {puedeBorrar && (
                    <ConfirmButton
                      label="Borrar registro"
                      confirmLabel="¿Seguro? Sí, borrar"
                      className="admin-delete-btn"
                      onConfirm={() => borrarRegistro(camper)}
                    />
                  )}
                </div>
              </div>

              <div className="admin-row-status">
                <ToggleSwitch
                  checked={camper.pago_verificado}
                  disabled={!puedeVerificarPago}
                  onChange={(checked) => togglePago(camper, checked)}
                  label={camper.pago_verificado ? "Pagado / Verificado" : "Pendiente"}
                />
              </div>
            </div>
          ))}
      </div>

      {data && totalPages > 1 && (
        <div className="admin-pagination">
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

      <AnimatePresence>
        {ticketModal &&
          (() => {
            const camper = data?.items.find((c) => c.id === ticketModal.id);
            return (
              <TicketModal
                camperId={ticketModal.id}
                nombre={ticketModal.nombre}
                onClose={() => setTicketModal(null)}
                verificado={camper?.pago_verificado ?? false}
                puedeVerificar={puedeVerificarPago}
                onToggleVerificado={(checked) => camper && togglePago(camper, checked)}
              />
            );
          })()}
      </AnimatePresence>

      <AnimatePresence>
        {editando && (
          <EditarCamperModal camper={editando} onClose={() => setEditando(null)} onSaved={onRegistroActualizado} />
        )}
      </AnimatePresence>

      <Toast message={toast} />
    </div>
  );
}
