import type { ReactNode } from "react";

type FormFieldProps = {
  children: ReactNode;
  description?: string;
  error?: string;
  htmlFor: string;
  label: string;
  optional?: boolean;
};

export function FormField({
  children,
  description,
  error,
  htmlFor,
  label,
  optional = false,
}: FormFieldProps) {
  const descriptionId = description ? `${htmlFor}-description` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;

  return (
    <div className="form-field">
      <label className="field-label" htmlFor={htmlFor}>
        {label}
        <span className="field-requirement">
          {optional ? "(optional)" : "(required)"}
        </span>
      </label>
      {description ? (
        <p className="field-description" id={descriptionId}>
          {description}
        </p>
      ) : null}
      {children}
      {error ? (
        <p className="field-error" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function fieldDescriptionIds(
  id: string,
  options: { description?: boolean; error?: boolean },
) {
  return [
    options.description ? `${id}-description` : "",
    options.error ? `${id}-error` : "",
  ]
    .filter(Boolean)
    .join(" ");
}
