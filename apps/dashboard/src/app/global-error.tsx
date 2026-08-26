"use client";

// Temporary diagnostic: catches errors thrown by the root layout itself
// (error.tsx cannot — it's rendered inside the layout). Must render its own
// <html>/<body> since it replaces the root layout when active. Remove once
// the dashboard crash is found and fixed.
export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html>
      <body>
        <div style={{ padding: 16, fontFamily: "monospace", fontSize: 12, whiteSpace: "pre-wrap" }}>
          <p>[global-error.tsx boundary]</p>
          <p>message: {error.message}</p>
          {error.digest && <p>digest: {error.digest}</p>}
          <p>stack: {error.stack}</p>
        </div>
      </body>
    </html>
  );
}
