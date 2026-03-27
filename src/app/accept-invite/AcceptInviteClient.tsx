"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
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

            {msg && (
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
