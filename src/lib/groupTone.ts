const GROUP_TONE_PRESETS = [
  {
    badge: "border-danger-light bg-danger-dark text-white shadow-chrome-sm",
    softBadge: "border-danger-light/80 bg-danger/15 text-danger-dark",
    panel: "border-danger-light/80",
    shell: "border-danger-light/35 bg-danger/8",
    item: "border-danger-light/30 bg-white/90",
    dot: "bg-danger-dark",
  },
  {
    badge: "border-warning-light bg-warning-dark text-white shadow-chrome-sm",
    softBadge: "border-warning-light/80 bg-warning/20 text-warning-dark",
    panel: "border-warning-light/80",
    shell: "border-warning-light/35 bg-warning/10",
    item: "border-warning-light/30 bg-white/90",
    dot: "bg-warning-dark",
  },
  {
    badge: "border-info-light bg-info-dark text-white shadow-chrome-sm",
    softBadge: "border-info-light/80 bg-info/15 text-info-dark",
    panel: "border-info-light/80",
    shell: "border-info-light/35 bg-info/8",
    item: "border-info-light/30 bg-white/90",
    dot: "bg-info-dark",
  },
  {
    badge: "border-success-light bg-success-dark text-white shadow-chrome-sm",
    softBadge: "border-success-light/80 bg-success/15 text-success-dark",
    panel: "border-success-light/80",
    shell: "border-success-light/35 bg-success/8",
    item: "border-success-light/30 bg-white/90",
    dot: "bg-success-dark",
  },
  {
    // primary preset 沿用 v1.0 的深藍 (legacy.primary)，等該頁遷移到 M3 後再改色
    badge: "border-legacy-primary-light bg-legacy-primary text-white shadow-chrome-sm",
    softBadge: "border-legacy-primary-light/80 bg-legacy-primary/15 text-legacy-primary",
    panel: "border-legacy-primary-light/80",
    shell: "border-legacy-primary-light/30 bg-legacy-primary/8",
    item: "border-legacy-primary-light/25 bg-white/90",
    dot: "bg-legacy-primary",
  },
] as const;

const NAMED_GROUP_TONES: Record<string, number> = {
  個人: 0,
  家庭: 1,
  吉他: 2,
  其他: 3,
  工作: 4,
};

function hashGroupName(groupName: string) {
  return Array.from(groupName).reduce((total, char) => total + char.charCodeAt(0), 0);
}

export function getGroupTone(groupName: string, fallbackIndex = 0) {
  const normalizedName = groupName.trim();
  const namedIndex = NAMED_GROUP_TONES[normalizedName];
  const resolvedIndex =
    typeof namedIndex === "number"
      ? namedIndex % GROUP_TONE_PRESETS.length
      : (hashGroupName(normalizedName) || fallbackIndex) % GROUP_TONE_PRESETS.length;

  return GROUP_TONE_PRESETS[resolvedIndex];
}
