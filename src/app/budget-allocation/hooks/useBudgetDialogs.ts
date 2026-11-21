"use client";

import { useState } from "react";

import type { ConfirmDialogState, TextDialogState } from "../types";

/** State and submit handlers for the shared confirm dialog and single-field text dialog. */
export function useBudgetDialogs() {
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [textDialog, setTextDialog] = useState<TextDialogState | null>(null);
  const [textDialogValue, setTextDialogValue] = useState("");

  function openTextDialog(config: TextDialogState) {
    setTextDialogValue(config.initialValue ?? "");
    setTextDialog(config);
  }

  async function submitTextDialog() {
    if (!textDialog) return;
    const nextValue = textDialogValue.trim();
    if (!nextValue) return;
    await textDialog.onConfirm(nextValue);
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
