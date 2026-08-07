# Emergency Manager recovery

Use this procedure only when no active Manager can authenticate. It requires direct access to the API runtime and production database credentials; it is not an HTTP endpoint or application backdoor.

1. Confirm the incident and the Manager identity through Koranco's operational authority.
2. Record the operator, authorization, time, and reason in the incident record.
3. From the API runtime, run:

   ```sh
   uv run python -m koranco.identity.recovery \
     --login <manager-login> \
     --confirm-emergency-recovery
   ```

4. Enter a strong temporary password twice at the hidden prompts and transfer it privately.
5. The command reactivates that Manager, replaces the credential hash, requires a password change, revokes every existing session, and records `operator_manager_recovery`.
6. Confirm the Manager changes the password, review security events, and close the incident.

The command cannot recover a non-Manager or reveal an existing password. Database backups should be confirmed before manual remediation beyond this command.
