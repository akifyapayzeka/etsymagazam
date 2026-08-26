"use client";

// Temporary diagnostic: shows the real error instead of Next's generic
// "Application error" screen. Remove once the dashboard crash is found and fixed.
export default function Error({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div style={{ padding: 16, fontFamily: "monospace", fontSize: 12, whiteSpace: "pre-wrap" }}>
      <p>[error.tsx boundary]</p>
      <p>message: {error.message}</p>
      {error.digest && <p>digest: {error.digest}</p>}
      <p>stack: {error.stack}</p>
    </div>
  );
}
