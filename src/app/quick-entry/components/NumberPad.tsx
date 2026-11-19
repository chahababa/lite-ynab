"use client";

import { Delete } from "lucide-react";

import { KEYPAD_KEYS } from "../helpers";

type NumberPadProps = {
  handleKeypad: (key: (typeof KEYPAD_KEYS)[number]) => void;
};

export function NumberPad({ handleKeypad }: NumberPadProps) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {KEYPAD_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => handleKeypad(key)}
          aria-label={key === "del" ? "刪除" : key}
          className="h-11 rounded-md bg-surface-container text-on-surface font-mono text-num-title font-medium hover:bg-surface-container-high active:bg-surface-container-highest"
        >
          {key === "del" ? <Delete className="mx-auto h-5 w-5" /> : key}
        </button>
      ))}
    </div>
  );
}
