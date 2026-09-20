import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CircleAlert, Info, LoaderCircle, Mail, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { api, ApiError, type MeResponse } from '../lib/api';
import { formatCount } from '../lib/format';
import { errorMessage } from '../lib/messages';
import { gsap, useGSAP, MOTION_OK } from '../lib/gsap';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { usePlans } from '../hooks/usePlans';
import { freeDocumentAllowance, freeImageAllowance } from '../components/billing/planFeatures';
import { Logo } from '../components/ui/Logo';
import { Button, ButtonLink } from '../components/ui/Button';
import { TextField } from '../components/ui/TextField';

interface FormState {
  name: string;
  email: string;
  workType: string;
  weeklyVolume: string;
  consent: boolean;
}

const EMPTY_FORM: FormState = { name: '', email: '', workType: '', weeklyVolume: '', consent: false };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

function validate(form: FormState): Record<string, string> {
  const errors: Record<string, string> = {};
  const name = form.name.trim();
  if (!name) errors.name = 'Enter your name.';
  else if (name.length > 120) errors.name = 'Keep your name to 120 characters or fewer.';

  const email = form.email.trim();
  if (!email) errors.email = 'Enter the Google account email you’ll sign in with.';
  else if (email.length > 320 || !EMAIL_PATTERN.test(email)) errors.email = 'Enter a valid email address.';

  if (!form.consent) errors.consent = 'Tick the consent box so we may email you about the beta.';

  return errors;
}

/** Maps the backend's { field, message } details straight onto this form's field names. */
function fieldErrorsFromApi(err: unknown): Record<string, string> {
  if (!(err instanceof ApiError) || !err.details) return {};
  const errors: Record<string, string> = {};
  for (const { field, message } of err.details) {
    if (!errors[field]) errors[field] = message;
  }
  return errors;
}

/** Statuses that mean "this server doesn't have the public signup route", not "you aren't signed in". */
const AUTH_SHAPED = new Set([401, 403, 404, 405]);

const WHAT_TO_EXPECT = [
  'You’ll see a “Google hasn’t verified this app” screen when you sign in. Choose Advanced → Continue. It goes away once Google finishes reviewing us.',
  'While we’re in review, Google expires Drive access every 7 days, so you’ll reconnect about once a week. We’ll remind you in the app.',
  'Your files are never stored. They’re read in memory and discarded the moment sorting is done.',
];

export default function Beta() {
  useDocumentTitle('Request beta access');
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { plans } = usePlans();
  const pageRef = useRef<HTMLDivElement>(null);
  const successHeadingRef = useRef<HTMLHeadingElement>(null);
  const errorRegionRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Only relevant for a signed-in visitor who already happens to be an active tester — most people filling
  // this form out aren't one yet. Best-effort: the page works fine without it.
  const [me, setMe] = useState<MeResponse | null>(null);
  useEffect(() => {
    if (!userId) return;
    let active = true;
    api.me().then(
      (response) => {
        if (active) setMe(response);
      },
      () => {
        // Silent: this is a nice-to-have line on a public page, not something worth erroring over.
      },
    );
    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    if (submitted) successHeadingRef.current?.focus();
  }, [submitted]);

  useGSAP(
    () => {
      if (!pageRef.current) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap
          .timeline({ defaults: { ease: 'back.out(1.6)' } })
          .from('.beta-card', { y: 32, autoAlpha: 0, duration: 0.7 })
          .from('.beta-card [data-enter]', { y: 16, autoAlpha: 0, stagger: 0.06, duration: 0.45 }, '<0.2');
      });
      return () => mm.revert();
    },
    { scope: pageRef },
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const clientErrors = validate(form);
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      errorRegionRef.current?.focus();
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await api.submitBetaSignup({
        name: form.name.trim(),
        email: form.email.trim(),
        workType: form.workType.trim() || undefined,
        weeklyVolume: form.weeklyVolume.trim() || undefined,
        consent: form.consent,
      });
      setSubmitted(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && err.details?.length) {
        setErrors(fieldErrorsFromApi(err));
      } else if (err instanceof ApiError && err.code === 'rate_limited') {
        setErrors({ form: err.message });
      } else if (err instanceof ApiError && AUTH_SHAPED.has(err.status)) {
        // This endpoint is public and sends no token, so an auth-shaped refusal can only mean the
        // server predates the beta routes. On the older backend /api/beta/* falls past the router
        // that mounts it and lands on the authenticated one, which answers "Missing bearer token"
        // — meaningless to someone filling in a signup form, and not their problem to solve.
        setErrors({
          form: 'Beta sign-up isn’t live on this server yet. Try again in a few minutes, or email support@drivetag-ai.com and we’ll add you by hand.',
        });
      } else {
        setErrors({ form: errorMessage(err, 'Couldn’t submit your request. Please try again.') });
      }
      errorRegionRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  }

  const errorList = Object.values(errors).filter(Boolean);
  const freeImages = freeImageAllowance(plans);
  const freeDocuments = freeDocumentAllowance(plans);
  const betaDiscount = me?.beta.discountPercent && me.beta.discountPercent > 0 ? me.beta.discountPercent : null;

  return (
    <div ref={pageRef} className="min-h-screen">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Logo />
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold text-ink-soft hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back home
        </Link>
      </div>

      <main id="main-content" className="mx-auto max-w-3xl px-4 pb-20 pt-6 sm:pt-10">
        <div className="beta-card rounded-[2rem] border border-line bg-white p-8 shadow-lift sm:p-10">
          <div data-enter className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-lavender to-periwinkle">
            <Sparkles className="h-7 w-7 text-ink" aria-hidden />
          </div>
          <h1 data-enter className="mb-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Request beta access
          </h1>
          <p data-enter className="mb-8 max-w-xl leading-relaxed text-ink-soft">
            DriveTag AI is in closed beta while Google reviews our Drive integration. Places are limited — Google
            caps our tester list at 100 accounts — so access is granted by hand rather than by signing up directly.
          </p>

          <section data-enter aria-labelledby="expect-heading" className="mb-8 rounded-2xl bg-butter-soft p-5">
            <h2 id="expect-heading" className="mb-3 flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide text-ink">
              <Info className="h-4 w-4" aria-hidden />
              What to expect
            </h2>
            <ul className="space-y-2.5">
              {WHAT_TO_EXPECT.map((point) => (
                <li key={point} className="flex gap-2.5 text-sm leading-relaxed text-ink">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-soft" aria-hidden />
                  {point}
                </li>
              ))}
            </ul>
          </section>

          {submitted ? (
            <div role="status" className="rounded-2xl border border-sage bg-sage-soft p-6 text-center sm:p-8">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-soft">
                <Mail className="h-6 w-6 text-ink" aria-hidden />
              </div>
              <h2 ref={successHeadingRef} tabIndex={-1} className="mb-2 text-xl font-bold focus:outline-none">
                You’re on the list
              </h2>
              <p className="mx-auto max-w-md leading-relaxed text-ink">
                We’ll review your request and, if there’s room, add your Google account to our tester list and email
                you an invite. There’s no fixed timeline — we add people as space opens up.
              </p>
              <p className="mt-3 text-sm text-ink">
                Questions in the meantime? Write to{' '}
                <a
                  href="mailto:support@drivetag-ai.com"
                  className="font-semibold text-ink underline underline-offset-2 hover:text-ink/80 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60"
                >
                  support@drivetag-ai.com
                </a>
                .
              </p>
            </div>
          ) : (
            <form data-enter noValidate onSubmit={(event) => void handleSubmit(event)}>
              <div
                ref={errorRegionRef}
                tabIndex={-1}
                role="alert"
                className={
                  errorList.length > 0
                    ? 'mb-5 rounded-2xl border border-rose bg-rose-soft px-4 py-3 text-sm font-semibold text-rose-ink focus:outline-none'
                    : 'sr-only'
                }
              >
                {errorList.length > 0 && (
                  <>
                    <p className="mb-1 flex items-center gap-2 font-bold">
                      <CircleAlert className="h-4 w-4 shrink-0" aria-hidden />
                      Please fix the following:
                    </p>
                    <ul className="list-disc space-y-0.5 pl-6">
                      {errorList.map((message) => (
                        <li key={message}>{message}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>

              <fieldset className="mb-6">
                <legend className="mb-3 text-sm font-bold text-ink">Your details</legend>
                <div className="space-y-4">
                  <TextField
                    label="Name"
                    value={form.name}
                    onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                    error={errors.name}
                    maxLength={120}
                    autoComplete="name"
                    disabled={submitting}
                  />
                  <TextField
                    label="Google account email"
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                    hint="It must be the Google account you’ll sign in with — Sign in with Google will fail for any other address."
                    error={errors.email}
                    maxLength={320}
                    autoComplete="email"
                    disabled={submitting}
                  />
                </div>
              </fieldset>

              <fieldset className="mb-6">
                <legend className="mb-3 text-sm font-bold text-ink">About your work (optional)</legend>
                <div className="space-y-4">
                  <TextField
                    label="What you do"
                    value={form.workType}
                    onChange={(event) => setForm((prev) => ({ ...prev, workType: event.target.value }))}
                    placeholder="e.g. photographer, agency ops"
                    maxLength={60}
                    disabled={submitting}
                  />
                  <TextField
                    label="Roughly how many files a week"
                    value={form.weeklyVolume}
                    onChange={(event) => setForm((prev) => ({ ...prev, weeklyVolume: event.target.value }))}
                    placeholder="e.g. 200–500"
                    maxLength={40}
                    disabled={submitting}
                  />
                </div>
              </fieldset>

              <div className="mb-7 space-y-1.5">
                <label className="flex items-start gap-3 text-sm leading-relaxed text-ink">
                  <input
                    type="checkbox"
                    checked={form.consent}
                    onChange={(event) => setForm((prev) => ({ ...prev, consent: event.target.checked }))}
                    aria-describedby={errors.consent ? 'consent-error' : undefined}
                    aria-invalid={errors.consent ? true : undefined}
                    disabled={submitting}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-ink-soft/80 accent-lavender-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60"
                  />
                  <span>
                    I agree DeltaCo Creatives may use this email to invite me to the DriveTag AI beta and contact me
                    about it.{' '}
                    {/* New tab on purpose: reading what you're consenting to shouldn't cost you the
                        half-filled form behind it. Announced, so it isn't a surprise. */}
                    <Link
                      to="/privacy"
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-ink-soft underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60"
                    >
                      Privacy Policy<span className="sr-only"> (opens in a new tab)</span>
                    </Link>
                    .
                  </span>
                </label>
                {errors.consent && (
                  <p id="consent-error" role="alert" className="pl-7 text-xs font-semibold text-rose-ink">
                    {errors.consent}
                  </p>
                )}
              </div>

              <Button type="submit" size="lg" className="w-full" disabled={submitting} magnetic>
                {submitting ? (
                  <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
                ) : (
                  <ShieldCheck className="h-4 w-4" aria-hidden />
                )}
                {submitting ? 'Sending…' : 'Request access'}
              </Button>
            </form>
          )}

          <p data-enter className="mt-6 text-center text-xs leading-relaxed text-ink-soft">
            The beta runs on the Free plan — {formatCount(freeImages)} images and {formatCount(freeDocuments)} documents,
            no time limit — unless we arrange otherwise.
            {betaDiscount ? ` As a tester, you also get ${betaDiscount}% off at checkout once paid plans launch.` : ''}
          </p>
        </div>

        <p className="mt-6 text-center text-sm text-ink-soft">
          Already have an invite?{' '}
          <ButtonLink to="/login" variant="ghost" size="sm">
            Log in
          </ButtonLink>
        </p>
      </main>
    </div>
  );
}
