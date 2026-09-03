import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

import { App } from "./App.js";
import { AuthProvider } from "./auth/AuthProvider.js";
import { ThemeProvider } from "./context/theme-provider.js";
import { I18nProvider } from "./i18n/I18nProvider.js";
import "./styles/global.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Dashboard root element is missing.");
}

createRoot(root).render(
  <StrictMode>
    <I18nProvider>
      <ThemeProvider>
        <BrowserRouter>
          <TooltipProvider>
            <AuthProvider>
              <App />
              <Toaster />
            </AuthProvider>
          </TooltipProvider>
        </BrowserRouter>
      </ThemeProvider>
    </I18nProvider>
  </StrictMode>,
);
