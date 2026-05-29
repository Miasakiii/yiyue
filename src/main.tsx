import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Global error handler for uncaught errors
window.addEventListener("error", (event) => {
  console.error("Global error:", event.error);
});
window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled rejection:", event.reason);
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Global error handler for uncaught errors
window.addEventListener("error", (event) => {
  console.error("Global error:", event.error);
});
window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled rejection:", event.reason);
});
