import type { Metadata } from "next";
import Link from "next/link";

import "@/styles/globals.css";

export const metadata: Metadata = {
  title: {
    default: "Stock Intelligence",
    template: "%s · Stock Intelligence",
  },
  description:
    "Evidence-driven stock analysis: point-in-time history, validated " +
    "forecasting baselines, and every conclusion linked to the data behind it.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <a className="skip-link" href="#main">
            Skip to content
          </a>
          <header className="site-header">
            <div className="container site-header-inner">
              <Link href="/" className="brand">
                <span className="brand-mark" aria-hidden="true">
                  SI
                </span>
                Stock Intelligence
              </Link>
              <nav className="row small" aria-label="Site">
                <Link href="/search">Search</Link>
                <Link href="/sources">Data sources</Link>
              </nav>
            </div>
          </header>

          <main className="main" id="main">
            {children}
          </main>

          <footer className="site-footer">
            <div className="container">
              <p>
                <strong>Research and educational tooling.</strong> Not
                personalised investment advice, not a recommendation to buy or
                sell, and no account of any individual&apos;s circumstances.
                This platform does not execute trades.
              </p>
              <p className="tiny">
                Forecasts are probability distributions under stated
                assumptions, not predictions. No model here has demonstrated
                profitable predictive performance; several are reference
                baselines whose purpose is to be beaten. See{" "}
                <Link href="/sources">data sources and limitations</Link>.
              </p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
