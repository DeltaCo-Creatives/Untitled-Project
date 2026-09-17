import { useCallback, useEffect, useState } from 'react';
import { api, type PlansResponse } from '../lib/api';
import { errorMessage } from '../lib/messages';

// One request per page load, shared by every component that asks. A failed request
// is forgotten so the next caller (or a retry) tries again.
let pending: Promise<PlansResponse> | null = null;
let resolved: PlansResponse | null = null;

function loadPlans() {
  if (!pending) {
    pending = api.plans().then(
      (response) => {
        resolved = response;
        return response;
      },
      (err: unknown) => {
        pending = null;
        throw err;
      },
    );
  }
  return pending;
}

export function usePlans(): {
  plans: PlansResponse | null;
  loading: boolean;
  error: string | null;
  /** Forget a failed request and ask again. */
  retry: () => void;
} {
  const [plans, setPlans] = useState<PlansResponse | null>(resolved);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    loadPlans().then(
      (response) => {
        if (!active) return;
        setPlans(response);
        setError(null);
      },
      (err: unknown) => {
        if (active) setError(errorMessage(err, 'Couldn’t load plans'));
      },
    );
    return () => {
      active = false;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setError(null);
    setAttempt((n) => n + 1);
  }, []);

  return { plans, loading: plans === null && error === null, error, retry };
}
