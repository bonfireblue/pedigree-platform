import type { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { findUserByEmail, sql } from "@/lib/neon-db";
import argon2 from "argon2";

export const authOptions: AuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password ?? "";
        if (!email || !password) return null;

        const user = await findUserByEmail(email);
        if (!user) return null;

        // OAuth users won't have a password hash
        if (!user.passwordHash) return null;

        const ok = await argon2.verify(user.passwordHash, password);
        if (!ok) return null;

        return { id: user.id, email: user.email };
      }
    })
  ],

  callbacks: {
    async signIn({ user, account }) {
      // Handle OAuth sign-in (Google)
      if (account?.provider === "google" && user.email) {
        const email = user.email.toLowerCase();
        const existingUser = await findUserByEmail(email);
        
        if (!existingUser) {
          // Create user for OAuth
          const userId = crypto.randomUUID();
          await sql`
            INSERT INTO "User" (id, email, "emailVerified", "createdAt", "updatedAt")
            VALUES (${userId}, ${email}, NOW(), NOW(), NOW())
          `;
        }
        return true;
      }
      return true;
    },
    async jwt({ token, user, account }) {
      if (user) {
        // Get the user ID from DB for OAuth users
        if (account?.provider === "google" && user.email) {
          const dbUser = await findUserByEmail(user.email.toLowerCase());
          if (dbUser) {
            token.sub = dbUser.id;
          }
        } else {
          token.sub = user.id;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        (session.user as { id?: string }).id = token.sub;
      }
      return session;
    },
  },

  session: { strategy: "jwt" as const },

  pages: { signIn: "/sign-in" },

  secret: process.env.NEXTAUTH_SECRET,

  cookies: {
    sessionToken: {
      name: `next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: "none" as const,
        path: "/",
        secure: true,
      },
    },
    callbackUrl: {
      name: `next-auth.callback-url`,
      options: {
        sameSite: "none" as const,
        path: "/",
        secure: true,
      },
    },
    csrfToken: {
      name: `next-auth.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: "none" as const,
        path: "/",
        secure: true,
      },
    },
  },
};
