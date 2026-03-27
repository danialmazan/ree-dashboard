import type { CoverageResponse, MetadataResponse } from "../types";

interface InspectorProps {
  metadata: MetadataResponse;
  selectedKeys: string[];
  threshold: number;
  coverage: CoverageResponse | null;
}

export function Inspector({ metadata, selectedKeys, threshold, coverage }: InspectorProps) {
  return (
    <aside className="inspector">
      <section>
        <p className="eyebrow">Selection</p>
        <h2>{selectedKeys.length} active source groups</h2>
        <div className="chip-list">
          {selectedKeys.map((key) => (
            <span key={key} className="chip">
              {key.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      </section>

      <section>
        <p className="eyebrow">Coverage rule</p>
        <h2>{threshold}% of demand</h2>
        <p className="minor-copy">
          {coverage
            ? `${coverage.hours_matching} of ${coverage.hours_total} hourly intervals match the current threshold.`
            : "Coverage stats unavailable."}
        </p>
      </section>

      <section>
        <p className="eyebrow">Source window</p>
        <h2>Marginal technology cutoff</h2>
        <p className="minor-copy">{new Date(metadata.marginal_cutoff).toLocaleString()}</p>
      </section>

      <section>
        <p className="eyebrow">Feeds</p>
        <ul className="source-list">
          {metadata.sources.map((source) => (
            <li key={source.name}>
              <strong>{source.name}</strong>
              <span>{source.description}</span>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
