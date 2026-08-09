import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "quiet";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  fullWidth?: boolean;
  variant?: ButtonVariant;
};

export function Button({
  className = "",
  fullWidth = false,
  type = "button",
  variant = "primary",
  ...props
}: ButtonProps) {
  const classes = [
    "button",
    `button-${variant}`,
    fullWidth ? "button-full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <button className={classes} type={type} {...props} />;
}
