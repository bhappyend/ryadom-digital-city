"use client";

import { useEffect, useRef, useState } from "react";
import { useInstallState } from "./install-state";
import styles from "./pwa.module.css";

export function PwaRegistration() {
  // Also capture the install event when the header button is temporarily unmounted.
  useInstallState();
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const wantsReload = useRef(false);
  const reloaded = useRef(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
    if (process.env.NODE_ENV !== "production" || !(window.location.protocol === "https:" || local) ||
        !window.isSecureContext || !("serviceWorker" in navigator)) return;
    let disposed = false;
    let registration: ServiceWorkerRegistration | undefined;
    let installing: ServiceWorker | null = null;
    let lastCheck = Date.now();
    const observeWaiting = () => {
      if (!disposed && registration?.waiting && navigator.serviceWorker.controller) {
        setWaiting(registration.waiting);
        setDismissed(false);
      }
    };
    const stateChange = () => {
      if (installing?.state === "installed") observeWaiting();
    };
    const updateFound = () => {
      installing?.removeEventListener("statechange", stateChange);
      installing = registration?.installing ?? null;
      installing?.addEventListener("statechange", stateChange);
    };
    const controllerChange = () => {
      // Initial claim or another tab's update must not reload this session.
      if (!wantsReload.current || reloaded.current) return;
      reloaded.current = true;
      wantsReload.current = false;
      clearTimeout(timeout.current);
      window.location.reload();
    };
    const check = () => {
      if (document.visibilityState === "visible" && Date.now() - lastCheck >= 60_000) {
        lastCheck = Date.now();
        void registration?.update().catch(() => { /* Keep the current version while offline. */ });
      }
    };
    navigator.serviceWorker.addEventListener("controllerchange", controllerChange);
    document.addEventListener("visibilitychange", check);
    void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then((result) => {
      if (disposed) return;
      registration = result;
      registration.addEventListener("updatefound", updateFound);
      updateFound();
      observeWaiting();
    }).catch(() => {
      // Browsing remains usable. Registration failures do not imply offline support.
    });
    return () => {
      disposed = true;
      wantsReload.current = false;
      clearTimeout(timeout.current);
      navigator.serviceWorker.removeEventListener("controllerchange", controllerChange);
      document.removeEventListener("visibilitychange", check);
      registration?.removeEventListener("updatefound", updateFound);
      installing?.removeEventListener("statechange", stateChange);
    };
  }, []);

  function update() {
    if (!waiting || updating) return;
    // Another tab may already have activated this exact worker. Still require a click.
    if (waiting.state === "activated") {
      if (!reloaded.current) {
        reloaded.current = true;
        window.location.reload();
      }
      return;
    }
    wantsReload.current = true;
    setUpdating(true);
    setError("");
    timeout.current = setTimeout(() => {
      wantsReload.current = false;
      setUpdating(false);
      setError("Обновление пока не завершилось. Попробуйте ещё раз позже.");
    }, 12_000);
    try {
      waiting.postMessage({ type: "SKIP_WAITING" });
    } catch {
      clearTimeout(timeout.current);
      wantsReload.current = false;
      setUpdating(false);
      setError("Не удалось обновить приложение. Попробуйте позже.");
    }
  }

  if (!waiting || dismissed) return null;
  return <aside className={styles.update} aria-label="Обновление приложения">
    <p role="status">{error || "Доступна новая версия Рядом. Страница обновится, когда вы будете готовы."}</p>
    <div className={styles.actions}>
      <button type="button" className={styles.primary} onClick={update} disabled={updating}>{updating ? "Обновляем…" : "Обновить"}</button>
      <button type="button" className={styles.secondary} disabled={updating} onClick={() => setDismissed(true)}>Позже</button>
    </div>
  </aside>;
}
