"use client";

import { useRouter, useSearchParams } from "next/navigation";

/**
 * Model and horizon selection.
 *
 * Baseline models are labelled as such in the list. That is deliberate: a user
 * choosing a model should see which ones exist to be beaten rather than
 * discovering it in the fine print.
 */
export function ForecastControls({
  basePath,
  models,
  selectedModel,
  selectedHorizon,
}: {
  basePath: string;
  models: Array<{ key: string; display_name: string; is_baseline: boolean; supported_horizons: string[] }>;
  selectedModel: string;
  selectedHorizon: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    next.set(key, value);
    router.push(`${basePath}?${next.toString()}`);
  }

  const current = models.find((m) => m.key === selectedModel);
  const horizons = current?.supported_horizons ?? ["1d", "5d", "1mo", "3mo", "6mo", "1y"];

  return (
    <div className="row">
      <label className="field" style={{ margin: 0, minWidth: 260 }}>
        <span className="field-label">Model</span>
        <select
          value={selectedModel}
          onChange={(event) => update("model", event.target.value)}
        >
          {models.map((model) => (
            <option key={model.key} value={model.key}>
              {model.display_name}
              {model.is_baseline ? " (baseline)" : ""}
            </option>
          ))}
        </select>
      </label>

      <label className="field" style={{ margin: 0 }}>
        <span className="field-label">Horizon</span>
        <select
          value={horizons.includes(selectedHorizon) ? selectedHorizon : horizons[0]}
          onChange={(event) => update("horizon", event.target.value)}
        >
          {horizons.map((horizon) => (
            <option key={horizon} value={horizon}>
              {horizon}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
