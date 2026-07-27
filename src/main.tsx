import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import { AuthProvider } from "./app/auth/AuthProvider.tsx";
import { AppErrorBoundary } from "./app/components/AppErrorBoundary.tsx";
import { initAnalytics } from "./app/lib/analytics.ts";
import { initFx } from "./app/lib/fx.ts";
import "./styles/index.css";

initAnalytics();
initFx();

createRoot(document.getElementById("root")!).render(
  <AppErrorBoundary>
    <AuthProvider>
      <App />
    </AuthProvider>
  </AppErrorBoundary>
);
