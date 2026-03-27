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
  const [loading, setLoading] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);

  async function accept() {
    setMsg("");
    setLoading(true);

    if (!token) {
      setStage("error");
      setMsg(lang === "vi" ? "Thiếu mã token." : "Missing token.");
      setLoading(false);
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
        setLoading(false);
        return;
      }

      setStage("done");
      setMsg(lang === "vi" ? "Đã chấp nhận lời mời. Đang chuyển hướng..." : "Invitation accepted. Redirecting...");
      setTimeout(() => (window.location.href = "/pedigree"), 700);
      return;
    }

    // Not logged in: proceed to account creation
    setStage("register");
    setLoading(false);
  }

  async function createAccount() {
    setMsg("");
    setPasswordError(null);

    // Validate password match
    if (password !== confirmPassword) {
      setPasswordError(lang === "vi" ? "Mật khẩu không khớp" : "Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setPasswordError(lang === "vi" ? "Mật khẩu phải có ít nhất 8 ký tự" : "Password must be at least 8 characters");
      return;
    }

    setLoading(true);

    const res = await fetch("/api/invitations/accept-and-register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, email, password }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setStage("error");
      setMsg(data?.error ?? (lang === "vi" ? `Thất bại với mã ${res.status}` : `Failed with ${res.status}`));
      setLoading(false);
      return;
    }

    setStage("done");
    setMsg(lang === "vi" ? "Đã tạo tài khoản. Đăng nhập để tiếp tục." : "Account created. Now sign in to continue.");

    // Send them to sign-in
    setTimeout(() => {
      window.location.href = "/sign-in";
    }, 700);
  }

  const inputStyle = {
    padding: 10,
    border: "1px solid #ddd",
    borderRadius: 10,
    width: "100%",
    fontSize: 14,
  };

  const buttonStyle = {
    padding: 12,
    borderRadius: 12,
    border: "1px solid #111",
    background: "#111",
    color: "white",
    fontWeight: 600,
    cursor: "pointer",
    width: "100%",
    fontSize: 14,
  };

  const secondaryButtonStyle = {
    ...buttonStyle,
    background: "white",
    color: "#111",
  };

  const oauthButtonStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    border: "1px solid #ddd",
    background: "white",
    color: "#333",
    fontWeight: 500,
    cursor: "pointer",
    width: "100%",
    fontSize: 14,
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <LanguageToggle />
      </div>

      {stage === "start" && (
        <>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
            {lang === "vi" ? "Lời Mời Gia Đình" : "Family Invitation"}
          </h1>

          <p style={{ opacity: 0.8, marginBottom: 24 }}>
            {t.youAreInvited}
          </p>

          <div style={{ display: "grid", gap: 12 }}>
            <button 
              onClick={accept} 
              disabled={loading}
              style={buttonStyle}
            >
              {loading 
                ? (lang === "vi" ? "Đang xử lý..." : "Processing...") 
                : t.acceptInvite
              }
            </button>
            <button 
              onClick={() => {
                setStage("done");
                setMsg(lang === "vi" ? "Đã từ chối lời mời." : "Invitation declined.");
              }}
              style={secondaryButtonStyle}
            >
              {lang === "vi" ? "Từ chối" : "Decline"}
            </button>
          </div>

          {authStatus === "unauthenticated" && (
            <p style={{ marginTop: 20, textAlign: "center", fontSize: 14, color: "#666" }}>
              {t.alreadyHaveAccount}{" "}
              <a
                href={`/sign-in?callbackUrl=${encodeURIComponent(`/accept-invite?token=${token}`)}`}
                style={{ color: "#111", fontWeight: 600, textDecoration: "underline" }}
              >
                {t.signIn}
              </a>
            </p>
          )}
        </>
      )}

      {stage === "register" && (
        <>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
            {t.createAccount}
          </h1>

          <p style={{ opacity: 0.8, marginBottom: 24 }}>
            {lang === "vi" 
              ? "Tạo tài khoản để nhận hồ sơ của bạn trong cây gia đình."
              : "Create an account to claim your profile in the family tree."}
          </p>

          {/* OAuth Buttons */}
          <div style={{ display: "grid", gap: 12, marginBottom: 20 }}>
            <button 
              onClick={() => signIn("google", { callbackUrl: `/api/invitations/accept-oauth?token=${token}` })}
              style={oauthButtonStyle}
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              {lang === "vi" ? "Tiếp tục với Google" : "Continue with Google"}
            </button>
          </div>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <div style={{ flex: 1, height: 1, background: "#ddd" }} />
            <span style={{ fontSize: 12, color: "#999" }}>
              {lang === "vi" ? "hoặc" : "or"}
            </span>
            <div style={{ flex: 1, height: 1, background: "#ddd" }} />
          </div>

          {/* Email/Password Form */}
          <form onSubmit={(e) => { e.preventDefault(); createAccount(); }} style={{ display: "grid", gap: 12 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span>{t.email}</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={inputStyle}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span>{t.password}</span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={lang === "vi" ? "8 ký tự trở lên" : "8+ characters"}
                style={inputStyle}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span>{lang === "vi" ? "Xác nhận mật khẩu" : "Confirm Password"}</span>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={lang === "vi" ? "Nhập lại mật khẩu" : "Re-enter password"}
                style={inputStyle}
              />
            </label>

            {passwordError && (
              <div style={{ color: "crimson", fontSize: 14 }}>
                {passwordError}
              </div>
            )}

            {msg && stage === "error" && (
              <div style={{ color: "crimson", fontSize: 14 }}>
                {msg}
              </div>
            )}

            <button 
              type="submit"
              disabled={loading}
              style={{
                ...buttonStyle,
                opacity: loading ? 0.7 : 1,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading 
                ? (lang === "vi" ? "Đang tạo..." : "Creating...") 
                : (lang === "vi" ? "Tạo tài khoản" : "Create Account")
              }
            </button>

            <button 
              type="button"
              onClick={() => setStage("start")} 
              style={secondaryButtonStyle}
            >
              {t.back}
            </button>
          </form>
        </>
      )}

      {stage === "done" && (
        <div style={{ textAlign: "center" }}>
          <div style={{ 
            width: 64, 
            height: 64, 
            borderRadius: "50%", 
            background: "#e8f5e9", 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center",
            margin: "0 auto 16px",
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#4caf50" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
            {lang === "vi" ? "Hoàn tất!" : "Done!"}
          </h1>
          <p style={{ opacity: 0.8 }}>
            {msg || (lang === "vi" ? "Hoàn tất." : "Done.")}
          </p>
        </div>
      )}

      {stage === "error" && (
        <div style={{ textAlign: "center" }}>
          <div style={{ 
            width: 64, 
            height: 64, 
            borderRadius: "50%", 
            background: "#ffebee", 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center",
            margin: "0 auto 16px",
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f44336" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, color: "#c62828" }}>
            {t.error}
          </h1>
          <p style={{ marginBottom: 16 }}>{msg}</p>
          <p style={{ opacity: 0.7, fontSize: 14, marginBottom: 20 }}>
            {lang === "vi" 
              ? "Nếu bạn đã tạo tài khoản, hãy đăng nhập rồi thử lại."
              : "If you already created an account, sign in and try again."}
          </p>
          <button 
            onClick={() => setStage("start")} 
            style={secondaryButtonStyle}
          >
            {lang === "vi" ? "Thử lại" : "Try Again"}
          </button>
        </div>
      )}
    </>
  );
}
