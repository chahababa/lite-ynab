"use client";

import { useEffect } from "react";

type Options = {
  open: boolean;
  onClose: () => void;
  /** Identifier pushed to history.state so popstate can route back. */
  historyKey: string;
};

/**
 * Wires up the cross-cutting concerns every modal needs:
 *  - lock body scroll while open
 *  - close on ESC
 *  - close on Android browser back (history popstate)
 *
 * Caller is responsible for overlay click handling and stopPropagation on the card.
 */
export function useModalLifecycle({ open, onClose, historyKey }: Options): void {
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    window.history.pushState({ modal: historyKey }, "");
    const handler = () => onClose();
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, [open, onClose, historyKey]);
}
