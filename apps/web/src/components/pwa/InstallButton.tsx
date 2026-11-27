"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { requestInstall, useInstallState } from "./install-state";
import styles from "./pwa.module.css";

export interface InstallButtonProps {
  className?: string;
  children?: ReactNode;
}

function instructions(): string {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios) return "Откройте меню «Поделиться» в браузере и выберите «На экран Домой», если этот пункт доступен. Если его нет, откройте сайт в Safari и повторите. Название пункта может отличаться в вашей версии системы.";
  if (/Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR|Firefox/.test(ua)) {
    return "В Safari откройте меню «Файл» и выберите «Добавить в Dock», если этот пункт доступен. В старых версиях macOS можно сохранить сайт в закладках.";
  }
  return "Проверьте меню браузера или значок установки в адресной строке. Если доступен пункт «Установить приложение» или «Добавить на главный экран», выберите его и следуйте подсказкам. Если такого пункта нет, сохраните сайт в закладках. Возможность установки зависит от браузера и устройства.";
}

export function InstallButton({ className, children }: InstallButtonProps) {
  const state = useInstallState();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [help, setHelp] = useState("");
  const [message, setMessage] = useState("");

  async function install() {
    setMessage("");
    if (state.canPrompt) {
      const outcome = await requestInstall();
      if (outcome === "accepted") setMessage("Завершите установку по подсказкам браузера.");
      else if (outcome === "dismissed") setMessage("Установка отменена. Вы можете продолжить в браузере.");
      else if (outcome === "failed") setMessage("Не удалось открыть установку. Попробуйте через меню браузера.");
      if (outcome !== "unavailable") return;
    }
    setHelp(instructions());
    dialog.current?.showModal();
  }

  return <>
    <button ref={trigger} type="button" className={className ?? styles.install} onClick={() => { void install(); }} disabled={state.installed || state.busy}>
      {state.installed ? "Приложение установлено" : state.busy ? "Ожидаем ответ браузера…" : children ?? "Установить приложение"}
    </button>
    <span className={styles.srOnly} role="status">{state.installed ? "Приложение установлено" : message}</span>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId} aria-describedby={descriptionId}
      onKeyDown={(event) => {
        // Let the native modal own Tab/Escape rather than an outer navigation trap.
        if (event.key === "Tab" || event.key === "Escape") event.stopPropagation();
      }}
      onClose={() => trigger.current?.focus()}>
      <h2 id={titleId}>Рядом под рукой</h2>
      <p id={descriptionId}>{help}</p>
      <p>Для поиска мест и построения маршрутов нужен интернет.</p>
      <form method="dialog"><button type="submit" className={styles.primary}>Понятно</button></form>
    </dialog>
  </>;
}
