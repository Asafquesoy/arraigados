import { useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { AnimatePresence } from "motion/react";
import { ColorSwatches } from "../components/ColorSwatches";
import { ConfirmButton } from "../components/ConfirmButton";
import { EquipoCard } from "../components/EquipoCard";
import { EquiposCriterios } from "../components/EquiposCriterios";
import { FieldReveal } from "../components/FieldReveal";
import { MoverMiembro } from "../components/MoverMiembro";
import { Reveal } from "../components/Reveal";
import { SkeletonRow } from "../components/Skeleton";
import { Toast } from "../components/Toast";
import { EquiposIcon, SearchIcon } from "../components/icons";
import { useAdminAuth } from "../lib/AdminAuthContext";
import {
  apiFetch,
  ApiError,
  type DistribucionOut,
  type EquiposConfig,
  type MiembroOut,
} from "../lib/api";
import { useToast } from "../lib/useToast";
import "./Equipos.css";

function coincideMiembro(m: MiembroOut, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return m.nombre.toLowerCase().includes(needle) || m.iglesia.toLowerCase().includes(needle);
}

export function Equipos() {
  const { username, role, loading: authLoading } = useAdminAuth();
  const canEdit = role === "ADMIN";

  const [dist, setDist] = useState<DistribucionOut | null>(null);
  const [config, setConfig] = useState<EquiposConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useToast();
  const [q, setQ] = useState("");

  const [showNewForm, setShowNewForm] = useState(false);
  const [newNombre, setNewNombre] = useState("");
  const [newColor, setNewColor] = useState("#ffc800");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [movingId, setMovingId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [repartiendo, setRepartiendo] = useState(false);
  const [incluirFijados, setIncluirFijados] = useState(false);

  async function fetchDistribucion() {
    const res = await apiFetch<DistribucionOut>("/admin/equipos/distribucion");
    setDist(res);
  }

  async function fetchAll() {
    setLoading(true);
    try {
      const [distRes, configRes] = await Promise.all([
        apiFetch<DistribucionOut>("/admin/equipos/distribucion"),
        apiFetch<EquiposConfig>("/admin/equipos/config"),
      ]);
      setDist(distRes);
      setConfig(configRes);
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "No se pudo cargar la información de equipos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!authLoading && username) fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, username]);

  if (!authLoading && !username) {
    return <Navigate to="/admin" replace />;
  }

  async function handleCrear(e: FormEvent) {
    e.preventDefault();
    if (!newNombre.trim()) {
      setCreateError("Ponle un nombre al equipo.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      await apiFetch("/admin/equipos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: newNombre.trim(), color: newColor }),
      });
      setNewNombre("");
      setShowNewForm(false);
      await fetchDistribucion();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : "No se pudo crear el equipo.");
    } finally {
      setCreating(false);
    }
  }

  async function handleRenombrar(equipoId: number, nombre: string, color: string) {
    await apiFetch(`/admin/equipos/${equipoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, color }),
    });
    await fetchDistribucion();
  }

  async function handleBorrar(equipoId: number) {
    try {
      await apiFetch(`/admin/equipos/${equipoId}`, { method: "DELETE" });
      await fetchDistribucion();
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "No se pudo borrar el equipo.");
    }
  }

  async function handleRepartir() {
    setRepartiendo(true);
    try {
      const res = await apiFetch<DistribucionOut>("/admin/equipos/repartir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incluir_fijados: incluirFijados }),
      });
      setDist(res);
      setToast("Equipos repartidos.");
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "No se pudo repartir. Intenta de nuevo.");
    } finally {
      setRepartiendo(false);
    }
  }

  async function handleMover(miembro: MiembroOut, _equipoActualId: number | null, destinoId: number | null) {
    setMovingId(null);
    setBusyId(miembro.id);
    try {
      await apiFetch(`/admin/registros/${miembro.id}/equipo`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ equipo_id: destinoId }),
      });
      await fetchDistribucion();
      setToast(destinoId ? `${miembro.nombre} se movió de equipo.` : `${miembro.nombre} quedó sin equipo.`);
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "No se pudo mover. Intenta de nuevo.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleConfigChange(field: keyof EquiposConfig, value: boolean) {
    if (!config) return;
    const previous = config[field];
    setConfig({ ...config, [field]: value });
    try {
      await apiFetch<EquiposConfig>("/admin/equipos/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
    } catch (err) {
      setConfig((prev) => (prev ? { ...prev, [field]: previous } : prev));
      setToast(err instanceof ApiError ? err.message : "No se pudo actualizar. Intenta de nuevo.");
    }
  }

  const equipos = dist?.equipos ?? [];
  const sinEquipoFiltrado = (dist?.sin_equipo ?? []).filter((m) => coincideMiembro(m, q));

  return (
    <div className="page-container equipos-page">
      <Reveal>
        <p className="eyebrow">Panel administrativo</p>
        <h1 className="display-title equipos-title">Equipos</h1>
        <p className="muted">
          Crea equipos, decide cómo se reparten y mueve a quien haga falta.
        </p>
      </Reveal>

      {canEdit && (
        <Reveal delay={0.05} className="equipos-nuevo">
          <div className="glass-card equipos-nuevo-card">
            <div className="equipos-nuevo-header">
              <EquiposIcon size={18} />
              <h2>Equipos</h2>
              <button
                type="button"
                className="btn btn-primary btn-sm equipos-nuevo-btn"
                onClick={() => setShowNewForm((v) => !v)}
              >
                {showNewForm ? "Cancelar" : "+ Nuevo equipo"}
              </button>
            </div>

            <AnimatePresence initial={false}>
              {showNewForm && (
                <FieldReveal>
                  <form className="equipos-nuevo-form" onSubmit={handleCrear}>
                    <div className="field">
                      <label htmlFor="nuevo-equipo-nombre">Nombre del equipo</label>
                      <input
                        id="nuevo-equipo-nombre"
                        type="text"
                        value={newNombre}
                        onChange={(e) => setNewNombre(e.target.value)}
                        placeholder="Por ejemplo: Águilas"
                        maxLength={80}
                        autoFocus
                      />
                    </div>
                    <div className="field">
                      <label>Color</label>
                      <ColorSwatches value={newColor} onChange={setNewColor} disabled={creating} />
                    </div>
                    {createError && <p className="field-error">{createError}</p>}
                    <button type="submit" className="btn btn-primary" disabled={creating}>
                      {creating && <span className="spinner" />}
                      {creating ? "Creando..." : "Crear equipo"}
                    </button>
                  </form>
                </FieldReveal>
              )}
            </AnimatePresence>
          </div>
        </Reveal>
      )}

      <EquiposCriterios config={config} loading={loading} canEdit={canEdit} onChange={handleConfigChange} />

      {canEdit && equipos.length > 0 && (
        <Reveal delay={0.14} className="equipos-repartir">
          <div className="glass-card equipos-repartir-card">
            <div>
              <p className="equipos-repartir-titulo">Repartir a todos</p>
              <p className="muted equipos-repartir-hint">
                Reacomoda a todo mundo según los criterios de arriba.
              </p>
              <label className="equipos-repartir-check">
                <input
                  type="checkbox"
                  checked={incluirFijados}
                  onChange={(e) => setIncluirFijados(e.target.checked)}
                />
                Incluir también a los que moví a mano
              </label>
            </div>
            <ConfirmButton
              label={repartiendo ? "Repartiendo..." : "Repartir a todos"}
              confirmLabel="¿Seguro? Sí, repartir"
              className="btn-primary"
              disabled={repartiendo}
              onConfirm={handleRepartir}
            />
          </div>
        </Reveal>
      )}

      {(equipos.length > 0 || (dist?.sin_equipo.length ?? 0) > 0) && (
        <Reveal delay={0.18} className="equipos-buscador">
          <div className="field">
            <label htmlFor="equipos-q">
              <SearchIcon size={14} /> Buscar por nombre o iglesia
            </label>
            <input
              id="equipos-q"
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Escribe para resaltar y filtrar en todos los equipos"
            />
          </div>
        </Reveal>
      )}

      {loading && (
        <div className="equipos-loading">
          <SkeletonRow />
          <SkeletonRow />
        </div>
      )}

      {!loading && equipos.length === 0 && (
        <div className="glass-card equipos-empty">
          <p className="muted">
            {canEdit
              ? "Aún no hay equipos. Crea el primero y luego aprieta «Repartir a todos»."
              : "Todavía no se han creado equipos."}
          </p>
        </div>
      )}

      {!loading && equipos.length > 0 && (
        <div className="equipos-grid">
          {equipos.map((equipo, i) => (
            <EquipoCard
              key={equipo.id}
              equipo={equipo}
              equipos={equipos}
              canEdit={canEdit}
              q={q}
              movingId={movingId}
              busyId={busyId}
              delay={0.05 * i}
              onToggleMove={(id) => setMovingId((prev) => (prev === id ? null : id))}
              onMover={handleMover}
              onRename={(nombre, color) => handleRenombrar(equipo.id, nombre, color)}
              onDelete={() => handleBorrar(equipo.id)}
            />
          ))}
        </div>
      )}

      {!loading && (dist?.sin_equipo.length ?? 0) > 0 && (
        <Reveal delay={0.1} className="equipos-sin-equipo-wrap">
          <div className="glass-card equipos-sin-equipo">
            <h2 className="equipos-sin-equipo-title">Sin equipo ({dist?.sin_equipo.length})</h2>
            {sinEquipoFiltrado.length === 0 && q && (
              <p className="muted equipo-card-empty">Nadie coincide con la búsqueda.</p>
            )}
            {sinEquipoFiltrado.map((m) => (
              <MoverMiembro
                key={m.id}
                miembro={m}
                equipoActualId={null}
                equipos={equipos}
                canEdit={canEdit}
                open={movingId === m.id}
                busy={busyId === m.id}
                highlighted={q !== "" && coincideMiembro(m, q)}
                onToggle={() => setMovingId((prev) => (prev === m.id ? null : m.id))}
                onMover={(destinoId) => handleMover(m, null, destinoId)}
              />
            ))}
          </div>
        </Reveal>
      )}

      <Toast message={toast} />
    </div>
  );
}
