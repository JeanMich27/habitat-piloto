import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { AuthProvider } from "./lib/authContext";
import { registrarServiceWorker } from "./lib/registrarServiceWorker";
import BannerInstalacion from "./components/BannerInstalacion";

registrarServiceWorker();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <App />
      <BannerInstalacion />
    </AuthProvider>
  </StrictMode>,
);
