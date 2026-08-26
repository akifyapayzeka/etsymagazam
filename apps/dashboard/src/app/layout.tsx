import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Etsy AI Autopilot",
  description: "Store operator dashboard",
};

// Temporary diagnostic: Next's default "Application error" screen swallows the
// real error message/stack. This vanilla, dependency-free script runs before
// any React/webpack chunk, so it catches failures even if a chunk fails to
// load or parse (the kind of failure a React error boundary can miss) and
// renders the real error directly into the page instead of the generic text.
// Remove once the underlying dashboard crash is found and fixed.
const CRASH_REPORTER_SCRIPT = `
(function () {
  function report(label, detail) {
    var el = document.getElementById("__crash_report");
    if (!el) {
      el = document.createElement("div");
      el.id = "__crash_report";
      el.style.cssText = "position:fixed;inset:0;z-index:999999;background:#fff;color:#111;padding:16px;font:12px/1.5 monospace;overflow:auto;white-space:pre-wrap;";
      document.body.appendChild(el);
    }
    var line = document.createElement("div");
    line.style.marginBottom = "12px";
    line.textContent = "[" + label + "] " + detail;
    el.appendChild(line);
  }
  window.addEventListener("error", function (e) {
    var err = e.error;
    report("window.onerror", (err && (err.stack || err.message)) || e.message || String(e));
  });
  window.addEventListener("unhandledrejection", function (e) {
    var reason = e.reason;
    report("unhandledrejection", (reason && (reason.stack || reason.message)) || String(reason));
  });
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: CRASH_REPORTER_SCRIPT }} />
      </head>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
