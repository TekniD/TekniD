"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // In dev, a caching worker gets in the way of hot reload.
    if (process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
      console.error("Service worker registration failed", err);
    });
  }, []);
  return null;
}
