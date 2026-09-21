import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CircleAlert, Lock, RefreshCw } from 'lucide-react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import {
  api,
  type AdminSettingKey,
  type AdminSettings,
  type AdminSettingsValues,
  type MeResponse,
  type PlansResponse,
} from '../lib/api';
import { errorMessage } from '../lib/messages';
import { Button, ButtonLink } from '../components/ui/Button';
import { Logo } from '../components/ui/Logo';
import { PageLoader } from '../components/ui/Skeleton';
import { describeAdminError } from '../components/admin/adminErrors';
import { AccountLookupSection } from '../components/admin/AccountLookupSection';
import { BetaDiscountSection } from '../components/admin/BetaDiscountSection';
import { GoogleTestingSection } from '../components/admin/GoogleTestingSection';
import { PaymentsSection } from '../components/admin/PaymentsSection';
import { BetaSignupsCard } from '../components/dashboard/BetaSignupsCard';

/**
 * The owner-only master dashboard: non-secret settings and routine account actions that today
 * require editing a DigitalOcean environment variable and redeploying, or running SQL by hand.
 * `me.admin` only decides whether this renders — the backend re-checks on every write, and every
 * `/api/admin/*` call degrades to a plain message if it reaches a backend that predates this API.
 */
export default function Admin() {
  useDocumentTitle('Owner settings');

  const [me, setMe] = useState<MeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [meError, setMeError] = useState<string | null>(null);

  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [adminEmailCount, setAdminEmailCount] = useState(0);
  const [plans, setPlans] = useState<PlansResponse | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  const loadMe = useCallback(() => {
    setMeLoading(true);
    setMeError(null);
    api.me().then(
      (response) => {
        setMe(response);
        setMeLoading(false);
      },
      (err: unknown) => {
        // Plain errorMessage, not describeAdminError: /api/me predates this release, so a 404/401
        // here is a real auth problem, never a "backend doesn't have the admin API yet" signal.
        setMeError(errorMessage(err, "Couldn't check your account"));
        setMeLoading(false);
      },
    );
  }, []);

  // Scheduled rather than called inline so StrictMode's mount/unmount/mount in dev cancels the
  // first request instead of sending two (same pattern as useDashboardData's first load).
  useEffect(() => {
    const timer = window.setTimeout(() => loadMe(), 0);
    return () => window.clearTimeout(timer);
  }, [loadMe]);

  const loadAdminData = useCallback(() => {
    setDataLoading(true);
    setDataError(null);
    Promise.all([api.admin.settings(), api.plans()]).then(
      ([settingsRes, plansRes]) => {
        setSettings(settingsRes.settings);
        setAdminEmailCount(settingsRes.readOnly.adminEmails);
        setPlans(plansRes);
        setDataLoading(false);
      },
      (err: unknown) => {
        setDataError(describeAdminError(err, "Couldn't load owner settings"));
        setDataLoading(false);
      },
    );
  }, []);

  useEffect(() => {
    if (!me?.admin) return;
    const timer = window.setTimeout(() => loadAdminData(), 0);
    return () => window.clearTimeout(timer);
  }, [me?.admin, loadAdminData]);

  /** Every section writes through this. PUT returns the full fresh settings, not just the changed
   * key, so every section (including siblings) sees the current source right away. */
  const saveSettings = useCallback(async (patch: Partial<AdminSettingsValues>) => {
    const res = await api.admin.updateSettings(patch);
    setSettings(res.settings);
    setAdminEmailCount(res.readOnly.adminEmails);
  }, []);

  const clearSetting = useCallback(async (key: AdminSettingKey) => {
    const res = await api.admin.clearSetting(key);
    setSettings(res.settings);
    setAdminEmailCount(res.readOnly.adminEmails);
  }, []);

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
        <Logo to="/dashboard" size="sm" />
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold text-ink-soft hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to dashboard
        </Link>
      </div>

      <main id="main-content" className="mx-auto max-w-4xl px-4 pb-20 pt-4 sm:pt-8">
        {meLoading ? (
          <PageLoader label="Checking your account" />
        ) : !me || meError ? (
          <div className="mx-auto max-w-lg rounded-[2rem] border border-line bg-white p-8 text-center shadow-lift sm:p-10">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-rose" aria-hidden>
              <CircleAlert className="h-8 w-8 text-rose-ink" />
            </div>
            <h1 className="mb-2 text-2xl font-bold">We couldn't check your account</h1>
            <p role="alert" className="mb-7 leading-relaxed text-ink-soft">
              {meError ?? 'Something went wrong.'}
            </p>
            <Button onClick={loadMe} size="lg">
              <RefreshCw className="h-4 w-4" aria-hidden /> Try again
            </Button>
          </div>
        ) : !me.admin ? (
          <div className="mx-auto max-w-lg rounded-[2rem] border border-line bg-white p-8 text-center shadow-lift sm:p-10">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-lavender-soft" aria-hidden>
              <Lock className="h-8 w-8 text-ink" />
            </div>
            <h1 className="mb-2 text-2xl font-bold">This page is for the account owner</h1>
            <p className="mb-7 leading-relaxed text-ink-soft">
              You're signed in, but this DriveTag account doesn't have owner access.
            </p>
            <ButtonLink to="/dashboard" size="lg">
              Back to dashboard
            </ButtonLink>
          </div>
        ) : (
          <>
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Owner settings</h1>
                <p className="mt-2 max-w-2xl text-ink-soft">
                  Non-secret configuration DriveTag would otherwise need a DigitalOcean redeploy or a hand-run SQL
                  statement to change. Secrets — API keys, webhook signing secrets, encryption keys — always stay in
                  the environment and never show up here.
                </p>
                <p className="mt-2 text-sm font-semibold text-ink-soft">
                  ADMIN_EMAILS: {adminEmailCount} address{adminEmailCount === 1 ? '' : 'es'} configured.
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={loadAdminData} disabled={dataLoading}>
                <RefreshCw className={`h-4 w-4 ${dataLoading ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden />
                {dataLoading ? 'Loading…' : 'Refresh'}
              </Button>
            </div>

            {dataLoading && !settings ? (
              <PageLoader label="Loading owner settings" />
            ) : dataError && !settings ? (
              <div
                role="alert"
                className="flex flex-col items-start gap-3 rounded-2xl border border-rose bg-rose-soft px-5 py-4 text-sm font-semibold text-rose-ink sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="flex items-start gap-2">
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {dataError}
                </span>
                <Button variant="secondary" size="sm" onClick={loadAdminData}>
                  Try again
                </Button>
              </div>
            ) : settings && plans ? (
              <div className="space-y-8">
                {dataError && (
                  <p role="alert" className="rounded-2xl border border-rose bg-rose-soft px-4 py-3 text-sm font-semibold text-rose-ink">
                    {dataError}
                  </p>
                )}
                <PaymentsSection settings={settings} plans={plans} onSave={saveSettings} onClear={clearSetting} />
                <BetaDiscountSection settings={settings} plans={plans} onSave={saveSettings} onClear={clearSetting} />
                <GoogleTestingSection settings={settings} onSave={saveSettings} onClear={clearSetting} />
                <AccountLookupSection plans={plans} />
                <BetaSignupsCard />
              </div>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
