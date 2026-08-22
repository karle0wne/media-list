# Central IAM / SSO migration

Status: migration contract, not yet the production authentication source of truth.

`media-list` is moving authentication, service access policy, and service-scoped role assignment out of the application and into the shared `central-auth` IAM service. The intended upstream identity is Google; `central-auth` exposes OIDC to this and future services, including services deployed on other VPS hosts.

## Ownership boundary

Central IAM owns:

- upstream Google identity;
- whether a user may access `media-list`;
- service-scoped roles, currently `media-list-admin` and `media-list-user`;
- stable OIDC subject and verified email identity.

`media-list` owns:

- local business data and per-user media state;
- the local mapping from stable external subject to the existing business user row;
- what the business roles `ADMIN` and `USER` are allowed to do inside the application;
- ordinary local application sessions after OIDC authentication.

`media-list` must not become a second IAM policy database. Email is not an application allowlist in the target model.

## Migration flow

While migration is in progress, central OIDC is additive and disabled unless all required OIDC values are configured. Existing password/magic-link/recovery paths remain as a rollback path until a real Google → central-auth → media-list login has been production-proven.

A successful central login uses Authorization Code + PKCE, requires a verified email and a service-scoped IAM role, and maps the stable identity as follows:

```text
issuer + sub already linked
→ existing local business user

otherwise verified email matches legacy user
→ link that existing user

otherwise IAM role is ADMIN and exactly one active unlinked legacy ADMIN exists
→ migrate that admin row and bind its verified email

otherwise allowed IAM identity
→ create local business user
```

The IAM role is authoritative on each successful central login: `media-list-admin` maps to local `ADMIN`, `media-list-user` maps to local `USER`. Roles for unrelated applications grant no access.

## Cutover gate

Legacy authentication must not be removed merely because the OIDC code is merged. Removal requires independent production evidence for the exact deployed revisions:

```text
Google account
→ central-auth Google provider
→ media-list OIDC application
→ service access/role check
→ callback with valid state + PKCE
→ external subject linked to expected local user
→ local session established
→ ADMIN/USER authorization behaves correctly
```

Only after that proof should a separate bounded change remove Brevo, magic-login credentials, registration invites, password login/recovery, and application-owned allowlist/security management.
