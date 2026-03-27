export const dynamic = "force-dynamic";

import { Suspense } from "react";
import AcceptInviteClient from "./AcceptInviteClient";

export default function AcceptInvitePage() {
  return (
    <main
      style={{
        maxWidth: 420,
        margin: "0 auto",
        padding: "40px 20px",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <Suspense fallback={
        <div style={{ textAlign: "center", opacity: 0.6 }}>Loading...</div>
      }>
        <AcceptInviteClient />
      </Suspense>
    </main>
  );
}
