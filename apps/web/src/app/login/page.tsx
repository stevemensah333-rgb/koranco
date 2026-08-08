import { ApplicationIdentity } from "@/components/shells/application-identity";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <div className="login-page">
      <header className="management-brandbar login-brandbar">
        <ApplicationIdentity />
      </header>
      <main className="login-body">
        <section className="login-panel" aria-labelledby="login-heading">
          <div className="login-header">
            <h1 id="login-heading">Sign in</h1>
            <p>Use your authorized Koranco application account.</p>
          </div>
          <LoginForm />
        </section>
      </main>
    </div>
  );
}
