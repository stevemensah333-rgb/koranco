import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

type ValidationProps = { invalid?: boolean };

export function TextInput({
  className = "",
  invalid = false,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & ValidationProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={`text-input ${invalid ? "input-error" : ""} ${className}`.trim()}
      {...props}
    />
  );
}

export function SelectInput({
  children,
  className = "",
  invalid = false,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & ValidationProps) {
  return (
    <select
      aria-invalid={invalid || undefined}
      className={`select-input ${invalid ? "input-error" : ""} ${className}`.trim()}
      {...props}
    >
      {children}
    </select>
  );
}

export function TextArea({
  className = "",
  invalid = false,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & ValidationProps) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={`text-area ${invalid ? "input-error" : ""} ${className}`.trim()}
      {...props}
    />
  );
}
