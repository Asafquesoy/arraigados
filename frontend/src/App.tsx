import { useLocation } from "react-router-dom";
import { Route, Routes } from "react-router-dom";
import { CanopyBackground } from "./components/CanopyBackground";
import { Footer } from "./components/Footer";
import { Navbar } from "./components/Navbar";
import { PageTransition } from "./components/PageTransition";
import { AdminAuthProvider } from "./lib/AdminAuthContext";
import { AdminLogin } from "./pages/AdminLogin";
import { AdminPanel } from "./pages/AdminPanel";
import { Confirmacion } from "./pages/Confirmacion";
import { Registro } from "./pages/Registro";

function AppRoutes() {
  const location = useLocation();
  const isAdminArea = location.pathname.startsWith("/admin");

  return (
    <>
      <CanopyBackground variant={isAdminArea ? "sutil" : "full"} />
      <div className="app-shell">
        <Navbar />
        <main style={{ flex: 1 }}>
          <PageTransition>
            <Routes location={location}>
              <Route path="/" element={<Registro />} />
              <Route path="/registro-exitoso" element={<Confirmacion />} />
              <Route path="/admin" element={<AdminLogin />} />
              <Route path="/admin/panel" element={<AdminPanel />} />
            </Routes>
          </PageTransition>
        </main>
        <Footer />
      </div>
    </>
  );
}

export default function App() {
  return (
    <AdminAuthProvider>
      <AppRoutes />
    </AdminAuthProvider>
  );
}
