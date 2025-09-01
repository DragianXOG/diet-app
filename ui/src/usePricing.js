// ui/src/usePricing.js
import { useState } from 'react';
import { getJSON, postJSON } from './lib/api';

function normalizeErr(msg) {
  if (!msg) return 'Request failed';
  try {
    const parsed = JSON.parse(msg);
    return parsed?.detail || msg;
  } catch {
    return msg;
  }
}

export function usePricing() {
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [assignResult, setAssignResult] = useState(null);
  const [error, setError] = useState(null);

  const previewPrices = async () => {
    setError(null);
    setAssignResult(null);
    setLoadingPreview(true);
    try {
      const data = await getJSON('/groceries/price_preview');
      setPreview(data);
    } catch (e) {
      setError(normalizeErr(e.message));
    } finally {
      setLoadingPreview(false);
    }
  };

  const assignPrices = async () => {
    setError(null);
    setAssignResult(null);
    setAssigning(true);
    try {
      const data = await postJSON('/groceries/price_assign', {});
      setAssignResult(data);
      // Optional: refresh preview so table reflects latest numbers
      try { const refreshed = await getJSON('/groceries/price_preview'); setPreview(refreshed); } catch {}
    } catch (e) {
      setError(normalizeErr(e.message));
    } finally {
      setAssigning(false);
    }
  };

  return {
    preview,
    loadingPreview,
    assigning,
    assignResult,
    error,
    previewPrices,
    assignPrices,
  };
}
