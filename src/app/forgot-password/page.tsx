"use client";

import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to send reset email");
      }

      setSuccess(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <main style={{ maxWidth: 420, margin: "0 auto", padding: "40px 20px", minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
          Check your email
        </h1>
        <p style={{ opacity: 0.8, marginBottom: 24 }}>
          If an account with that email exists, we&apos;ve sent a password reset link.
          Please check your inbox and spam folder.
        </p>
        <a href="/sign-in" style={{ color: "#111", textDecoration: "underline" }}>
          Back to sign in
        </a>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 420, margin: "0 auto", padding: "40px 20px", minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
        Forgot Password
      </h1>

      <p style={{ opacity: 0.8, marginBottom: 24 }}>
        Enter your email address and we&apos;ll send you a link to reset your password.
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
              borderRadius: 10,
            }}
          />
        </label>

        {error && (
          <div style={{ color: "crimson", fontSize: 14 }}>{error}</div>
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
            cursor: "pointer",
          }}
        >
          {loading ? "Sending..." : "Send Reset Link"}
        </button>
      </form>

      <div style={{ marginTop: 16, textAlign: "center" }}>
        <a href="/sign-in">Back to sign in</a>
      </div>
    </main>
  );
}
