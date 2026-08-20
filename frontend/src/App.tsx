import { Suspense, lazy } from "react";
import { useLocation } from "react-router-dom";
import { Route, Routes } from "react-router-dom";
import { LazyMotion, domAnimation } from "motion/react";
import { CanopyBackground } from "./components/CanopyBackground";
import { Footer } from "./components/Footer";
import { Navbar } from "./components/Navbar";
import { PageTransition } from "./components/PageTransition";
import { AdminAuthProvider } from "./lib/AdminAuthContext";
import { SettingsProvider } from "./lib/SettingsContext";
import { Confirmacion } from "./pages/Confirmacion";
import { Registro } from "./pages/Registro";

// El área admin va en su propio chunk: nadie del público pasa por estas
// rutas, así que no tiene sentido que su código viaje en el bundle inicial
// que descarga cada campero solo para llenar el formulario.
const AdminLogin = lazy(() => import("./pages/AdminLogin").then((m) => ({ default: m.AdminLogin })));
const AdminPanel = lazy(() => import("./pages/AdminPanel").then((m) => ({ default: m.AdminPanel })));
const AdminUsers = lazy(() => import("./pages/AdminUsers").then((m) => ({ default: m.AdminUsers })));
const Recepcion = lazy(() => import("./pages/Recepcion").then((m) => ({ default: m.Recepcion })));
const Equipos = lazy(() => import("./pages/Equipos").then((m) => ({ default: m.Equipos })));

function AppRoutes() {
  const location = useLocation();
  const isAdminArea = location.pathname.startsWith("/admin");

  return (
    <>
      <CanopyBackground variant={isAdminArea ? "sutil" : "full"} />
      <div className="app-shell">
        <Navbar />
        <main className="app-main">
          <PageTransition>
            <Suspense fallback={null}>
              <Routes location={location}>
                <Route path="/" element={<Registro />} />
                <Route path="/registro-exitoso" element={<Confirmacion />} />
                <Route path="/admin" element={<AdminLogin />} />
                <Route path="/admin/panel" element={<AdminPanel />} />
                <Route path="/admin/usuarios" element={<AdminUsers />} />
                <Route path="/admin/recepcion" element={<Recepcion />} />
                <Route path="/admin/equipos" element={<Equipos />} />
              </Routes>
            </Suspense>
          </PageTransition>
        </main>
        <Footer />
      </div>
    </>
  );
}

export default function App() {
  return (
    // domAnimation cubre animate/exit/whileHover/whileTap/whileInView — todo
    // lo que usa este proyecto — sin el código de drag/layout de domMax, que
    // no se usa en ningún lado. Junto con `m.*` (en vez de `motion.*`) en
    // cada componente, esto es lo que permite el tree-shaking real de
    // `motion`; usar `motion.*` en cualquier parte reintroduce el bundle
    // completo pese a este wrapper.
    <LazyMotion features={domAnimation} strict>
      <AdminAuthProvider>
        <SettingsProvider>
          <AppRoutes />
        </SettingsProvider>
      </AdminAuthProvider>
    </LazyMotion>
  );
}
