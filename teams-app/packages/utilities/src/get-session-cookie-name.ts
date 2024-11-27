export function getSessionCookieName() {
  return process.env.CAS_SECURE_COOKIE === "false"
    ? "next-auth.session-token"
    : "__Secure-next-auth.session-token";
}
