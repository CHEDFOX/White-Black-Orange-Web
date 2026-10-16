import { MISSING, formatNumber, humanise, isMissing } from "@/lib/format";
import type { MethodOutcome } from "@/lib/types";

/**
 * Renders a method's numeric outputs as a table.
 *
 * `fields` names which values to show and how to format them. Anything not
 * listed is omitted rather than dumped, and a listed field with no value shows
 * why it is absent — a reader should never meet an unexplained blank.
 */
export function MethodTable({
  outcome,
  fields,
}: {
  outcome: MethodOutcome | undefined;
  fields: Array<{
    key: string;
    label: string;
    format?: (value: unknown) => string;
    note?: string;
  }>;
}) {
  if (!outcome) return null;

  if (!outcome.ok) {
    return (
      <p className="small muted">
        Not computed: {outcome.unavailable_reason ?? "no reason was given."}
      </p>
    );
  }

  const rows = fields.map((field) => {
    const raw = outcome.values[field.key];
    const text = isMissing(raw)
      ? MISSING
      : field.format
        ? field.format(raw)
        : typeof raw === "number"
          ? formatNumber(raw, 4)
          : String(raw);
    return { ...field, text, missing: text === MISSING };
  });

  return (
    <div className="table-wrap">
      <table className="data">
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th style={{ textTransform: "none", fontSize: "0.8125rem" }}>
                {row.label}
                {row.note && <div className="tiny subtle">{row.note}</div>}
              </th>
              <td className="num mono">
                {row.missing ? (
                  <span className="subtle">not available</span>
                ) : (
                  row.text
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Dump every numeric value a method produced, for the detail-minded reader. */
export function AllValues({ outcome }: { outcome: MethodOutcome | undefined }) {
  if (!outcome?.ok) return null;
  const entries = Object.entries(outcome.values).filter(
    ([, value]) => typeof value === "number" || typeof value === "string",
  );
  if (!entries.length) return null;
  return (
    <details className="expand">
      <summary>All values from {outcome.display_name}</summary>
      <div className="table-wrap">
        <table className="data">
          <tbody>
            {entries.map(([key, value]) => (
              <tr key={key}>
                <th style={{ textTransform: "none", fontSize: "0.8125rem" }}>
                  {humanise(key)}
                </th>
                <td className="num mono">
                  {typeof value === "number" ? formatNumber(value, 6) : String(value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
