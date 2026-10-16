import Link from "next/link";

import { SearchBox } from "@/components/SearchBox";
import { EmptyState } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="container">
      <EmptyState
        title="Not found"
        action={
          <div style={{ maxWidth: 420, margin: "0 auto" }}>
            <SearchBox />
          </div>
        }
      >
        That instrument is not in the registry. The registry holds what has been
        ingested rather than a global universe, so a valid ticker may simply not
        be loaded here. <Link href="/search">Browse what is available</Link>.
      </EmptyState>
    </div>
  );
}
