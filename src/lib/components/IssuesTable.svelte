<script lang="ts">
  import type { IssueFeature } from './map-utils';

  let { features, onZoom }: { features: IssueFeature[]; onZoom: (f: IssueFeature) => void } =
    $props();
</script>

<div class="wrap">
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Type</th>
      </tr>
    </thead>
    <tbody>
      {#each features as feature, i (i)}
        <tr onclick={() => onZoom(feature)}>
          <td class="idx">{i + 1}</td>
          <td>
            <span
              class="badge"
              class:overlap={feature.properties.issueType === 'overlap'}
              class:gap={feature.properties.issueType === 'gap'}
              class:boundary-cross={feature.properties.issueType === 'boundary-cross'}
            >
              {feature.properties.issueType === 'overlap'
                ? 'Overlap'
                : feature.properties.issueType === 'gap'
                  ? 'Gap'
                  : feature.properties.issueType === 'boundary-cross'
                    ? 'Boundary Cross'
                    : feature.properties.issueType}
            </span>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .wrap {
    max-height: 200px;
    overflow-y: auto;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    margin-bottom: 0.75rem;
    font-size: 0.82rem;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  thead {
    position: sticky;
    top: 0;
    background: #f9fafb;
    z-index: 1;
  }

  th {
    text-align: left;
    padding: 0.35rem 0.75rem;
    font-weight: 600;
    color: #6b7280;
    border-bottom: 1px solid #e5e7eb;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  tbody tr {
    cursor: pointer;
    border-bottom: 1px solid #f3f4f6;
  }

  tbody tr:last-child {
    border-bottom: none;
  }

  tbody tr:hover {
    background: #eff6ff;
  }

  td {
    padding: 0.3rem 0.75rem;
  }

  .idx {
    color: #9ca3af;
    font-variant-numeric: tabular-nums;
    width: 2rem;
  }

  .badge {
    display: inline-block;
    padding: 0.1rem 0.45rem;
    border-radius: 3px;
    font-weight: 600;
    font-size: 0.75rem;
  }

  .badge.overlap {
    background: #fee2e2;
    color: #b91c1c;
  }

  .badge.gap {
    background: #fef9c3;
    color: #a16207;
  }

  .badge.boundary-cross {
    background: #ffedd5;
    color: #c2410c;
  }
</style>
