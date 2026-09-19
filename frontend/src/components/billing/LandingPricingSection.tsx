import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { PlansResponse } from '../../lib/api';
import { ButtonLink } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import { FamilyPicker } from './FamilyPicker';
import { PlanGrid } from './PlanGrid';
import { DocumentsExplainer } from './DocumentsExplainer';
import { TransparencyNote } from './TransparencyNote';
import type { FamilyChoice } from './planFeatures';

interface LandingPricingSectionProps {
  plans: PlansResponse | null;
  signedIn: boolean;
}

/**
 * The interactive part of the landing page's pricing section (family picker, compact plan grid, the document
 * explainer and the transparency note). Pulled into its own component because it needs its own `useState` for the
 * selected family — hooks can't live inside a JSX subtree of the page component that owns them elsewhere.
 */
export function LandingPricingSection({ plans, signedIn }: LandingPricingSectionProps) {
  const [family, setFamily] = useState<FamilyChoice>('images');

  if (!plans) {
    return (
      <div role="status" className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <span className="sr-only">Loading plans…</span>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[26rem]" />
        ))}
      </div>
    );
  }

  return (
    <>
      {plans.families.length > 0 && <FamilyPicker families={plans.families} value={family} onChange={setFamily} className="mb-10" />}

      <PlanGrid plans={plans.plans} family={family} currency={plans.currency} signedIn={signedIn} compact />

      <div data-reveal className="mt-10 text-center">
        <ButtonLink to="/plans" variant="secondary">
          Compare plans
          <ArrowRight className="h-4 w-4" aria-hidden />
        </ButtonLink>
      </div>

      <DocumentsExplainer fileLimits={plans.fileLimits} compact className="mt-10" />
      <TransparencyNote currency={plans.currency} compact className="mt-6" />
    </>
  );
}
