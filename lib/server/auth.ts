// Google sign-in through Auth.js with JWT sessions (decision D3). No auth tables: the session only carries
// the person's id, and every request rebuilds their roles from the database (lib/server/session.ts).
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { decideSignIn, devLoginAllowed } from "@/services/identity";
import { getServices } from "./container";

/** Development only: sign in as any active person without Google. Never in production. */
export const devLoginEnabled = devLoginAllowed(process.env);
export const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/sign-in", error: "/sign-in" },
  providers: [
    ...(googleEnabled ? [Google({ authorization: { params: { prompt: "select_account" } } })] : []),
    // Client portal (Stage 11.6, D-11.6a): a one-time link, pressed on its page (never on the email's GET).
    Credentials({
      id: "portal-link",
      name: "Client link",
      credentials: { token: {} },
      async authorize(credentials) {
        const id = await getServices().portal.redeem(typeof credentials?.token === "string" ? credentials.token : "");
        return id ? { id } : null;
      },
    }),
    ...(devLoginEnabled
      ? [
          Credentials({
            id: "dev",
            name: "Development",
            credentials: { email: {} },
            async authorize(credentials) {
              const email = typeof credentials?.email === "string" ? credentials.email : "";
              const person = await getServices().identity.personForSignIn(email);
              return person ? { id: person.id, email: person.workEmail, name: person.fullName } : null;
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    async signIn({ account, profile, user }) {
      if (account?.provider === "portal-link") return true; // authorize() already checked and used the link
      const email = account?.provider === "google" ? profile?.email : user?.email;
      const person = email ? await getServices().identity.findByEmail(email) : null;
      // Not staff: a client contact may sign in to the portal with the Google account of their invited email.
      if (!person && account?.provider === "google" && email && profile?.email_verified === true && (await getServices().portal.google(email))) return true;
      const decision = decideSignIn({
        provider: account?.provider,
        emailVerified: profile?.email_verified === true,
        devLoginEnabled,
        person,
      });
      return decision.allow ? true : `/sign-in?error=${decision.reason}`;
    },
    async jwt({ token, account, profile, user }) {
      // Only on the sign-in request: remember which person this is.
      if (account?.provider === "google" && profile?.email) {
        token.personId = (await getServices().identity.personForSignIn(profile.email))?.id;
        if (!token.personId) token.portalUserId = (await getServices().portal.idForEmail(profile.email)) ?? undefined;
      } else if (account?.provider === "portal-link") {
        token.portalUserId = user?.id;
      } else if (account?.provider === "dev") {
        token.personId = user?.id;
      }
      return token;
    },
    session({ session, token }) {
      session.personId = typeof token.personId === "string" ? token.personId : undefined;
      session.portalUserId = typeof token.portalUserId === "string" ? token.portalUserId : undefined;
      return session;
    },
  },
});

declare module "next-auth" {
  interface Session {
    personId?: string;
    /** A client contact signed in to the portal (Stage 11.6): never also a person. */
    portalUserId?: string;
  }
}
