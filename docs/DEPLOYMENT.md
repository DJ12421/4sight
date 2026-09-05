# Cloud Run deployment handoff

**Prepared, not executed.** Obtain approval for service connections, IAM changes, rule deployment and public deployment before running these steps. The local implementation does not authorize publishing by itself.

## Configuration to review

| Setting | Prepared value |
| --- | --- |
| Service | `foresight` |
| Region | `us-central1` default; confirm against the existing database location and project policy |
| Project/database | Existing exported values in `firebase-applet-config.json` |
| Runtime | Node.js 22, non-root container, Cloud Run `PORT` |
| Instances | 0 minimum, 3 maximum |
| Concurrency | 20 requests per instance |
| Request timeout | 60 seconds |
| AI allowance | 5 requests/minute and 50/day per UID across instances |
| Secret | `GEMINI_API_KEY`, a reviewed numeric Secret Manager version |
| Model | `gemini-3.6-flash`; verify access in the approved project |
| Campaign label | `dev-tutorial=cloud-run-ai-challenge` |

## Prerequisites after approval

1. Confirm project billing, budget alerts, database location and the named database. Enable Cloud Run, Cloud Build, Artifact Registry, Secret Manager, Firestore and Identity Toolkit APIs as required. These affect infrastructure and cost.
2. Use a dedicated runtime service account. Grant database read/write (`roles/datastore.user`) in the approved project, Firebase Auth read access (`roles/firebaseauth.viewer`) for revoked-token verification, and Secret Manager accessor **on the individual Gemini secret**. Do not grant Editor or Owner to the runtime. Administrative database privileges are why the application must enforce UID ownership independently.
3. Give the deployment identity only the deployment/build/service-account-use permissions required by your organization's Cloud Run source deployment process. Source builds may require `roles/run.builder` on the approved build identity. Confirm these permissions against the actual organization policy rather than granting broad roles to make an error disappear.
4. Create the Gemini secret or select its existing version through the approved Secret Manager process. Do not paste its value into a shell command, source file, screenshot or demo. Pin the numeric version in the deployment; Google's [Cloud Run secret guidance](https://cloud.google.com/run/docs/configuring/services/secrets) recommends pinning environment-injected secrets.
5. Confirm that the Firebase web configuration, server environment and `firebase.json` all select the same project and **named Firestore database**. If moving projects, replace all three together before building. Never deploy default-database rules while expecting them to protect the named database.
6. Configure Google as an enabled Firebase sign-in provider. Authorize `localhost` for local work, and authorize the generated Cloud Run hostname for the deployed app.

## Validate before deployment

With explicit authorization, run the checks in the README and `docs/VALIDATION.md`. Inspect the dependency lock and generated browser assets for accidental private credentials. A Firebase web API key in public configuration is expected; a Gemini API key is not.

The Dockerfile installs pinned dependencies, builds the frontend/server, and serves only `dist` as an unprivileged user. `.gcloudignore` and `.dockerignore` exclude environment files, caches, private evidence and common credential filenames. Do not place other credentials in the source folder.

## Deploy after approval

Deploy the security rules using the explicit project:

```powershell
firebase deploy --only firestore:rules --project YOUR_APPROVED_PROJECT --config firebase.json
```

The rules preserve owner reads on the old interactions collection but retire client writes. Old deployed journal clients will no longer be able to write after these rules are applied; coordinate replacement of that client during rollout. No document migration is needed.

Publish the source with the prepared script, substituting approved values:

```powershell
.\scripts\deploy.ps1 -ProjectId YOUR_APPROVED_PROJECT -RuntimeServiceAccount foresight-runtime@YOUR_APPROVED_PROJECT.iam.gserviceaccount.com -SecretVersion 1
```

The script creates/updates a publicly reachable Cloud Run service, attaches the approved identity, binds the secret and applies the mandatory campaign label. It does not create secrets, grant roles, publish the repository, or post a submission. Public reachability is required for the web frontend; application API operations still require verified Firebase tokens.

## Verify the actual service

- Capture the URL, revision, campaign label and runtime identity from the script's service description output.
- Add the exact service hostname to Firebase authorized domains and verify Google sign-in.
- Complete a save/reload/review loop on the named database with two separate accounts.
- Verify both cross-user denial paths, backend token rejection and sample-copy behavior.
- Check safe errors for an unavailable model and a quota limit. The public health endpoint is liveness only.
- Observe Cloud Run errors/latency, instance count, Gemini quota and billing. Logs should contain no prompts, responses, tokens or keys.
- Record all real results in `docs/VALIDATION.md` before linking the app in the submission.

## Rollback

Keep the previous Cloud Run revision reference before changing traffic. A traffic rollback requires approval and should target a compatible Foresight revision. Rolling back to the starter journal also requires reviewing rule compatibility because client writes to the legacy collection are now denied. Do not broadly reopen rules as a shortcut. New decision data does not require deletion for rollback.
