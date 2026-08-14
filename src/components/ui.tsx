import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};

const VARIANTS: Record<string, string> = {
  primary:
    "bg-brand-500 text-ink-950 font-semibold hover:bg-brand-400 active:bg-brand-600 shadow-[0_1px_0_0_rgba(255,255,255,0.25)_inset]",
  secondary:
    "bg-ink-700/70 text-ink-100 hover:bg-ink-600/70 border border-ink-600/70",
  ghost: "text-ink-300 hover:text-ink-100 hover:bg-ink-700/50",
  danger: "text-red-300 hover:text-red-200 hover:bg-red-500/10 border border-red-500/25",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={cx(
        "focus-ring inline-flex items-center justify-center gap-2 rounded-xl transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        size === "sm" ? "px-3 py-1.5 text-sm" : "px-4 py-2.5 text-sm",
        VARIANTS[variant],
        className,
      )}
    />
  );
}

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        "focus-ring w-full rounded-xl border border-ink-600/70 bg-ink-900/70 px-3.5 py-2.5 text-ink-100 placeholder:text-ink-400 transition-colors hover:border-ink-600",
        className,
      )}
    />
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-300">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1.5 block text-xs text-ink-400">{hint}</span> : null}
    </label>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2.5", className)}>
      <span className="relative grid h-8 w-8 place-items-center rounded-lg bg-brand-500 font-bold text-ink-950">
        <span className="absolute inset-0 rounded-lg bg-brand-500 blur-md opacity-40" />
        <span className="relative">P</span>
      </span>
      <span className="text-lg font-semibold tracking-tight">Pointify</span>
    </span>
  );
}
