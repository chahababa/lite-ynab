"use client";

import Link from "next/link";
import { Check } from "lucide-react";

import { CategoryPickerModal } from "@/components/CategoryPickerModal";
import { CtbcInboxShortcut } from "@/components/CtbcInboxShortcut";
import { PaymentMethodModal } from "@/components/PaymentMethodModal";
import { Toast } from "@/components/Toast";
import { Button as M3Button } from "@/components/m3/Button";

import { AmountCard } from "./components/AmountCard";
import { DateSheet } from "./components/DateSheet";
import { LastSavedNotice } from "./components/LastSavedNotice";
import { NoteField } from "./components/NoteField";
import { NumberPad } from "./components/NumberPad";
import { PaymentQuickPicker } from "./components/PaymentQuickPicker";
import { QuickCategoryGrid } from "./components/QuickCategoryGrid";
import { QuickEntryTopBar } from "./components/QuickEntryTopBar";
import { useQuickEntry } from "./hooks/useQuickEntry";

export default function QuickEntryPage() {
  const {
    router,
    allCategories,
    paymentMethods,
    visiblePaymentMethods,
    selectedPaymentMethodId,
    setSelectedPaymentMethodId,
    budgetStatusByCategory,
    monthSummary,
    amount,
    date,
    note,
    setNote,
    selectedCategoryId,
    setSelectedCategoryId,
    selectedCategory,
    loading,
    loadError,
    isSubmitting,
    isUndoing,
    toast,
    isPaymentModalOpen,
    setIsPaymentModalOpen,
    isCategoryModalOpen,
    setIsCategoryModalOpen,
    isDateSheetOpen,
    setIsDateSheetOpen,
    customDateInput,
    setCustomDateInput,
    lastSaved,
    isNoteVisible,
    setIsNoteVisible,
    visibleQuickCategories,
    noPaymentMethods,
    amountValue,
    handleKeypad,
    handleDateChipClick,
    applyDate,
    applyCustomDate,
    handleQuickCategoryTap,
    submitTransaction,
    undoLastSaved,
  } = useQuickEntry();

  const saveLabel = isSubmitting
    ? "儲存中..."
    : !amount
      ? "輸入金額後儲存"
      : selectedCategory
        ? `儲存到 ${selectedCategory.name}`
        : "儲存";

  return (
    <main className="min-h-screen bg-background font-sans text-on-surface">
      {toast ? <Toast message={toast.message} tone={toast.tone} /> : null}

      <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-4 py-3 pb-[88px]">
        <CtbcInboxShortcut />

        <QuickEntryTopBar monthSummary={monthSummary} />

        {noPaymentMethods ? (
          <div className="rounded-md bg-money-warn-container px-4 py-2 text-body-sm text-money-warn">
            尚未建立支付方式，請先到{" "}
            <Link href="/budget-allocation" className="font-medium underline">
              預算分配
            </Link>{" "}
            建立。
          </div>
        ) : null}

        <AmountCard
          date={date}
          handleDateChipClick={handleDateChipClick}
          amountValue={amountValue}
        />

        <PaymentQuickPicker
          visiblePaymentMethods={visiblePaymentMethods}
          hasMore={paymentMethods.length > visiblePaymentMethods.length}
          selectedId={selectedPaymentMethodId}
          onSelect={setSelectedPaymentMethodId}
          onOpenMore={() => setIsPaymentModalOpen(true)}
        />

        {/* 數字鍵固定在分類格上方：分類載入快慢不會推動金額與鍵盤 */}
        <NumberPad handleKeypad={handleKeypad} />

        <QuickCategoryGrid
          loading={loading}
          loadError={loadError}
          visibleQuickCategories={visibleQuickCategories}
          budgetStatusByCategory={budgetStatusByCategory}
          selectedCategoryId={selectedCategoryId}
          handleQuickCategoryTap={handleQuickCategoryTap}
          setIsCategoryModalOpen={setIsCategoryModalOpen}
          onRefresh={() => router.refresh()}
        />

        {lastSaved ? (
          <LastSavedNotice
            lastSaved={lastSaved}
            isUndoing={isUndoing}
            onUndo={() => void undoLastSaved()}
          />
        ) : null}

        {/* 多數記帳不寫備註，預設收摺；放下方避免展開時推動鍵盤 */}
        <NoteField
          note={note}
          setNote={setNote}
          isNoteVisible={isNoteVisible}
          setIsNoteVisible={setIsNoteVisible}
        />

        <M3Button
          variant="filled"
          onClick={() => void submitTransaction()}
          disabled={isSubmitting}
          className="h-12 text-body-lg"
          startIcon={<Check className="h-[18px] w-[18px]" />}
        >
          {saveLabel}
        </M3Button>
      </div>

      <PaymentMethodModal
        open={isPaymentModalOpen}
        paymentMethods={paymentMethods}
        selectedId={selectedPaymentMethodId}
        onSelect={(id) => setSelectedPaymentMethodId(id)}
        onClose={() => setIsPaymentModalOpen(false)}
      />

      <CategoryPickerModal
        open={isCategoryModalOpen}
        allCategories={allCategories}
        disabled={isSubmitting}
        onSelect={(categoryId) => {
          setSelectedCategoryId(categoryId);
        }}
        onClose={() => setIsCategoryModalOpen(false)}
      />

      {isDateSheetOpen ? (
        <DateSheet
          applyDate={applyDate}
          applyCustomDate={applyCustomDate}
          customDateInput={customDateInput}
          setCustomDateInput={setCustomDateInput}
          setIsDateSheetOpen={setIsDateSheetOpen}
        />
      ) : null}
    </main>
  );
}
