import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Reveal } from "../components/Reveal";
import { RootDivider } from "../components/RootDivider";
import { SkeletonRow } from "../components/Skeleton";
import { StatTile } from "../components/StatTile";
import { TicketModal } from "../components/TicketModal";
import { ToggleSwitch } from "../components/ToggleSwitch";
import { DownloadIcon, ReceiptIcon, SearchIcon, ShieldCheckIcon } from "../components/icons";
import { SHOW_SHIRT_SIZE } from "../config";
import { useAdminAuth } from "../lib/AdminAuthContext";
import { apiFetch, ApiError, type CamperListResponse, type CamperOut, type Sexo } from "../lib/api";
import { useMediaQuery } from "../lib/useMediaQuery";
import "./AdminPanel.css";

const PAGE_SIZE = 15;

export function AdminPanel() {
  const { username, loading: authLoading } = useAdminAuth();
  const [data, setData] = useState<CamperListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [pago, setPago] = useState<"" | "true" | "false">("");
  const [ciudad, setCiudad] = useState("");
  const [sexo, setSexo] = useState<"" | Sexo>("");
  const [page, setPage] = useState(1);
  const [ticketModal, setTicketModal] = useState<{ id: number; nombre: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Coincide con el breakpoint de .admin-table-wrap en AdminPanel.css — se renderiza una
  // sola variante (tabla o tarjetas) en vez de las dos a la vez con una oculta por CSS.
  const isDesktop = useMediaQuery("(min-width: 1180px)");

  function buildQuery(extra: Record<string, string> = {}) {
    const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE), ...extra });
    if (q) params.set("q", q);
    if (pago) params.set("pago", pago);
    if (ciudad) params.set("ciudad", ciudad);
    if (sexo) params.set("sexo", sexo);
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
  }, [q, pago, ciudad, sexo]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

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

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const verificados = data?.items.filter((c) => c.pago_verificado).length ?? 0;
  const pendientes = data ? data.items.length - verificados : 0;
  const activeFilters = [
    q && { key: "q", label: `"${q}"`, clear: () => setQ("") },
    ciudad && { key: "ciudad", label: ciudad, clear: () => setCiudad("") },
    sexo && { key: "sexo", label: sexo === "M" ? "Masculino" : "Femenino", clear: () => setSexo("") },
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

      <RootDivider />

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
          <label htmlFor="ciudad-filter">Ciudad</label>
          <input id="ciudad-filter" type="text" value={ciudad} onChange={(e) => setCiudad(e.target.value)} />
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
        <a
          className="btn btn-ghost admin-export"
          href={`/api/admin/registros.csv?${buildQuery()}`}
          target="_blank"
          rel="noreferrer"
        >
          <DownloadIcon size={16} /> Exportar CSV
        </a>
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
                  <th>Ciudad</th>
                  <th>Iglesia</th>
                  <th>Edad</th>
                  <th>Sexo</th>
                  {SHOW_SHIRT_SIZE && <th>Talla</th>}
                  <th>Comprobante</th>
                  <th>Pago</th>
                </tr>
              </thead>
              <tbody>
                {data!.items.map((camper) => (
                  <tr key={camper.id}>
                    <td className="mono">{camper.folio}</td>
                    <td className="admin-table-name">{camper.nombre}</td>
                    <td className="admin-table-city">{camper.ciudad}</td>
                    <td className="admin-table-truncate">{camper.iglesia}</td>
                    <td>{camper.edad}</td>
                    <td>{camper.sexo === "M" ? "M" : "F"}</td>
                    {SHOW_SHIRT_SIZE && <td>{camper.talla_camisa ?? "—"}</td>}
                    <td>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setTicketModal({ id: camper.id, nombre: camper.nombre })}
                      >
                        <ReceiptIcon size={14} /> Ver
                      </button>
                    </td>
                    <td>
                      <ToggleSwitch
                        checked={camper.pago_verificado}
                        onChange={(checked) => togglePago(camper, checked)}
                      />
                    </td>
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
                    {camper.folio} · {camper.ciudad} · {camper.edad} años ·{" "}
                    {camper.sexo === "M" ? "Masculino" : "Femenino"}
                    {SHOW_SHIRT_SIZE && camper.talla_camisa ? ` · Talla ${camper.talla_camisa}` : ""}
                  </p>
                  <p className="muted admin-row-meta">{camper.iglesia}</p>
                </div>

                <button
                  className="btn btn-ghost admin-ticket-btn"
                  onClick={() => setTicketModal({ id: camper.id, nombre: camper.nombre })}
                >
                  <ReceiptIcon size={16} /> Ver comprobante
                </button>
              </div>

              <div className="admin-row-status">
                <ToggleSwitch
                  checked={camper.pago_verificado}
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
        {ticketModal && (
          <TicketModal camperId={ticketModal.id} nombre={ticketModal.nombre} onClose={() => setTicketModal(null)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            className="admin-toast"
            role="alert"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
