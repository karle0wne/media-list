import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { missingOidcConfiguration } from "@/lib/oidc";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await currentUser()) redirect("/");
  const { error } = await searchParams;
  const missing = missingOidcConfiguration();

  return (
    <section className="narrow authPage">
      <h1>Sign in</h1>
      <p className="muted">Access is managed by the central identity service.</p>
      {error && <p className="error">{error}</p>}
      {missing.length > 0 ? (
        <p className="error">Google sign-in is temporarily unavailable.</p>
      ) : (
        <div className="stack card authPrimary">
          <div>
            <strong>Google</strong>
            <p className="muted authHelp">Use a Google account that has access to Media List.</p>
          </div>
          <a className="button" href="/login/oidc">Continue with Google</a>
        </div>
      )}
    </section>
  );
}
