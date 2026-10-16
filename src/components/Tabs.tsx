"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Route tabs.
 *
 * A client component because a server layout cannot read which child route is
 * active. Matching is exact for the base href and prefix-based for the rest,
 * so `/instrument/AAPL/past` highlights "Past" and `/instrument/AAPL`
 * highlights "Overview" rather than both.
 */
export function Tabs({
  items,
}: {
  items: Array<{ href: string; label: string; exact?: boolean }>;
}) {
  const pathname = usePathname();

  return (
    <nav className="tabs" aria-label="Analysis views">
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`tab${active ? " tab-active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
