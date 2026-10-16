"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Logged rather than swallowed: a page that fails silently is worse than
    // one that says it failed.
    console.error("page render failed", error);
  }, [error]);

  return (
    <div className="container">
      <div className="notice notice-error">
        <div className="notice-title">This page could not be rendered</div>
        <p>{error.message}</p>
        {error.digest && <p className="tiny mono subtle">digest {error.digest}</p>}
        <div className="row mt-2">
          <button className="btn" type="button" onClick={() => reset()}>
            Try again
          </button>
          <Link className="btn" href="/">
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
