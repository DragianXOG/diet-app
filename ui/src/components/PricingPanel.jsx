// ui/src/components/PricingPanel.jsx
import React from 'react';
import { usePricing } from '../usePricing';

export default function PricingPanel() {
  const {
    preview,
    loadingPreview,
    assigning,
    assignResult,
    error,
    previewPrices,
    assignPrices,
  } = usePricing();

  const items = (preview?.items || []).map((it) => {
    const u = Number(it?.unit_price ?? 0);
    const t = Number(it?.total_price ?? 0);
    const qty = u > 0 ? Number((t / u).toFixed(2)) : null; // derive if available
    return { ...it, _qty: qty };
  });

  const storeTotals = preview?.totals || {};
  const grand = preview?.grand_total;

  return (
    <section
      aria-labelledby="pricing-heading"
      className="pricing-panel"
      style={{
        borderTop: '1px solid #e5e7eb',
        marginTop: '1rem',
        paddingTop: '1rem',
      }}
      aria-busy={loadingPreview || assigning ? 'true' : 'false'}
    >
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <h3 id="pricing-heading" style={{ margin: 0 }}>Pricing</h3>
        <span
          aria-live="polite"
          style={{ fontSize: '0.85rem', color: '#6b7280' }}
        >
          {/* Accessible status */}
          {loadingPreview
            ? 'Previewing prices…'
            : assigning
            ? 'Assigning prices…'
            : ''}
        </span>
      </div>

      <p style={{ margin: '0.25rem 0 0.75rem', color: '#6b7280' }}>
        Prices are estimates and may vary by store/location; no guarantees. This is informational only and not medical or nutritional advice.
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={previewPrices}
          disabled={loadingPreview || assigning}
        >
          {loadingPreview ? 'Previewing…' : 'Preview prices'}
        </button>
        <button
          type="button"
          onClick={assignPrices}
          disabled={assigning || loadingPreview}
          aria-disabled={assigning || loadingPreview}
        >
          {assigning ? 'Assigning…' : 'Assign prices'}
        </button>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            marginTop: '0.75rem',
            background: '#fef2f2',
            color: '#991b1b',
            padding: '0.75rem',
            borderRadius: '0.375rem',
          }}
        >
          {String(error)}
        </div>
      )}

      {/* Table */}
      <div style={{ marginTop: '0.75rem', overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            minWidth: 640,
          }}
        >
          <thead>
            <tr>
              <Th>Item</Th>
              <Th>Suggested store</Th>
              <Th style={{ textAlign: 'right' }}>Unit price</Th>
              <Th style={{ textAlign: 'right' }}>Qty</Th>
              <Th style={{ textAlign: 'right' }}>Line total</Th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '0.75rem', color: '#6b7280' }}>
                  {preview
                    ? 'No items found in preview.'
                    : 'Run “Preview prices” to see estimates.'}
                </td>
              </tr>
            ) : (
              items.map((it) => (
                <tr key={it.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                  <Td>{it.name}</Td>
                  <Td>{it.suggested_store || '—'}</Td>
                  <Td alignRight>
                    {isFinite(it.unit_price) ? `$${Number(it.unit_price).toFixed(2)}` : '—'}
                  </Td>
                  <Td alignRight>{it._qty ?? '—'}</Td>
                  <Td alignRight>
                    {isFinite(it.total_price) ? `$${Number(it.total_price).toFixed(2)}` : '—'}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
          {/* Footer with totals */}
          {preview && (
            <tfoot>
              {Object.entries(storeTotals).map(([store, sum]) => (
                <tr key={`store-${store}`} style={{ borderTop: '2px solid #e5e7eb' }}>
                  <Td colSpan={4} alignRight style={{ fontWeight: 600 }}>
                    {store || 'Unassigned store'}
                  </Td>
                  <Td alignRight style={{ fontWeight: 600 }}>
                    {isFinite(sum) ? `$${Number(sum).toFixed(2)}` : '—'}
                  </Td>
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid #e5e7eb' }}>
                <Td colSpan={4} alignRight style={{ fontWeight: 700 }}>
                  Grand total
                </Td>
                <Td alignRight style={{ fontWeight: 700 }}>
                  {isFinite(grand) ? `$${Number(grand).toFixed(2)}` : '—'}
                </Td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Persistence backend hint */}
      {assignResult?.persist?.backend === 'file' && (
        <p style={{ marginTop: '0.75rem', fontSize: '0.9rem', color: '#6b7280' }}>
          Pricing persisted via file fallback:
          <code style={{ marginLeft: 6 }}>
            {assignResult?.persist?.path || 'data/prices/user-{id}.json'}
          </code>
        </p>
      )}
    </section>
  );
}

function Th({ children, style }) {
  return (
    <th
      scope="col"
      style={{
        textAlign: 'left',
        padding: '0.5rem 0.5rem',
        fontSize: '0.9rem',
        color: '#374151',
        ...style,
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, colSpan, alignRight, style }) {
  return (
    <td
      colSpan={colSpan}
      style={{
        padding: '0.5rem 0.5rem',
        textAlign: alignRight ? 'right' : 'left',
        ...style,
      }}
    >
      {children}
    </td>
  );
}
