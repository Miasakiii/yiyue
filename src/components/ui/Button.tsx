import type { ButtonHTMLAttributes, CSSProperties } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs gap-1.5",
  md: "px-4 py-2 text-sm gap-2",
};

const variantStyles: Record<ButtonVariant, CSSProperties> = {
  primary: {
    background: "linear-gradient(135deg, var(--accent), var(--accent-hover))",
    // eslint-disable-next-line no-restricted-syntax -- accent 底上的白色前景，各主题通用，暂无 --text-on-accent 令牌
    color: "#fff",
    boxShadow: "0 2px 8px color-mix(in srgb, var(--accent) 30%, transparent)",
  },
  secondary: {
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    border: "1px solid var(--border)",
  },
  ghost: {
    background: "transparent",
    color: "var(--text-secondary)",
  },
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  style,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={[
        "inline-flex items-center justify-center font-medium rounded-md transition-all",
        sizeClasses[size],
        variant === "ghost" ? "hover-bg" : "",
        disabled ? "opacity-50 cursor-not-allowed" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ ...variantStyles[variant], ...style }}
      {...rest}
    />
  );
}
