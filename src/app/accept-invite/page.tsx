export const dynamic = "force-dynamic";

import { Suspense } from "react";
import AcceptInviteClient from "./AcceptInviteClient";

export default function AcceptInvitePage() {
  return (
    <main style={{ maxWidth: 560, margin: "40px auto", padding: 20 }}>
      <Suspense fallback={<p>Loading…</p>}>
        <AcceptInviteClient />
      </Suspense>
    </main>
  );
}
