"use client";

import type { QuickTemplate } from "../types";

type RecentTemplatesProps = {
  recentTemplates: QuickTemplate[];
  applyTemplate: (template: QuickTemplate) => void;
};

export function RecentTemplates({ recentTemplates, applyTemplate }: RecentTemplatesProps) {
  return (
    <section className="rounded-md bg-surface-container px-3 py-2">
      <p className="mb-2 text-label-md text-on-surface-variant">最近常用範本</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {recentTemplates.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => applyTemplate(template)}
            className="shrink-0 rounded-full border border-outline bg-surface px-3 py-1.5 text-body-sm text-on-surface hover:bg-on-surface/[0.03] active:bg-on-surface/[0.06]"
          >
            {template.label}
          </button>
        ))}
      </div>
    </section>
  );
}
