import Image from "next/image";

import { LoginForm } from "@/components/auth/login-form";

const farmImageUrl =
  "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRxHchn6iLKaKn2ODG5qzc-H_rUSqJ5dS8NlFjxYZbzQg&s=10";
const logoImageUrl =
  "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRqSp8FcaUvSR1O3mdwDLfnjWHDS8JNlGbU2_E67ds&s=10";

export default function LoginPage() {
  return (
    <div className="login-page">
      <div aria-hidden="true" className="login-background">
        <Image
          alt=""
          className="login-background-image"
          fill
          priority
          sizes="100vw"
          src={farmImageUrl}
          unoptimized
        />
      </div>
      <div aria-hidden="true" className="login-backdrop" />

      <main className="login-main">
        <section className="login-panel" aria-labelledby="login-heading">
          <header className="login-header">
            <div className="login-logo-crop">
              <Image
                alt="Koranco Farms logo"
                className="login-logo"
                fill
                priority
                sizes="8.5rem"
                src={logoImageUrl}
                unoptimized
              />
            </div>
            <div className="login-identity">
              <h1 id="login-heading">Koranco Farms</h1>
              <p>Farm Management</p>
            </div>
          </header>
          <div className="login-form-heading">
            <h2>Sign in</h2>
          </div>
          <LoginForm />
        </section>
      </main>
    </div>
  );
}
