"use client";

import Link from "next/link";
import { Check } from "lucide-react";

import { CategoryPickerModal } from "@/components/CategoryPickerModal";
import { CtbcInboxShortcut } from "@/components/CtbcInboxShortcut";
import { PaymentMethodModal } from "@/components/PaymentMethodModal";
import { Toast } from "@/components/Toast";
import { Button as M3Button } from "@/components/m3/Button";
import { Chip as M3Chip } from "@/components/m3/Chip";

import { AmountCard } from "./components/AmountCard";
import { DateSheet } from "./components/DateSheet";
import { EntryTypeToggle } from "./components/EntryTypeToggle";
import { LastSavedNotice } from "./components/LastSavedNotice";
import { NoteField } from "./components/NoteField";
import { NumberPad } from "./components/NumberPad";
import { QuickCategoryGrid } from "./components/QuickCategoryGrid";
import { QuickEntryTopBar } from "./components/QuickEntryTopBar";
import { RecentTemplates } from "./components/RecentTemplates";
import { TextEntrySection } from "./components/TextEntrySection";
import { useQuickEntry } from "./hooks/useQuickEntry";

export default function QuickEntryPage() {
  const {
    router,
    allCategories,
    paymentMethods,
    selectedPaymentMethodId,
    setSelectedPaymentMethodId,
    entryType,
    amount,
    date,
    note,
    setNote,
    selectedCategoryId,
    setSelectedCategoryId,
    loading,
    loadError,
    isSubmitting,
    toast,
    isPaymentModalOpen,
    setIsPaymentModalOpen,
    isCategoryModalOpen,
    setIsCategoryModalOpen,
    isDateSheetOpen,
    setIsDateSheetOpen,
    customDateInput,
    setCustomDateInput,
    textEntry,
    setTextEntry,
    recentTemplates,
    lastSaved,
    isNoteVisible,
    setIsNoteVisible,
    selectedPaymentMethod,
    visibleQuickCategories,
    ambiguousNames,
    noPaymentMethods,
    amountValue,
    parsedText,
    handleKeypad,
    handleEntryTypeChange,
    handleDateChipClick,
    applyDate,
    applyCustomDate,
    applyTextEntry,
    applyTemplate,
    handleQuickCategoryTap,
    submitTransaction,
  } = useQuickEntry();

  return (
    <main className="min-h-screen bg-background font-sans text-on-surface">
      {toast ? <Toast message={toast.message} tone={toast.tone} /> : null}

      <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-4 py-3 pb-[88px]">
        <CtbcInboxShortcut />
        {/* Top bar */}
        <QuickEntryTopBar onClose={() => router.push("/dashboard")} />

        {/* Banner: 沒有支付方式 */}
        {noPaymentMethods ? (
          <div className="rounded-md bg-money-warn-container px-4 py-2 text-body-sm text-money-warn">
            尚未建立支付方式，請先到{" "}
            <Link href="/settings" className="font-medium underline">
              設定
            </Link>{" "}
            建立。
          </div>
        ) : null}

        {/* Amount card */}
        <AmountCard
          date={date}
          handleDateChipClick={handleDateChipClick}
          paymentMethods={paymentMethods}
          selectedPaymentMethod={selectedPaymentMethod}
          setIsPaymentModalOpen={setIsPaymentModalOpen}
          amountValue={amountValue}
          entryType={entryType}
        />
        {/* Payment method chips */}
        <div className="flex gap-1 overflow-x-auto pb-1">
          {paymentMethods.map((pm) => (
            <M3Chip
              key={pm.id}
              selected={pm.id === selectedPaymentMethodId}
              onClick={() => setSelectedPaymentMethodId(pm.id)}
              className="h-7 px-3 text-body-sm flex-shrink-0"
            >
              {pm.name}
            </M3Chip>
          ))}
        </div>

        {/* Number pad */}
        <NumberPad handleKeypad={handleKeypad} />

        {/* Category 1×6 grid：放在數字鍵下方，載入快慢不會推動上方的金額與鍵盤 */}
        <QuickCategoryGrid
          loading={loading}
          loadError={loadError}
          visibleQuickCategories={visibleQuickCategories}
          ambiguousNames={ambiguousNames}
          selectedCategoryId={selectedCategoryId}
          handleQuickCategoryTap={handleQuickCategoryTap}
          setIsCategoryModalOpen={setIsCategoryModalOpen}
          onRefresh={() => router.refresh()}
        />

        {/* 已儲存通知：放在鍵盤下方，出現時不會推動輸入區 */}
        {lastSaved ? <LastSavedNotice lastSaved={lastSaved} /> : null}

        {/* Note：多數記帳不寫備註，預設收摺；放下方避免展開時推動鍵盤 */}
        <NoteField
          note={note}
          setNote={setNote}
          isNoteVisible={isNoteVisible}
          setIsNoteVisible={setIsNoteVisible}
        />

        {/* Save button */}
        <M3Button
          variant="filled"
          onClick={() => void submitTransaction()}
          disabled={isSubmitting}
          className="h-12 text-body-lg"
          startIcon={<Check className="h-[18px] w-[18px]" />}
        >
          {isSubmitting ? "儲存中..." : amount ? "儲存" : "輸入金額後儲存"}
        </M3Button>

        {/* Type segmented toggle */}
        <EntryTypeToggle entryType={entryType} handleEntryTypeChange={handleEntryTypeChange} />

        {/* Text / Telegram-style entry */}
        <TextEntrySection
          textEntry={textEntry}
          setTextEntry={setTextEntry}
          applyTextEntry={applyTextEntry}
          loading={loading}
          parsedText={parsedText}
        />

        {recentTemplates.length > 0 ? (
          <RecentTemplates recentTemplates={recentTemplates} applyTemplate={applyTemplate} />
        ) : null}

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
