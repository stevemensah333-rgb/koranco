"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { fieldDescriptionIds, FormField } from "@/components/ui/form-field";
import { TextInput } from "@/components/ui/inputs";
import { ApiError } from "@/lib/api/client";
import { login } from "@/lib/api/auth";

type LoginState = "idle" | "submitting" | "invalid" | "unavailable";

export function LoginForm() {
  const router = useRouter();
  const [state, setState] = useState<LoginState>("idle");
  const [validationError, setValidationError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const loginIdentifier = String(form.get("login_identifier") ?? "").trim();
    const password = String(form.get("password") ?? "");
    if (!loginIdentifier || !password) {
      setValidationError("Enter your login identifier and password.");
      return;
    }
    setValidationError("");
    setState("submitting");
    try {
      await login(loginIdentifier, password);
      router.replace("/");
    } catch (error: unknown) {
      setState(
        error instanceof ApiError && [401, 429].includes(error.status)
          ? "invalid"
          : "unavailable",
      );
    }
  }

  const errorIds = fieldDescriptionIds("login-identifier", {
    error: Boolean(validationError),
  });

  return (
    <form className="login-form" onSubmit={handleSubmit} noValidate>
      {state === "invalid" ? (
        <Alert title="Sign-in failed" tone="error">
          The login identifier or password is not valid. Check your details and
          try again.
        </Alert>
      ) : null}
      {state === "unavailable" ? (
        <Alert title="Service unavailable" tone="error">
          The sign-in service could not be reached. Try again when the service
          is available.
        </Alert>
      ) : null}
      <FormField
        error={validationError || undefined}
        htmlFor="login-identifier"
        label="Login identifier"
      >
        <TextInput
          aria-describedby={errorIds || undefined}
          autoCapitalize="none"
          autoComplete="username"
          id="login-identifier"
          invalid={Boolean(validationError)}
          name="login_identifier"
          spellCheck={false}
        />
      </FormField>
      <FormField htmlFor="password" label="Password">
        <TextInput
          autoComplete="current-password"
          id="password"
          name="password"
          type="password"
        />
      </FormField>
      <Button disabled={state === "submitting"} fullWidth type="submit">
        {state === "submitting" ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
