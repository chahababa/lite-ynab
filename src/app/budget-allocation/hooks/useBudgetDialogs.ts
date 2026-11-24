"use client";

import { useRef, useState } from "react";

import type { ConfirmDialogState, TextDialogState } from "../types";

/** State and submit handlers for the shared confirm dialog and single-field text dialog. */
export function useBudgetDialogs() {
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [textDialog, setTextDialog] = useState<TextDialogState | null>(null);
  const [textDialogValue, setTextDialogValue] = useState("");

  // Set when a dialog is opened from inside another dialog's onConfirm (two-step flows), so the
  // submit handler does not close the dialog that was just opened.
  const chained = useRef(false);

  function openTextDialog(config: TextDialogState) {
    chained.current = true;
    setTextDialogValue(config.initialValue ?? "");
    setTextDialog(config);
  }

  async function submitTextDialog() {
    if (!textDialog) return;
    const nextValue = textDialogValue.trim();
    if (!nextValue) return;
    chained.current = false;
    await textDialog.onConfirm(nextValue);
    if (chained.current) return;
    setTextDialog(null);
    setTextDialogValue("");
  }

  async function submitConfirmDialog() {
    if (!confirmDialog) return;
    const action = confirmDialog.onConfirm;
    setConfirmDialog(null);
    await action();
  }

  return {
    confirmDialog,
    setConfirmDialog,
    textDialog,
    setTextDialog,
    textDialogValue,
    setTextDialogValue,
    openTextDialog,
    submitTextDialog,
    submitConfirmDialog,
  };
}
