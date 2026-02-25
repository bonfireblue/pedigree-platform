"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

type Status =
  | "idle"
  | "need_login"
  | "ready"
  | "accepting"
  | "accepted"
  | "declined"
  | "error";

export default function AcceptInviteClient() {
  const { status: authStatus } = useSession();
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get("token") ?? "", [searchParams]);

  const [state, setState] = useState<Status>("idle");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage("Missing token in URL.");
      return;
    }

    if (authStatus === "loading") return;

    if (authStatus === "unauthenticated") {
      setState("need_login");
      return;
    }

    setState("ready");
  }, [authStatus, token]);

  async function accept() {
    setState("accepting");
    setMessage("");

    const res = await fetch("/api/invitations/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setState("error");
      setMessage(data?.error ?? `Failed with ${res.status}`);
      return;
    }

    setState("accepted");
    setMessage("Invitation accepted. Your profile has been claimed.");

    setTimeout(() => {
      window.location.href = "/app";
    }, 700);
  }

  function decline() {
    // v1: no decline endpoint yet; we can add it next
    setState("declined");
    setMessage("Invitation declined.");
  }

  return (
    <>
      {state === "need_login" ? (
        <>
          <p>You must sign in to accept this invitation.</p>
          <button
            onClick={() =>
              signIn(undefined, {
                callbackUrl: `/accept-invite?token=${encodeURIComponent(token)}`,
              })
            }
          >
            Sign in
          </button>
        </>
      ) : null}

      {state === "ready" ? (
        <>
          <p>You were invited to claim a profile on a family pedigree.</p>
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button onClick={accept}>Accept</button>
            <button onClick={decline}>Decline</button>
          </div>
        </>
      ) : null}

      {state === "accepting" ? <p>Accepting…</p> : null}
      {state === "accepted" ? <p>{message}</p> : null}
      {state === "declined" ? <p>{message}</p> : null}

      {state === "error" ? (
        <>
          <p style={{ marginTop: 12 }}>Error: {message}</p>
          <p style={{ opacity: 0.7, marginTop: 8 }}>
            If you think this is incorrect, ask the inviter to resend a new invite link.
          </p>
        </>
      ) : null}
    </>
  );
}