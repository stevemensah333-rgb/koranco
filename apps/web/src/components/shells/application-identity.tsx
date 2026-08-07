type ApplicationIdentityProps = { compact?: boolean };

export function ApplicationIdentity({
  compact = false,
}: ApplicationIdentityProps) {
  return (
    <div className="application-identity">
      <span aria-hidden="true" className="identity-mark">
        KF
      </span>
      <span>
        <span className="identity-company">Koranco Farms</span>
        {!compact ? (
          <span className="identity-product">Farm Management</span>
        ) : null}
      </span>
    </div>
  );
}
