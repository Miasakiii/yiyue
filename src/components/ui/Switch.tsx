export type SwitchSize = "sm" | "md";

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: SwitchSize;
  className?: string;
  title?: string;
}

const sizes: Record<SwitchSize, { trackW: number; trackH: number; knob: number; pad: number }> = {
  sm: { trackW: 32, trackH: 16, knob: 12, pad: 2 },
  md: { trackW: 40, trackH: 20, knob: 14, pad: 3 },
};

/** Slider-style toggle; accent color when on. */
export function Switch({
  checked,
  onChange,
  disabled = false,
  size = "md",
  className = "",
  title,
}: SwitchProps) {
  const s = sizes[size];
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      title={title}
      disabled={disabled}
      className={[
        "rounded-full relative transition-all flex-shrink-0",
        disabled ? "opacity-50 cursor-not-allowed" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        width: s.trackW,
        height: s.trackH,
        background: checked ? "var(--accent)" : "var(--bg-tertiary)",
      }}
      onClick={() => onChange(!checked)}
    >
      <span
        className="rounded-full absolute transition-all"
        style={{
          width: s.knob,
          height: s.knob,
          top: (s.trackH - s.knob) / 2,
          left: checked ? s.trackW - s.knob - s.pad : s.pad,
          // eslint-disable-next-line no-restricted-syntax -- 开关旋钮固定白色（iOS 风格），各主题通用
          background: "#fff",
          boxShadow: "var(--shadow-sm)",
        }}
      />
    </button>
  );
}
