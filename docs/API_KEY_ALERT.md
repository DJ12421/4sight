# Google API key alert: remediation status

The flagged value came from the Firebase web configuration. The application uses a separate server-side `GEMINI_API_KEY` for Gemini calls. This does not prove that the flagged key is restricted correctly in Google Cloud.

## Repository changes

- The key is removed from tracked `firebase-applet-config.json`.
- Local configuration uses ignored `.env`; Cloud Run receives `FIREBASE_WEB_API_KEY` at runtime through its own binding.
- `/firebase-config.js` intentionally supplies this public browser configuration. It refuses to return a value equal to `GEMINI_API_KEY`.
- These changes do **not** revoke the key, remove it from existing Git history, or resolve alerts on the old Foresight repository.

## Required provider-side decision

Open the [project's Google Cloud credentials](https://console.cloud.google.com/apis/credentials?project=gen-lang-client-0501741319) and locate the key identified by the GitHub alert. Do not paste its value into issues, chat, logs or screenshots.

1. Inspect its API restrictions and recent usage. Firebase's [official guidance](https://firebase.google.com/docs/projects/api-keys) says Firebase-only API keys are public by design; the key must not allow non-Firebase APIs, particularly Generative Language API.
2. If it is unrestricted, allows other billable APIs, or has uncertain usage, create a correctly restricted replacement, update every application using it, verify sign-in, then revoke the old key. Existing builds may also require updating.
3. If it is confirmed to be an intentionally public, Firebase-only restricted key, document that verification and resolve the alert using the appropriate non-secret/false-positive disposition. Do not label a still-valid key as revoked.
4. If revoked, resolve the matching alerts in both `DJ12421/4sight` and `DJ12421/Foresight` as revoked only after Google confirms the revocation.

Google Cloud restrictions, usage review, replacement and revocation have **not** been performed. No alert has been dismissed. Changing a live key can break sign-in and requires approval and configuration access.

Git history cleanup, if desired, is a separate approved operation affecting commit IDs and collaborators. It is not a substitute for provider-side remediation, and old clones or cached commits can still retain the value. See [GitHub's alert guidance](https://docs.github.com/en/code-security/how-tos/manage-security-alerts/manage-secret-scanning-alerts/resolving-alerts).
