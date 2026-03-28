import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import type { UserRole } from "../../shared/types";

interface ProtectedRouteProps {
  allowedRoles?: UserRole[];
}

export function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const { user, token, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center px-6">
        <div className="bg-surface-container-low p-10 border-l-4 border-primary max-w-md w-full">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-on-surface-variant mb-3">
            Session Handshake
          </p>
          <h2 className="text-3xl font-black text-primary uppercase tracking-tight">Validating Access</h2>
        </div>
      </div>
    );
  }

  if (!token || !user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={user.role === "ADMIN" ? "/overview" : "/portal"} replace />;
  }

  return <Outlet />;
}
