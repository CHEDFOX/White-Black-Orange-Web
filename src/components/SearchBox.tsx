"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SearchBox({
  initialQuery = "",
  autoFocus = false,
  placeholder = "Search by ticker or company name",
}: {
  initialQuery?: string;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);

  return (
    <form
      className="row"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = query.trim();
        if (trimmed) router.push(`/search?q=${encodeURIComponent(trimmed)}`);
      }}
    >
      <label className="sr-only" htmlFor="instrument-search">
        Search instruments
      </label>
      <input
        id="instrument-search"
        type="search"
        value={query}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        onChange={(event) => setQuery(event.target.value)}
        style={{ flex: "1 1 260px" }}
      />
      <button className="btn btn-primary" type="submit">
        Search
      </button>
    </form>
  );
}
