import Link from "next/link";

type ApplicationIdentityProps = {
  asLink?: boolean;
  compact?: boolean;
};

export function ApplicationIdentity({
  asLink = false,
  compact = false,
}: ApplicationIdentityProps) {
  const content = (
    <>
      <span aria-hidden="true" className="identity-mark">
        KF
      </span>
      <span className="identity-text">
        <span className="identity-company">Koranco Farms</span>
        {!compact ? (
          <span className="identity-product">Farm Management</span>
        ) : null}
      </span>
    </>
  );

  if (asLink) {
    return (
      <Link
        aria-label="Koranco Farms home"
        className="application-identity application-identity-link"
        href="/"
      >
        {content}
      </Link>
    );
  }

  return <div className="application-identity">{content}</div>;
}
