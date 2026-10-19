import { Routes, Route, Navigate } from "react-router-dom";
import { ShellLayout } from "./components/ShellLayout";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ROUTES } from "./routes/nav-config";

export function App() {
  return (
    <ShellLayout>
      <Routes>
        {ROUTES.map(({ path, view: View }) => (
          <Route
            key={path}
            path={path}
            element={
              <ErrorBoundary>
                <View />
              </ErrorBoundary>
            }
          />
        ))}
        {/* NEXT.md A2 binds the Dashboard destination to /dashboard; the
            bare root redirects there rather than being its own screen. */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        {/* Unknown paths land on the dashboard, never a dead end. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ShellLayout>
  );
}
