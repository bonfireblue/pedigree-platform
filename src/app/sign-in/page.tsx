"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

export default function SignInPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await signIn("credentials", {
      redirect: false,
      email,
      password
    });

    setLoading(false);

    if (result?.error) {
      setError("Invalid email or password.");
      return;
    }

    router.push("/app");
  }

  return (
    <main
      style={{
        maxWidth: 420,
        margin: "80px auto",
        padding: 16
      }}
    >
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
        Sign In
      </h1>

      <p style={{ opacity: 0.8, marginBottom: 24 }}>
        Sign in to access your family tree.
      </p>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              padding: 10,
              border: "1px solid #ddd",
              borderRadius: 10
            }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Password</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              padding: 10,
              border: "1px solid #ddd",
              borderRadius: 10
            }}
          />
        </label>

        <div style={{ textAlign: "right" }}>
          <a
            href="/forgot-password"
            style={{ fontSize: 14, color: "#666" }}
          >
            Forgot password?
          </a>
        </div>

        {error && (
          <div style={{ color: "crimson", fontSize: 14 }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: 12,
            borderRadius: 12,
            border: "1px solid #111",
            background: "#111",
            color: "white",
            fontWeight: 600,
            cursor: "pointer"
          }}
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>

      <div style={{ marginTop: 16, textAlign: "center" }}>
        <a href="/sign-up">
          Don&apos;t have an account? Sign up
        </a>
      </div>
    </main>
  );
}
