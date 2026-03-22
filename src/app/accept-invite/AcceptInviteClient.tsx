"use client";

import { useMemo, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useLanguage, LanguageToggle } from "@/contexts/LanguageContext";

type Stage = "start" | "register" | "done" | "error";

export default function AcceptInviteClient() {
  const { status: authStatus } = useSession();
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get("token") ?? "", [searchParams]);
  const { t, lang } = useLanguage();

  const [stage, setStage] = useState<Stage>("start");
  const [msg, setMsg] = useState<string>("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function accept() {
    setMsg("");

    if (!token) {
      setStage("error");
      setMsg(lang === "vi" ? "Thiếu mã token." : "Missing token.");
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
        setMsg(data?.error ?? (lang === "vi" ? `Thất bại với mã ${res.status}` : `Failed with ${res.status}`));
        return;
      }

      setStage("done");
      setMsg(lang === "vi" ? "Đã chấp nhận lời mời. Đang chuyển hướng…" : "Invitation accepted. Redirecting…");
      setTimeout(() => (window.location.href = "/pedigree"), 700);
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
      setMsg(data?.error ?? (lang === "vi" ? `Thất bại với mã ${res.status}` : `Failed with ${res.status}`));
      return;
    }

    setStage("done");
    setMsg(lang === "vi" ? "Đã tạo tài khoản. Đăng nhập để tiếp tục." : "Account created. Now sign in to continue.");

    // Send them to sign-in
    setTimeout(() => {
      window.location.href = "/sign-in";
    }, 700);
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <LanguageToggle />
      </div>

      {stage === "start" ? (
        <>
          <p>{t.youAreInvited}</p>

          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button onClick={accept}>{t.acceptInvite}</button>
            <button onClick={() => setStage("done")}>
              {lang === "vi" ? "Từ chối" : "Decline"}
            </button>
          </div>

          {authStatus === "unauthenticated" ? (
            <p style={{ marginTop: 12, opacity: 0.8 }}>
              {t.alreadyHaveAccount}{" "}
              <button
                onClick={() =>
                  signIn(undefined, {
                    callbackUrl: `/accept-invite?token=${encodeURIComponent(token)}`,
                  })
                }
              >
                {t.signIn}
              </button>
            </p>
          ) : null}
        </>
      ) : null}

      {stage === "register" ? (
        <>
          <h2 style={{ marginTop: 20 }}>{t.createAccount}</h2>
          <p>
            {lang === "vi" 
              ? "Lời mời này gắn liền với email của bạn. Sử dụng email được mời."
              : "This invitation is tied to your email. Use the invited email."}
          </p>

          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            <label>
              {t.email}
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
              />
            </label>

            <label>
              {t.password} (8+ {lang === "vi" ? "ký tự" : "chars"})
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="********"
                style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
              />
            </label>

            <button onClick={createAccount}>
              {lang === "vi" ? "Tạo tài khoản và nhận hồ sơ" : "Create account and claim profile"}
            </button>

            <button onClick={() => setStage("start")} style={{ opacity: 0.8 }}>
              {t.back}
            </button>
          </div>
        </>
      ) : null}

      {stage === "done" ? <p style={{ marginTop: 12 }}>{msg || (lang === "vi" ? "Hoàn tất." : "Done.")}</p> : null}

      {stage === "error" ? (
        <>
          <p style={{ marginTop: 12 }}>{t.error}: {msg}</p>
          <p style={{ opacity: 0.7 }}>
            {lang === "vi" 
              ? "Nếu bạn đã tạo tài khoản, hãy \"Đăng nhập\" rồi Chấp nhận."
              : "If you already created an account, use \"Sign in\" and then Accept."}
          </p>
        </>
      ) : null}
    </>
  );
}
