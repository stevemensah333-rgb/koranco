type LoadingIndicatorProps = { label?: string };

export function LoadingIndicator({ label = "Loading" }: LoadingIndicatorProps) {
  return (
    <span className="loading-indicator" role="status">
      <span aria-hidden="true" className="loading-spinner" />
      {label}
    </span>
  );
}
