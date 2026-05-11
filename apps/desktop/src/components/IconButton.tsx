import type { ButtonHTMLAttributes, ReactNode } from "react";

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
  tone?: "neutral" | "primary" | "danger";
};

export function IconButton({ label, children, tone = "neutral", className = "", ...props }: IconButtonProps) {
  return (
    <button className={`icon-button icon-button--${tone} ${className}`} title={label} aria-label={label} {...props}>
      {children}
    </button>
  );
}
