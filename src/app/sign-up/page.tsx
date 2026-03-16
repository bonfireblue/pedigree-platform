"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

export default function SignUpPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

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
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Sign up failed");
      }

      // Auto sign-in after successful registration
      const result = await signIn("credentials", {
        redirect: false,
        email,
        password,
      });

      if (result?.error) {
        // Account created, but sign-in failed. Send them to sign-in page.
        router.push("/sign-in");
        return;
      }

      router.push("/app");
    } catch (err: any) {
      setError(err?.message ?? "Sign up failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ 
      maxWidth: 420, 
      margin: "0 auto", 
      padding: "40px 20px",
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
    }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Create account</h1>
      <p style={{ opacity: 0.8, marginBottom: 20 }}>
        Create an account to start building your family tree.
      </p>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Optional"
            autoComplete="name"
            style={{ padding: 10, border: "1px solid #ddd", borderRadius: 10 }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Email</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            type="email"
            autoComplete="email"
            style={{ padding: 10, border: "1px solid #ddd", borderRadius: 10 }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Password</span>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            type="password"
            autoComplete="new-password"
            style={{ padding: 10, border: "1px solid #ddd", borderRadius: 10 }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Confirm Password</span>
          <input
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            type="password"
            autoComplete="new-password"
            style={{ padding: 10, border: "1px solid #ddd", borderRadius: 10 }}
          />
        </label>

        {error ? (
          <div style={{ color: "crimson", fontSize: 14 }}>{error}</div>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: 12,
            borderRadius: 12,
            border: "1px solid #111",
            background: "#111",
            color: "white",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          {loading ? "Creating..." : "Create account"}
        </button>

        <a href="/sign-in" style={{ textAlign: "center", marginTop: 6 }}>
          Already have an account? Sign in
        </a>
      </form>
    </main>
  );
}
