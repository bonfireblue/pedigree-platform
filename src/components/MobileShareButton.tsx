"use client";

import { useState } from "react";

interface MobileShareButtonProps {
  inviteUrl: string;
  personName: string;
  onClose?: () => void;
  translations: {
    shareViaApps: string;
    copyLink: string;
    linkCopied: string;
    shareNotSupported: string;
    inviteMessage: string;
  };
}

export function MobileShareButton({
  inviteUrl,
  personName,
  onClose,
  translations: t,
}: MobileShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  const shareText = t.inviteMessage.replace("{name}", personName);

  async function handleNativeShare() {
    if (!navigator.share) {
      setShareError(t.shareNotSupported);
      return;
    }

    try {
      await navigator.share({
        title: "Family Tree Invitation",
        text: shareText,
        url: inviteUrl,
      });
      onClose?.();
    } catch (err) {
      // User cancelled or share failed
      if (err instanceof Error && err.name !== "AbortError") {
        setShareError(err.message);
      }
    }
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = inviteUrl;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const canShare = typeof navigator !== "undefined" && !!navigator.share;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Native Share Button - Primary action on mobile */}
      {canShare && (
        <button
          type="button"
          onClick={handleNativeShare}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            width: "100%",
            padding: "14px 20px",
            borderRadius: 12,
            border: "none",
            background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
            color: "#ffffff",
            fontSize: 15,
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: "0 4px 14px rgba(59, 130, 246, 0.4)",
            transition: "transform 0.15s, box-shadow 0.15s",
          }}
          onMouseDown={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.98)";
          }}
          onMouseUp={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
          {t.shareViaApps}
        </button>
      )}

      {/* Copy Link Button - Fallback for desktop or secondary action */}
      <button
        type="button"
        onClick={handleCopyLink}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          width: "100%",
          padding: "14px 20px",
          borderRadius: 12,
          border: "1px solid #e5e7eb",
          background: copied ? "#ecfdf5" : "#ffffff",
          color: copied ? "#166534" : "#374151",
          fontSize: 15,
          fontWeight: 600,
          cursor: "pointer",
          transition: "all 0.2s",
        }}
      >
        {copied ? (
          <>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {t.linkCopied}
          </>
        ) : (
          <>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            {t.copyLink}
          </>
        )}
      </button>

      {/* Invite Link Preview */}
      <div
        style={{
          padding: 12,
          borderRadius: 8,
          background: "#f9fafb",
          border: "1px solid #e5e7eb",
          wordBreak: "break-all",
          fontSize: 12,
          color: "#6b7280",
          fontFamily: "monospace",
        }}
      >
        {inviteUrl}
      </div>

      {shareError && (
        <div
          style={{
            padding: 10,
            borderRadius: 8,
            background: "#fef2f2",
            color: "#dc2626",
            fontSize: 13,
            textAlign: "center",
          }}
        >
          {shareError}
        </div>
      )}
    </div>
  );
}
