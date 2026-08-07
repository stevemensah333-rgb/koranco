"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { PageHeader } from "@/components/ui/page-header";
import { TextInput } from "@/components/ui/inputs";
import { ApiError } from "@/lib/api/client";
import {
  changeRole,
  createUser,
  listUsers,
  resetUserPassword,
  revokeUserSessions,
  setUserStatus,
  type ApplicationUser,
  type Role,
} from "@/lib/api/administration";

export function UsersAdmin() {
  const [users, setUsers] = useState<ApplicationUser[] | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [resetTarget, setResetTarget] = useState<ApplicationUser | null>(null);
  const [reauthPassword, setReauthPassword] = useState("");
  const load = () =>
    listUsers()
      .then((r) => setUsers(r.items))
      .catch(() => setError("Users could not be loaded."));
  useEffect(() => {
    void load();
  }, []);

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const payload = {
      login_identifier: String(form.get("login_identifier") ?? "").trim(),
      display_name: String(form.get("display_name") ?? "").trim(),
      role: String(form.get("role")) as Role,
      initial_password: String(form.get("initial_password") ?? ""),
      current_password: String(form.get("current_password") ?? "") || undefined,
    };
    if (
      !payload.login_identifier ||
      payload.display_name.length < 2 ||
      payload.initial_password.length < 12
    ) {
      setError(
        "Enter a valid login, display name, and an initial password of at least 12 characters.",
      );
      return;
    }
    try {
      await createUser(payload);
      event.currentTarget.reset();
      setMessage(
        "Account created. Give the initial password to the user through an appropriate private channel; it will not be shown again.",
      );
      await load();
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Account could not be created.",
      );
    }
  }

  async function roleChange(user: ApplicationUser, role: Role) {
    if (
      !window.confirm(
        `Change ${user.display_name}'s role to ${role}? Existing sessions will be revoked.`,
      )
    )
      return;
    try {
      await changeRole(user.id, role, reauthPassword || undefined);
      setReauthPassword("");
      setMessage("Role changed and existing sessions revoked.");
      await load();
    } catch {
      setError(
        "The role could not be changed. Sensitive Manager changes may require a recent sign-in.",
      );
    }
  }
  async function statusChange(user: ApplicationUser) {
    const action = user.status === "active" ? "disable" : "reactivate";
    if (
      !window.confirm(
        `${action === "disable" ? "Disable" : "Reactivate"} ${user.display_name}?`,
      )
    )
      return;
    try {
      await setUserStatus(user.id, action, reauthPassword || undefined);
      setReauthPassword("");
      setMessage(
        `Account ${action === "disable" ? "disabled; sessions revoked" : "reactivated"}.`,
      );
      await load();
    } catch {
      setError("The account status could not be changed.");
    }
  }
  async function submitReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resetTarget) return;
    const password = String(
      new FormData(event.currentTarget).get("replacement_password") ?? "",
    );
    const currentPassword = String(
      new FormData(event.currentTarget).get("current_password") ?? "",
    );
    if (password.length < 12) {
      setError("The replacement password must be at least 12 characters.");
      return;
    }
    try {
      await resetUserPassword(
        resetTarget.id,
        password,
        currentPassword || undefined,
      );
      setResetTarget(null);
      setMessage(
        "Password reset. Existing sessions were revoked and a password change is required at next sign-in.",
      );
      await load();
    } catch {
      setError("The password could not be reset.");
    }
  }

  return (
    <>
      <PageHeader
        title="Application users"
        description="Manage application access. Worker accounts are optional and are not farm-worker records."
      />
      {message ? (
        <Alert title="Completed" tone="success">
          {message}
        </Alert>
      ) : null}
      {error ? (
        <Alert title="Action not completed" tone="error">
          {error}
        </Alert>
      ) : null}
      <section
        className="content-section"
        aria-labelledby="create-user-heading"
      >
        <h2 className="section-heading" id="create-user-heading">
          Create account
        </h2>
        <form className="admin-form-grid" onSubmit={submitCreate} noValidate>
          <label>
            Display name
            <TextInput name="display_name" />
          </label>
          <label>
            Login identifier
            <TextInput name="login_identifier" autoCapitalize="none" />
          </label>
          <label>
            Role
            <select
              className="text-input"
              name="role"
              defaultValue="supervisor"
            >
              <option value="manager">Manager</option>
              <option value="supervisor">Supervisor</option>
              <option value="worker">Worker</option>
            </select>
          </label>
          <label>
            Initial password
            <TextInput
              name="initial_password"
              type="password"
              autoComplete="new-password"
            />
          </label>
          <label>
            Current password{" "}
            <span className="muted-text">
              (only when recent authentication is requested)
            </span>
            <TextInput
              name="current_password"
              type="password"
              autoComplete="current-password"
            />
          </label>
          <div className="admin-form-action">
            <Button type="submit">Create account</Button>
          </div>
        </form>
      </section>
      {resetTarget ? (
        <section className="content-section" aria-labelledby="reset-heading">
          <h2 id="reset-heading" className="section-heading">
            Reset password for {resetTarget.display_name}
          </h2>
          <form className="inline-action-form" onSubmit={submitReset}>
            <label>
              Secure replacement password
              <TextInput
                name="replacement_password"
                type="password"
                autoComplete="new-password"
                autoFocus
              />
            </label>
            {resetTarget.role === "manager" ? (
              <label>
                Your current password
                <TextInput
                  name="current_password"
                  type="password"
                  autoComplete="current-password"
                />
              </label>
            ) : null}
            <Button type="submit">Reset and revoke sessions</Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setResetTarget(null)}
            >
              Cancel
            </Button>
          </form>
        </section>
      ) : null}
      <section className="content-section" aria-labelledby="user-list-heading">
        <h2 className="section-heading" id="user-list-heading">
          Accounts
        </h2>
        <label className="reauth-field">
          Your password for sensitive Manager actions
          <TextInput
            type="password"
            autoComplete="current-password"
            value={reauthPassword}
            onChange={(event) => setReauthPassword(event.target.value)}
          />
        </label>
        {!users ? (
          <LoadingIndicator label="Loading users…" />
        ) : users.length === 0 ? (
          <p>No application users exist.</p>
        ) : (
          <div className="table-scroll" tabIndex={0}>
            <table className="data-table">
              <caption className="sr-only">Application user accounts</caption>
              <thead>
                <tr>
                  <th>Name and login</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.display_name}</strong>
                      <br />
                      <span className="muted-text">
                        {user.login_identifier}
                      </span>
                    </td>
                    <td>
                      <select
                        aria-label={`Role for ${user.display_name}`}
                        value={user.role}
                        onChange={(e) =>
                          void roleChange(user, e.target.value as Role)
                        }
                      >
                        <option value="manager">Manager</option>
                        <option value="supervisor">Supervisor</option>
                        <option value="worker">Worker</option>
                      </select>
                    </td>
                    <td>
                      {user.status}
                      {user.password_change_required
                        ? " · password change required"
                        : ""}
                    </td>
                    <td>
                      <div className="table-actions">
                        <Button
                          variant={
                            user.status === "active" ? "danger" : "secondary"
                          }
                          onClick={() => void statusChange(user)}
                        >
                          {user.status === "active" ? "Disable" : "Reactivate"}
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => setResetTarget(user)}
                        >
                          Reset password
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() =>
                            void revokeUserSessions(user.id).then(() =>
                              setMessage("Sessions revoked."),
                            )
                          }
                        >
                          Revoke sessions
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
