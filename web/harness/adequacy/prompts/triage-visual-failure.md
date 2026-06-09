# Triage A Visual/Login Failure

Use the sanitized evidence bundle only.

Inputs:
- failing invariant IDs
- screenshot path
- sanitized console errors
- sanitized failed requests
- selected sanitized DOM text
- mutation ID, if present

Triage:
1. Identify whether the failure is product behavior, test brittleness, missing config, or mutation setup failure.
2. Do not request secrets, cookies, kubeconfig, or tokens.
3. Prefer invariant-preserving fixes over screenshot threshold changes.
4. If a generated test is proposed, require it to kill the relevant mutation.
