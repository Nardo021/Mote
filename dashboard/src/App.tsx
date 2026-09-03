import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { AuthenticatedLayout } from "./components/layout/authenticated-layout.js";
import { LoadingState } from "./components/LoadingState.js";
import { ActivityPage } from "./features/activity/index.js";
import { DeviceDetailPage } from "./features/devices/detail.js";
import { DevicesPage } from "./features/devices/index.js";
import { LoginPage } from "./features/login/index.js";
import { OverviewPage } from "./features/overview/index.js";
import { SettingsPage } from "./features/settings/index.js";
import { TokensPage } from "./features/tokens/index.js";
import { useAuth } from "./hooks/useAuth.js";

function RequireAuth({ children }: { children: ReactNode }) {
  const { ready, user } = useAuth();
  if (!ready) {
    return <LoadingState />;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AuthenticatedLayout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<OverviewPage />} />
        <Route path="/devices" element={<DevicesPage />} />
        <Route path="/devices/:id" element={<DeviceDetailPage />} />
        <Route path="/tokens" element={<TokensPage />} />
        <Route path="/activity" element={<ActivityPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
