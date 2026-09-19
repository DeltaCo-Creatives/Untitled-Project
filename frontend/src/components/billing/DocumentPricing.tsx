import { Clock3, FileText, Check } from 'lucide-react';
import type { DocumentPricing as DocumentPricingData, PlanId, PlanInfo } from '../../lib/api';
import { formatCount, plural } from '../../lib/format';
import { Button } from '../ui/Button';
import { PAYMENTS_PENDING_NOTE, formatPrice, monthsFree } from './planFeatures';
import { TopupPacks } from './TopupPacks';

interface DocumentPricingSectionProps {
  documents: DocumentPricingData;
  currency: string;
  /** Image plans, to label each add-on with its plan's name. */
  imagePlans: PlanInfo[];
}

/** Documents aren't sortable yet: every price here is a preview until `documents.available` flips on. */
export function DocumentPricingSection({ documents, currency, imagePlans }: DocumentPricingSectionProps) {
  const addonEntries = Object.entries(documents.addons) as [PlanId, NonNullable<DocumentPricingData['addons'][PlanId]>][];

  return (
    <section id="documents" aria-labelledby="documents-heading" className="mx-auto max-w-6xl scroll-mt-24 px-4 pb-20">
      <div className="mb-10 text-center">
        {!documents.available && (
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-1.5 text-xs font-bold shadow-soft">
            <Clock3 className="h-3.5 w-3.5 text-lavender-deep" aria-hidden />
            Coming soon — not sortable yet, prices below are a preview
          </p>
        )}
        <h2 id="documents-heading" className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
          Sort documents too
        </h2>
        <p className="mx-auto max-w-2xl text-lg leading-relaxed text-ink-soft">
          PDF, Word, Google Docs and text files up to {documents.maxFileMb} MB, sorted exactly like images. Documents
          have their own allowance — one document is one document credit no matter how long it is, because the AI
          only reads the first {plural(documents.pagesRead, 'page', 'pages')} to name and file it. Free includes{' '}
          {formatCount(documents.freeDocuments)} documents.
        </p>
      </div>

      {addonEntries.length > 0 && (
        <div className="mb-12">
          <h3 className="mb-5 text-center text-xl font-bold tracking-tight">Add documents to your plan</h3>
          <ul className="grid gap-5 sm:grid-cols-3">
            {addonEntries.map(([planId, addon]) => {
              const planLabel = imagePlans.find((p) => p.id === planId)?.label ?? planId;
              return (
                <li key={planId} className="rounded-[2rem] border border-line bg-white p-6 shadow-soft">
                  <p className="text-xs font-extrabold uppercase tracking-wider text-ink-soft">{planLabel}</p>
                  <p className="mt-1.5 font-display text-2xl font-bold text-ink">
                    +{formatPrice(addon.price.monthly, currency)}
                    <span className="text-sm font-bold text-ink-soft">/month</span>
                  </p>
                  <p className="mt-1 text-sm font-semibold text-ink-soft">
                    {formatCount(addon.monthlyDocuments)} documents/month
                  </p>
                  {addon.price.yearly != null && (
                    <p className="mt-1 text-xs font-bold text-ink-soft">or {formatPrice(addon.price.yearly, currency)}/year</p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="mb-12">
        <h3 className="mb-5 text-center text-xl font-bold tracking-tight">Document-only plans</h3>
        <div className="grid gap-6 md:grid-cols-3">
          {documents.plans.map((plan) => {
            const freeMonths = plan.price.yearly != null ? monthsFree(plan.price.monthly, plan.price.yearly) : 0;
            const features = [
              plural(plan.maxProcesses, 'document process', 'document processes'),
              `${plural(plan.aiPerProcess, 'AI worker', 'AI workers')} per process`,
              `${formatCount(plan.monthlyDocuments)} documents/month`,
            ];
            return (
              <article key={plan.id} className="flex flex-col rounded-[2rem] border border-line bg-white p-6 shadow-soft sm:p-7">
                <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-periwinkle-soft shadow-soft">
                  <FileText className="h-6 w-6 text-ink" aria-hidden />
                </span>
                <h4 className="text-2xl font-semibold tracking-tight">{plan.label}</h4>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">{plan.tagline}</p>
                <div className="my-5 border-b border-dashed border-line pb-5">
                  <p className="font-display text-3xl font-bold tracking-tight text-ink">
                    <span aria-hidden>{formatPrice(plan.price.monthly, currency)}</span>
                    <span aria-hidden className="text-base font-bold text-ink-soft">
                      /month
                    </span>
                    <span className="sr-only">{formatPrice(plan.price.monthly, currency)} per month</span>
                  </p>
                  {plan.price.yearly != null && (
                    <p className="mt-1.5 text-xs font-bold text-ink-soft">
                      or {formatPrice(plan.price.yearly, currency)}/year
                      {freeMonths >= 1 ? ` — ${plural(freeMonths, 'month', 'months')} free` : ''}
                    </p>
                  )}
                </div>
                <ul className="mb-6 space-y-2.5">
                  {features.map((feature) => (
                    <li key={feature} className="flex gap-2.5 text-sm font-semibold leading-snug">
                      <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-periwinkle-soft">
                        <Check className="h-3 w-3 text-ink" strokeWidth={3} aria-hidden />
                      </span>
                      {feature}
                    </li>
                  ))}
                </ul>
                <span className="mt-auto block" title={PAYMENTS_PENDING_NOTE}>
                    <Button
                      disabled
                      variant="secondary"
                      className="w-full"
                      title={PAYMENTS_PENDING_NOTE}
                      aria-label={`Choose ${plan.label}: coming soon`}
                    >
                      <Clock3 className="h-4 w-4" aria-hidden />
                      Coming soon
                    </Button>
                  </span>
              </article>
            );
          })}
        </div>
      </div>

      {documents.packs.length > 0 && (
        <div>
          <h3 className="mb-5 text-center text-xl font-bold tracking-tight">Document packs</h3>
          <TopupPacks
            packs={documents.packs.map((pack) => ({ id: pack.id, images: pack.documents, price: pack.price }))}
            currency={currency}
            unitLabel="document"
          />
        </div>
      )}
    </section>
  );
}
