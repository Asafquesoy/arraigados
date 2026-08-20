import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { EquipoCard } from "../components/EquipoCard";
import { EquiposTabs, type EquiposTabId } from "../components/EquiposTabs";
import { EquiposToolbar, type EquiposPanel } from "../components/EquiposToolbar";
import { MoverMiembro } from "../components/MoverMiembro";
import { Reveal } from "../components/Reveal";
import { SkeletonRow } from "../components/Skeleton";
import { Toast } from "../components/Toast";
import { SearchIcon } from "../components/icons";
import { useAdminAuth } from "../lib/AdminAuthContext";
import {
  apiFetch,
  ApiError,
  type DistribucionOut,
  type EquipoOut,
  type EquipoStats,
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

// Espejo en cliente de resumen_equipo() (backend/app/equipos_balance.py) —
// deja que mover a alguien actualice las stats de las tarjetas al instante
// en vez de tener que esperar un refetch completo de la distribución.
function mesesBautizado(m: MiembroOut, hoy: Date): number | null {
  if (!m.bautizado || !m.bautismo_mes || !m.bautismo_anio) return null;
  return (hoy.getFullYear() - m.bautismo_anio) * 12 + (hoy.getMonth() + 1 - m.bautismo_mes);
}

function recalcularStats(miembros: MiembroOut[]): EquipoStats {
  const total = miembros.length;
  const hoy = new Date();
  const edades = miembros.map((m) => m.edad);
  const tiemposBautizado = miembros
    .map((m) => mesesBautizado(m, hoy))
    .filter((v): v is number => v !== null);
  const iglesias = new Set(miembros.map((m) => (m.iglesia || "").trim().toLowerCase()).filter(Boolean));

  return {
    total,
    edad_promedio: total ? Math.round((edades.reduce((a, b) => a + b, 0) / total) * 10) / 10 : null,
    bautizados: tiemposBautizado.length,
    bautismo_meses_promedio: tiemposBautizado.length
      ? Math.round((tiemposBautizado.reduce((a, b) => a + b, 0) / tiemposBautizado.length) * 10) / 10
      : null,
    hombres: miembros.filter((m) => m.sexo === "M").length,
    mujeres: miembros.filter((m) => m.sexo === "F").length,
    consejeros: miembros.filter((m) => m.tipo === "CONSEJERO").length,
    iglesias_distintas: iglesias.size,
  };
}

export function Equipos() {
  const { username, role, loading: authLoading } = useAdminAuth();
  const canEdit = role === "ADMIN";

  const [dist, setDist] = useState<DistribucionOut | null>(null);
  const [config, setConfig] = useState<EquiposConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useToast();

  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [tab, setTab] = useState<EquiposTabId>("resumen");

  const [panel, setPanel] = useState<EquiposPanel>(null);
  const [newNombre, setNewNombre] = useState("");
  const [newColor, setNewColor] = useState("#ffc800");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [movingId, setMovingId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [repartiendo, setRepartiendo] = useState(false);
  const [incluirFijados, setIncluirFijados] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  async function fetchDistribucion() {
    const res = await apiFetch<DistribucionOut>("/admin/equipos/distribucion");
    setDist(res);
    return res;
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

  const equipos = useMemo(() => dist?.equipos ?? [], [dist]);

  // Si el equipo seleccionado se borró (o se acaba de cargar), regresa a Resumen.
  useEffect(() => {
    if (typeof tab === "number" && !equipos.some((e) => e.id === tab)) {
      setTab("resumen");
    }
    if (tab === "sin-equipo" && (dist?.sin_equipo.length ?? 0) === 0) {
      setTab("resumen");
    }
  }, [equipos, tab, dist]);

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
      const nuevo = await apiFetch<EquipoOut>("/admin/equipos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: newNombre.trim(), color: newColor }),
      });
      setNewNombre("");
      setPanel(null);
      await fetchDistribucion();
      setTab(nuevo.id);
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
      setTab("resumen");
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
      setPanel(null);
      setToast("Equipos repartidos.");
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "No se pudo repartir. Intenta de nuevo.");
    } finally {
      setRepartiendo(false);
    }
  }

  // Optimista: mueve a la persona entre arreglos y recalcula stats de
  // inmediato (sin esperar un refetch de ~150 personas), y revierte si el
  // PATCH falla — mismo patrón que togglePago en AdminPanel.tsx.
  async function handleMover(miembro: MiembroOut, equipoActualId: number | null, destinoId: number | null) {
    setMovingId(null);
    if (!dist) return;
    const previous = dist;
    const miembroMovido: MiembroOut = { ...miembro, equipo_fijado: destinoId !== null };

    const nextEquipos = dist.equipos.map((e) => {
      if (e.id === equipoActualId) {
        const miembros = e.miembros.filter((m) => m.id !== miembro.id);
        return { ...e, miembros, stats: recalcularStats(miembros) };
      }
      if (e.id === destinoId) {
        const miembros = [...e.miembros, miembroMovido];
        return { ...e, miembros, stats: recalcularStats(miembros) };
      }
      return e;
    });
    const nextSinEquipo =
      destinoId === null
        ? [miembroMovido, ...dist.sin_equipo.filter((m) => m.id !== miembro.id)]
        : dist.sin_equipo.filter((m) => m.id !== miembro.id);

    setDist({ equipos: nextEquipos, sin_equipo: nextSinEquipo });
    setBusyId(miembro.id);
    try {
      await apiFetch(`/admin/registros/${miembro.id}/equipo`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ equipo_id: destinoId }),
      });
      setToast(destinoId ? `${miembro.nombre} se movió de equipo.` : `${miembro.nombre} quedó sin equipo.`);
    } catch (err) {
      setDist(previous);
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

  const sinEquipo = dist?.sin_equipo ?? [];
  const totalPersonas = equipos.reduce((acc, e) => acc + e.stats.total, 0) + sinEquipo.length;
  const maxTamano = Math.max(1, ...equipos.map((e) => e.stats.total));

  const qTrim = qDebounced.trim();
  const searching = qTrim !== "";

  const searchResults = searching
    ? [
        ...equipos.flatMap((e) =>
          e.miembros
            .filter((m) => coincideMiembro(m, qTrim))
            .map((m) => ({ miembro: m, equipoActualId: e.id, equipoChip: { id: e.id, nombre: e.nombre, color: e.color } }))
        ),
        ...sinEquipo
          .filter((m) => coincideMiembro(m, qTrim))
          .map((m) => ({ miembro: m, equipoActualId: null as number | null, equipoChip: null })),
      ]
    : [];

  const equipoActivo = typeof tab === "number" ? equipos.find((e) => e.id === tab) ?? null : null;

  return (
    <div className="page-container equipos-page">
      <Reveal>
        <p className="eyebrow">Panel administrativo</p>
        <h1 className="display-title equipos-title">Equipos</h1>
        {!loading && (equipos.length > 0 || sinEquipo.length > 0) ? (
          <p className="muted">
            {equipos.length} equipo{equipos.length === 1 ? "" : "s"} · {totalPersonas} persona
            {totalPersonas === 1 ? "" : "s"}
            {sinEquipo.length > 0 ? ` · ${sinEquipo.length} sin equipo` : ""}
          </p>
        ) : (
          <p className="muted">Crea equipos, decide cómo se reparten y mueve a quien haga falta.</p>
        )}
      </Reveal>

      <EquiposToolbar
        canEdit={canEdit}
        panel={panel}
        onTogglePanel={setPanel}
        newNombre={newNombre}
        onNewNombreChange={setNewNombre}
        newColor={newColor}
        onNewColorChange={setNewColor}
        creating={creating}
        createError={createError}
        onCrear={handleCrear}
        config={config}
        configLoading={loading}
        onConfigChange={handleConfigChange}
        equiposCount={equipos.length}
        incluirFijados={incluirFijados}
        onIncluirFijadosChange={setIncluirFijados}
        repartiendo={repartiendo}
        onRepartir={handleRepartir}
      />

      {(equipos.length > 0 || sinEquipo.length > 0) && (
        <>
          <div className="field equipos-buscador">
            <label htmlFor="equipos-q">
              <SearchIcon size={14} /> Buscar por nombre o iglesia
            </label>
            <input
              id="equipos-q"
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Busca en todos los equipos a la vez"
            />
          </div>

          {!searching && (
            <EquiposTabs
              equipos={equipos}
              sinEquipoCount={sinEquipo.length}
              active={tab}
              dimmed={false}
              onChange={setTab}
            />
          )}
        </>
      )}

      {loading && (
        <div className="equipos-loading">
          <SkeletonRow />
          <SkeletonRow />
        </div>
      )}

      {!loading && equipos.length === 0 && sinEquipo.length === 0 && (
        <div className="glass-card equipos-empty">
          <p className="muted">
            {canEdit
              ? "Aún no hay equipos. Crea el primero y luego aprieta «Repartir a todos»."
              : "Todavía no se han creado equipos."}
          </p>
        </div>
      )}

      {!loading && searching && (
        <div className="glass-card equipos-resultados">
          <h2 className="equipos-resultados-title">
            {searchResults.length} resultado{searchResults.length === 1 ? "" : "s"} para «{qTrim}»
          </h2>
          {searchResults.length === 0 && <p className="muted equipo-card-empty">Nadie coincide con la búsqueda.</p>}
          {searchResults.map(({ miembro, equipoActualId, equipoChip }) => (
            <MoverMiembro
              key={miembro.id}
              miembro={miembro}
              equipoActualId={equipoActualId}
              equipos={equipos}
              canEdit={canEdit}
              open={movingId === miembro.id}
              busy={busyId === miembro.id}
              highlighted={false}
              equipoChip={equipoChip}
              onToggle={() => setMovingId((prev) => (prev === miembro.id ? null : miembro.id))}
              onMover={(destinoId) => handleMover(miembro, equipoActualId, destinoId)}
            />
          ))}
        </div>
      )}

      {!loading && !searching && tab === "resumen" && equipos.length > 0 && (
        <div className="equipos-grid">
          {equipos.map((equipo, i) => (
            <EquipoCard
              key={equipo.id}
              equipo={equipo}
              equipos={equipos}
              canEdit={canEdit}
              q=""
              movingId={null}
              busyId={null}
              delay={0.04 * i}
              variant="resumen"
              tamanoRelativo={equipo.stats.total / maxTamano}
              onSelect={() => setTab(equipo.id)}
              onToggleMove={() => {}}
              onMover={() => {}}
              onRename={() => handleRenombrar(equipo.id, equipo.nombre, equipo.color)}
              onDelete={() => handleBorrar(equipo.id)}
            />
          ))}
        </div>
      )}

      {!loading && !searching && equipoActivo && (
        <div className="equipos-grid equipos-grid--single">
          <EquipoCard
            equipo={equipoActivo}
            equipos={equipos}
            canEdit={canEdit}
            q=""
            movingId={movingId}
            busyId={busyId}
            variant="detalle"
            onToggleMove={(id) => setMovingId((prev) => (prev === id ? null : id))}
            onMover={handleMover}
            onRename={(nombre, color) => handleRenombrar(equipoActivo.id, nombre, color)}
            onDelete={() => handleBorrar(equipoActivo.id)}
          />
        </div>
      )}

      {!loading && !searching && tab === "sin-equipo" && sinEquipo.length > 0 && (
        <div className="glass-card equipos-sin-equipo">
          <h2 className="equipos-sin-equipo-title">Sin equipo ({sinEquipo.length})</h2>
          {sinEquipo.map((m) => (
            <MoverMiembro
              key={m.id}
              miembro={m}
              equipoActualId={null}
              equipos={equipos}
              canEdit={canEdit}
              open={movingId === m.id}
              busy={busyId === m.id}
              highlighted={false}
              onToggle={() => setMovingId((prev) => (prev === m.id ? null : m.id))}
              onMover={(destinoId) => handleMover(m, null, destinoId)}
            />
          ))}
        </div>
      )}

      <Toast message={toast} />
    </div>
  );
}
