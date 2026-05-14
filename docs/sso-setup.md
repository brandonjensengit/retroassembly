# SSO Setup (Authentik)

This fork of RetroAssembly requires an Authentik instance for authentication.
There is no local-password fallback.

> Deploying with Docker? See [docs/docker.md](docker.md) for build/run instructions, a `docker-compose.yml` template, reverse-proxy examples, and the cookie-security note for HTTPS.

## What you need

- An Authentik instance you can administer
- Admin access to create an OAuth2/OpenID Provider, an Application, and a Group

## Authentik configuration

1. **Create an OAuth2/OpenID Provider** in Authentik:
   - Authorization flow: your default (e.g. `default-provider-authorization-implicit-consent`)
   - Client type: `Confidential`
   - Redirect URIs: `https://<your-retroassembly-host>/auth/callback`
   - Signing Key: your default signing key
   - Scopes: include `openid`, `email`, `profile`, and a scope that emits the `groups` claim
     (Authentik ships a `groups` property mapping; ensure it is added to the provider)
2. **Create an Application** bound to that provider. Note the slug (default: `retroassembly`).
3. **Create a group** for users allowed to upload ROMs (e.g. `retroassembly-uploaders`).
   Add the appropriate Authentik users to this group. Members can upload and delete
   their own uploads. Everyone else can log in and play.

## RetroAssembly configuration

Copy `.env.example` to `.env` and fill in:

| Variable                                              | Value                                                        |
| ----------------------------------------------------- | ------------------------------------------------------------ |
| `RETROASSEMBLY_RUN_TIME_AUTHENTIK_ISSUER`             | `https://<authentik-host>/application/o/<application-slug>/` |
| `RETROASSEMBLY_RUN_TIME_AUTHENTIK_CLIENT_ID`          | Client ID from the Authentik provider                        |
| `RETROASSEMBLY_RUN_TIME_AUTHENTIK_CLIENT_SECRET`      | Client Secret from the Authentik provider                    |
| `RETROASSEMBLY_RUN_TIME_AUTHENTIK_REDIRECT_URI`       | `https://<your-retroassembly-host>/auth/callback`            |
| `RETROASSEMBLY_RUN_TIME_AUTHENTIK_UPLOADER_GROUP`     | The Authentik group name (e.g. `retroassembly-uploaders`)    |
| `RETROASSEMBLY_RUN_TIME_AUTHENTIK_LOGIN_BUTTON_LABEL` | (Optional) Custom button label, e.g. `Log in with Nextuon`   |
| `RETROASSEMBLY_RUN_TIME_SESSION_SECRET`               | 32+ random chars; used to sign session cookies               |

The app refuses to start if any of the required variables is empty.

## Group membership refresh

Group membership is read from the ID token at login and stored on the user record.
If you add or remove someone from the uploader group in Authentik, they will see the
change at their next login (or after their session expires, whichever comes first).

## Logout

Logging out of RetroAssembly also logs the user out of Authentik via the
end-session endpoint. To log back in, they go through Authentik again.
