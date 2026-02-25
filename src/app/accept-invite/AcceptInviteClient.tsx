"use client";

import { useMemo, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

type Stage = "start" | "register" | "done" | "error";

export default function AcceptInviteClient() {
  const { status: authStatus } = useSession();
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get("token") ?? "", [searchParams]);

  const [stage, setStage] = useState<Stage>("start");
  const [msg, setMsg] = useState<string>("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function accept() {
    setMsg("");

    if (!token) {
      setStage("error");
      setMsg("Missing token.");
      return;
    }

    // If logged in, use existing accept endpoint
    if (authStatus === "authenticated") {
      const res = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStage("error");
        setMsg(data?.error ?? `Failed with ${res.status}`);
        return;
      }

      setStage("done");
      setMsg("Invitation accepted. Redirecting…");
      setTimeout(() => (window.location.href = "/app"), 700);
      return;
    }

    // Not logged in: proceed to account creation
    setStage("register");
  }

  async function createAccount() {
    setMsg("");

    const res = await fetch("/api/invitations/accept-and-register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, email, password }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setStage("error");
      setMsg(data?.error ?? `Failed with ${res.status}`);
      return;
    }

    setStage("done");
    setMsg("Account created. Now sign in to continue.");

    // Send them to sign-in (you already have /sign-in)
    setTimeout(() => {
      window.location.href = "/sign-in";
    }, 700);
  }

  return (
    <>
      {stage === "start" ? (
        <>
          <p>You were invited to claim a profile on a family pedigree.</p>

          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button onClick={accept}>Accept</button>
            <button onClick={() => setStage("done")}>Decline</button>
          </div>

          {authStatus === "unauthenticated" ? (
            <p style={{ marginTop: 12, opacity: 0.8 }}>
              Already have an account?{" "}
              <button
                onClick={() =>
                  signIn(undefined, {
                    callbackUrl: `/accept-invite?token=${encodeURIComponent(token)}`,
                  })
                }
              >
                Sign in
              </button>
            </p>
          ) : null}
        </>
      ) : null}

      {stage === "register" ? (
        <>
          <h2 style={{ marginTop: 20 }}>Create your account</h2>
          <p>This invitation is tied to your email. Use the invited email.</p>

          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            <label>
              Email
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
              />
            </label>

            <label>
              Password (8+ chars)
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="********"
                style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
              />
            </label>

            <button onClick={createAccount}>Create account and claim profile</button>

            <button onClick={() => setStage("start")} style={{ opacity: 0.8 }}>
              Back
            </button>
          </div>
        </>
      ) : null}

      {stage === "done" ? <p style={{ marginTop: 12 }}>{msg || "Done."}</p> : null}

      {stage === "error" ? (
        <>
          <p style={{ marginTop: 12 }}>Error: {msg}</p>
          <p style={{ opacity: 0.7 }}>
            If you already created an account, use “Sign in” and then Accept.
          </p>
        </>
      ) : null}
    </>
  );
}