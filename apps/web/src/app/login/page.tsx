import { ApplicationIdentity } from "@/components/shells/application-identity";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-heading">
        <header className="login-header">
          <ApplicationIdentity />
          <h1 id="login-heading">Sign in</h1>
          <p>Use your authorized Koranco application account.</p>
        </header>
        <LoginForm />
      </section>
    </main>
  );
}
