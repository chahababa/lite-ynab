"use client";

import { useState } from "react";

import type { PaymentMethodOption } from "@/lib/types";

import { getErrorMessage } from "../helpers";
import type {
  ConfirmDialogState,
  SetPendingKey,
  SetState,
  SetToast,
  SupabaseBrowserClient,
  TextDialogState,
} from "../types";

type UsePaymentMethodActionsArgs = {
  supabase: SupabaseBrowserClient;
  paymentMethods: PaymentMethodOption[];
  setPaymentMethods: SetState<PaymentMethodOption[]>;
  setPendingKey: SetPendingKey;
  setToast: SetToast;
  setConfirmDialog: SetState<ConfirmDialogState | null>;
  openTextDialog: (config: TextDialogState) => void;
};

/** Payment method (支付方式) management: add, rename, delete. */
export function usePaymentMethodActions({
  supabase,
  paymentMethods,
  setPaymentMethods,
  setPendingKey,
  setToast,
  setConfirmDialog,
  openTextDialog,
}: UsePaymentMethodActionsArgs) {
  const [newPaymentMethodName, setNewPaymentMethodName] = useState("");

  async function addPaymentMethod() {
    const nextName = newPaymentMethodName.trim();
    if (!nextName) {
      return;
    }

    setPendingKey("payment-add");

    try {
      const nextSortOrder =
        paymentMethods.reduce((max, item) => Math.max(max, item.sortOrder), 0) + 10;
      const result = await supabase
        .from("payment_methods")
        .insert({
          name: nextName,
          sort_order: nextSortOrder,
        })
        .select("id,name,sort_order")
        .single();

      if (result.error || !result.data) {
        throw result.error ?? new Error("新增支付方式失敗");
      }

      setPaymentMethods((current) => [
        ...current,
        {
          id: result.data.id,
          name: result.data.name,
          sortOrder: result.data.sort_order,
        },
      ]);
      setNewPaymentMethodName("");
      setToast({ tone: "success", message: `已新增支付方式「${nextName}」。` });
    } catch (error) {
      setToast({ tone: "error", message: `新增支付方式失敗：${getErrorMessage(error)}` });
    } finally {
      setPendingKey(null);
    }
  }

  function renamePaymentMethod(method: PaymentMethodOption) {
    openTextDialog({
      title: "重新命名支付方式",
      label: "支付方式名稱",
      initialValue: method.name,
      confirmLabel: "儲存名稱",
      onConfirm: async (nextName) => {
        if (nextName === method.name) return;
        setPendingKey(`payment-rename-${method.id}`);
        try {
          const { error } = await supabase.from("payment_methods").update({ name: nextName }).eq("id", method.id);
          if (error) throw error;
          setPaymentMethods((current) =>
            current.map((item) => (item.id === method.id ? { ...item, name: nextName } : item)),
          );
          setToast({ tone: "success", message: `已將支付方式更新為「${nextName}」。` });
        } catch (error) {
          setToast({ tone: "error", message: `重新命名支付方式失敗：${getErrorMessage(error)}` });
        } finally {
          setPendingKey(null);
        }
      },
    });
  }

  async function deletePaymentMethod(method: PaymentMethodOption, confirmed = false) {
    if (!confirmed) {
      setConfirmDialog({
        title: `刪除支付方式「${method.name}」`,
        description: "如果仍有交易使用它，系統會先阻擋刪除並提示交易筆數。",
        confirmLabel: "檢查並刪除",
        tone: "danger",
        onConfirm: () => deletePaymentMethod(method, true),
      });
      return;
    }

    setPendingKey(`payment-delete-${method.id}`);

    try {
      // 先計算還有幾筆交易用這個支付方式（包含所有月份），給出明確訊息
      const { count: txCount } = await supabase
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("payment_method_id", method.id);

      if (txCount && txCount > 0) {
        setToast({
          tone: "error",
          message: `「${method.name}」還有 ${txCount} 筆交易（含過去月份），請先到 /transactions 跨月份刪除或改成其他支付方式後再刪`,
        });
        return;
      }

      const { error } = await supabase.from("payment_methods").delete().eq("id", method.id);
      if (error) {
        throw error;
      }

      setPaymentMethods((current) => current.filter((item) => item.id !== method.id));
      setToast({ tone: "success", message: `已刪除支付方式「${method.name}」。` });
    } catch (error) {
      setToast({ tone: "error", message: `刪除支付方式失敗：${getErrorMessage(error)}` });
    } finally {
      setPendingKey(null);
    }
  }

  return {
    newPaymentMethodName,
    setNewPaymentMethodName,
    addPaymentMethod,
    renamePaymentMethod,
    deletePaymentMethod,
  };
}
