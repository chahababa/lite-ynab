"use client";

type NoteFieldProps = {
  note: string;
  setNote: (value: string) => void;
  isNoteVisible: boolean;
  setIsNoteVisible: (visible: boolean) => void;
};

export function NoteField({ note, setNote, isNoteVisible, setIsNoteVisible }: NoteFieldProps) {
  return isNoteVisible || note !== "" ? (
    <input
      value={note}
      onChange={(e) => setNote(e.target.value)}
      placeholder="備註（可留空）"
      aria-label="備註"
      autoFocus={isNoteVisible && note === ""}
      className="h-10 px-4 rounded-xs border border-outline-variant bg-surface text-body-md text-on-surface outline-none focus:border-primary focus:border-2 focus:px-[15px]"
    />
  ) : (
    <button
      type="button"
      onClick={() => setIsNoteVisible(true)}
      className="self-start text-label-md text-on-surface-variant hover:text-on-surface"
    >
      ＋ 加備註
    </button>
  );
}
