# loupoli — iOS CI builds

The manual **Build loupoli iPad** workflow keeps Rust, Xcode, DerivedData, and the IPA archive on a GitHub-hosted macOS runner. It is intentionally `workflow_dispatch` only; normal pushes and pull requests never consume macOS minutes or signing material.

## Trigger

Open **Actions → Build loupoli iPad → Run workflow** and choose:

- `debugging` — installable development IPA
- `release-testing` — TestFlight/export-ready build
- `app-store-connect` — App Store Connect export

The workflow runs the web checks and tests, imports the Apple signing identity, builds `aarch64-apple-ios`, and uploads the IPA for 14 days.

## Repository secrets

Create these under **Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `APPLE_CERTIFICATE` | Base64 `.p12` signing certificate |
| `APPLE_CERTIFICATE_PASSWORD` | Password for the `.p12` |
| `APPLE_PROVISIONING_PROFILE` | Base64 `.mobileprovision` matching the bundle ID |
| `APPLE_TEAM_ID` | Apple Developer team identifier |
| `APPLE_SIGNING_IDENTITY` | Optional identity name, for example `Apple Development: Name (TEAM)` |
| `KEYCHAIN_PASSWORD` | Any temporary password for the CI keychain |

Encode files on macOS with:

```bash
base64 -i certificate.p12 | pbcopy
base64 -i profile.mobileprovision | pbcopy
```

A development profile must include the target iPad's UDID. Distribution/TestFlight builds use a distribution certificate and App Store provisioning profile instead.

## Install the artifact

Download the IPA from the workflow run, then install it on a paired iPad:

```bash
xcrun devicectl device install app \
  --device "iPad de Sergio" \
  loupoli.ipa
```

## Boundaries

- No signing certificate or profile is committed to the repository.
- Use GitHub environment protection and repository secrets; do not print secret values in workflow logs.
- The workflow does not upload to App Store Connect automatically. Use the exported artifact or add an App Store Connect upload step with its own API-key secrets.
- Local native builds remain available, but they are not required for normal web/PWA development.
