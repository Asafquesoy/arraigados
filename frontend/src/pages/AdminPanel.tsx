import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { AnimatePresence } from "motion/react";
import { AdminAjustes } from "../components/AdminAjustes";
import { AdminComprobanteStats } from "../components/AdminComprobanteStats";
import { AdminRegistroToggle } from "../components/AdminRegistroToggle";
import { AdminResumen } from "../components/AdminResumen";
import { AdminShirtStats } from "../components/AdminShirtStats";
import { ConfirmButton } from "../components/ConfirmButton";
import { Reveal } from "../components/Reveal";
import { SkeletonRow } from "../components/Skeleton";
import { StatTile } from "../components/StatTile";
import { TicketModal } from "../components/TicketModal";
import { Toast } from "../components/Toast";
import { ToggleSwitch } from "../components/ToggleSwitch";
import { TIPO_LABEL } from "../components/TipoParticipanteField";
import { ZONA_LABEL } from "../components/ZonaField";
import { DownloadIcon, ReceiptIcon, SearchIcon, ShieldCheckIcon } from "../components/icons";
import { useAdminAuth } from "../lib/AdminAuthContext";
import {
  apiFetch,
  ApiError,
  type CamperListResponse,
  type CamperOut,
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
  const [page, setPage] = useState(1);
  const [ticketModal, setTicketModal] = useState<{ id: number; nombre: string } | null>(null);
  const [toast, setToast] = useToast();
  // Coincide con el breakpoint de .admin-table-wrap en AdminPanel.css — se renderiza una
  // sola variante (tabla o tarjetas) en vez de las dos a la vez con una oculta por CSS.
  const isDesktop = useMediaQuery("(min-width: 1180px)");

  const puedeVerificarPago = role === "ADMIN" || role === "VERIFICADOR_PAGO";
  const puedeBorrar = role === "ADMIN";

  function buildQuery(extra: Record<string, string> = {}) {
    const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE), ...extra });
    if (q) params.set("q", q);
    if (pago) params.set("pago", pago);
    if (zona) params.set("zona", zona);
    if (sexo) params.set("sexo", sexo);
    if (tipo) params.set("tipo", tipo);
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
  }, [q, pago, zona, sexo, tipo]);

  if (!authLoading && !username) {
    return <Navigate to="/admin" replace />;
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
            placeholder="Nombre, iglesia o folio"
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
              <thead>
                <tr>
                  <th>Folio</th>
                  <th>Nombre</th>
                  <th>Tipo</th>
                  <th>Zona</th>
                  <th>Iglesia</th>
                  <th>Edad</th>
                  <th>Sexo</th>
                  {showShirtSize && <th>Talla</th>}
                  <th>Fecha de pago</th>
                  <th>Promoción</th>
                  <th>Bautizado</th>
                  <th>Comprobante</th>
                  <th>Pago</th>
                  {puedeBorrar && <th></th>}
                </tr>
              </thead>
              <tbody>
                {data!.items.map((camper) => (
                  <tr key={camper.id}>
                    <td className="mono">{camper.folio}</td>
                    <td className="admin-table-name">{camper.nombre}</td>
                    <td>
                      {camper.tipo ? TIPO_LABEL[camper.tipo] : "—"}
                      {camper.telefono && (
                        <>
                          <br />
                          <span className="muted mono">{camper.telefono}</span>
                        </>
                      )}
                    </td>
                    <td className="admin-table-city">{camper.zona ? ZONA_LABEL[camper.zona] : "—"}</td>
                    <td className="admin-table-truncate">{camper.iglesia}</td>
                    <td>{camper.edad}</td>
                    <td>{camper.sexo === "M" ? "M" : "F"}</td>
                    {showShirtSize && (
                      <td>{camper.talla_camisa === "OTRA" ? camper.talla_otra || "Otra" : camper.talla_camisa ?? "—"}</td>
                    )}
                    <td className="mono">{camper.fecha_pago ?? "—"}</td>
                    <td>{camper.tiene_promocion ? camper.promocion_detalle || "Sí" : "No"}</td>
                    <td>{camper.bautizado ? "Sí" : "No"}</td>
                    <td>
                      {camper.tiene_comprobante ? (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => setTicketModal({ id: camper.id, nombre: camper.nombre })}
                        >
                          <ReceiptIcon size={14} /> Ver
                        </button>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      <ToggleSwitch
                        checked={camper.pago_verificado}
                        disabled={!puedeVerificarPago}
                        onChange={(checked) => togglePago(camper, checked)}
                      />
                    </td>
                    {puedeBorrar && (
                      <td>
                        <ConfirmButton
                          label="Borrar"
                          confirmLabel="¿Seguro?"
                          className="btn-sm admin-delete-btn"
                          onConfirm={() => borrarRegistro(camper)}
                        />
                      </td>
                    )}
                  </tr>
                ))}
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

      <Toast message={toast} />
    </div>
  );
}
