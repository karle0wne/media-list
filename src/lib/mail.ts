export type MailFetch = typeof fetch;

export function magicLinkMailConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.MAGIC_LINK_FROM?.trim() && process.env.APP_BASE_URL?.trim());
}

export async function sendMagicLinkEmail(email: string, loginUrl: string, fetchImpl: MailFetch = fetch) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.MAGIC_LINK_FROM?.trim();
  if (!apiKey || !from) throw new Error("Magic-link email delivery is not configured");

  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Sign in to media-list",
      text: `Open this link to sign in to media-list:\n\n${loginUrl}\n\nThe link expires shortly and can be used once.`,
      html: `<p>Open this link to sign in to media-list:</p><p><a href="${escapeHtml(loginUrl)}">Sign in to media-list</a></p><p>The link expires shortly and can be used once.</p>`,
    }),
  });

  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, " ").trim().slice(0, 300);
    throw new Error(`Magic-link email delivery failed (${response.status})${detail ? `: ${detail}` : ""}`);
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}
