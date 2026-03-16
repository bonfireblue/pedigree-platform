"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError("Invalid or missing reset token.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to reset password");
      }

      router.push("/sign-in?reset=success");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <main style={{ maxWidth: 420, margin: "80px auto", padding: 16 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
          Invalid Link
        </h1>
        <p style={{ opacity: 0.8, marginBottom: 24 }}>
          This password reset link is invalid or has expired.
        </p>
        <a href="/forgot-password" style={{ color: "#111", textDecoration: "underline" }}>
          Request a new reset link
        </a>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 420, margin: "80px auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
        Reset Password
      </h1>

      <p style={{ opacity: 0.8, marginBottom: 24 }}>
        Enter your new password below.
      </p>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>New Password</span>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              padding: 10,
              border: "1px solid #ddd",
              borderRadius: 10,
            }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Confirm New Password</span>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
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
          {loading ? "Resetting..." : "Reset Password"}
        </button>
      </form>

      <div style={{ marginTop: 16, textAlign: "center" }}>
        <a href="/sign-in">Back to sign in</a>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div style={{ maxWidth: 420, margin: "80px auto", padding: 16 }}>Loading...</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
