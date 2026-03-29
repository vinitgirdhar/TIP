import React, { useEffect, useState } from "react";
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { AppFooter } from "./components/layout/AppFooter";
import { Header } from "./components/layout/Header";
import { MobileBottomNav } from "./components/layout/MobileBottomNav";
import { MobileDrawer } from "./components/layout/MobileDrawer";
import { MobileTopBar } from "./components/layout/MobileTopBar";
import { Sidebar } from "./components/layout/Sidebar";
import { getShellNavItems, publicMobileNavItems } from "./components/layout/navItems";
import { AuthProvider } from "./context/AuthContext";
import { useAuth } from "./hooks/useAuth";
import { cn } from "./lib/utils";
import { EnrollFingerprint } from "./pages/EnrollFingerprint";
import { Landing } from "./pages/Landing";
import { Login } from "./pages/Login";
import { Overview } from "./pages/Overview";
import { Register } from "./pages/Register";
import { TapSimulator } from "./pages/TapSimulator";
import { TripLogs } from "./pages/TripLogs";
import { UserManagement } from "./pages/UserManagement";
import { UserPortal } from "./pages/UserPortal";

function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const shelllessRoutes = new Set(["/", "/login", "/register", "/enroll"]);
  const showShell = !shelllessRoutes.has(location.pathname) && Boolean(user);
  const showMobileChrome = Boolean(user) || location.pathname === "/login" || location.pathname === "/register";
  const showMobileDrawer = showMobileChrome && user?.role !== "USER";
  const showMobileBottomNav = !user || user.role === "USER";
  const mobileNavItems = user ? getShellNavItems(user.role) : publicMobileNavItems;

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex bg-surface overflow-x-clip">
      {showShell && <Sidebar />}

      {showMobileChrome ? (
        <>
          <MobileTopBar
            user={user}
            showMenuButton={showMobileDrawer}
            onMenuClick={() => setIsMobileMenuOpen(true)}
            onLogout={
              user
                ? () => {
                    logout();
                    navigate("/login", { replace: true });
                  }
                : undefined
            }
          />
          {showMobileDrawer ? (
            <MobileDrawer
              isOpen={isMobileMenuOpen}
              items={mobileNavItems}
              user={user}
              onClose={() => setIsMobileMenuOpen(false)}
              onLogout={
                user
                  ? () => {
                      logout();
                      navigate("/login", { replace: true });
                    }
                  : undefined
              }
            />
          ) : null}
          {showMobileBottomNav ? <MobileBottomNav items={mobileNavItems} pathname={location.pathname} /> : null}
        </>
      ) : null}

      <main
        className={cn(
          "w-full min-w-0",
          showShell && "lg:ml-64",
          showMobileChrome && "pt-[76px] lg:pt-0",
          showMobileBottomNav && "pb-[74px] lg:pb-0",
        )}
      >
        {showShell && <Header />}
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/enroll" element={<EnrollFingerprint />} />
            <Route path="/logs" element={<TripLogs />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={["ADMIN"]} />}>
            <Route path="/overview" element={<Overview />} />
            <Route path="/users" element={<UserManagement />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={["USER"]} />}>
            <Route path="/portal" element={<UserPortal />} />
            <Route path="/tap" element={<TapSimulator />} />
          </Route>
        </Routes>

        <AppFooter />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </AuthProvider>
  );
}
