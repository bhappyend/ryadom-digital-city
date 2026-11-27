"use client";

import { useSyncExternalStore } from "react";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface InstallState {
  installed: boolean;
  canPrompt: boolean;
  busy: boolean;
}

const initial: InstallState = { installed: false, canPrompt: false, busy: false };
let state = initial;
let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
let detach: (() => void) | undefined;

function publish(next: Partial<InstallState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!detach) {
    const media = window.matchMedia("(display-mode: standalone)");
    const sync = () => publish({ installed: media.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true || state.installed });
    const capture = (event: Event) => {
      event.preventDefault();
      deferred = event as InstallPromptEvent;
      publish({ canPrompt: true });
    };
    const installed = () => {
      deferred = null;
      publish({ installed: true, canPrompt: false, busy: false });
    };
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", installed);
    media.addEventListener("change", sync);
    sync();
    detach = () => {
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", installed);
      media.removeEventListener("change", sync);
      detach = undefined;
    };
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) detach?.();
  };
}

export function useInstallState() {
  return useSyncExternalStore(subscribe, () => state, () => initial);
}

/** Call directly from a user click; the browser event is consumed exactly once. */
export async function requestInstall(): Promise<"accepted" | "dismissed" | "unavailable" | "failed"> {
  const event = deferred;
  if (!event || state.busy) return "unavailable";
  deferred = null;
  publish({ canPrompt: false, busy: true });
  try {
    await event.prompt();
    return (await event.userChoice).outcome;
  } catch {
    return "failed";
  } finally {
    publish({ busy: false });
  }
}
