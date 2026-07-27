import React from "react";
import ReactDOM from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import * as Sentry from "@sentry/react";
import App from "./App";
import { initObservability } from "./lib/observability";
import "./styles/globals.css";

initObservability();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<p>Something went wrong. Please restart Ascurix.</p>}>
      <MemoryRouter>
        <App />
      </MemoryRouter>
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);
