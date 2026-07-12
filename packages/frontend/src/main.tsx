import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import "./index.css";

// 開発時のみモック有効化（VITE_USE_MOCKS=true の場合）
async function enableMocks() {
  if (import.meta.env.DEV && import.meta.env.VITE_USE_MOCKS === "true") {
    const { worker } = await import("./mocks/browser");
    await worker.start({
      onUnhandledRequest: "bypass",
      serviceWorker: { url: "/mockServiceWorker.js" },
    });
  }
}

enableMocks().finally(() => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
