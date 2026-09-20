import { useRef, useState } from 'react';
import { Clock3, Package, PackageOpen, PackagePlus, RefreshCw, type LucideIcon } from 'lucide-react';
import { api, type TopupPack } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { gsap, useGSAP, MOTION_OK } from '../../lib/gsap';
import { errorMessage } from '../../lib/messages';
import { openCheckout, rememberPendingCheckout } from '../../lib/lemonSqueezy';
import { Button, ButtonLink } from '../ui/Button';
import { PAYMENTS_PENDING_NOTE, formatPrice, packLabel, perUnitPrice } from './planFeatures';

const ACCENTS: { icon: LucideIcon; bubble: string }[] = [
  { icon: Package, bubble: 'bg-butter' },
  { icon: PackagePlus, bubble: 'bg-periwinkle' },
  { icon: PackageOpen, bubble: 'bg-sage' },
];

interface TopupPacksProps {
  /** Document packs are mapped onto this same shape (`images` holds the document count) by the caller. */
  packs: TopupPack[];
  currency: string;
  /** What each unit in the pack is — "image" (default) or "document". */
  unitLabel?: string;
  className?: string;
  /** Prices are tax-exclusive unless GET /api/plans says otherwise — drives the "Excludes VAT/sales tax" line. */
  pricesIncludeTax?: boolean;
}

export function TopupPacks({ packs, currency, unitLabel = 'image', className = '', pricesIncludeTax = false }: TopupPacksProps) {
  const ref = useRef<HTMLUListElement>(null);
  const { user } = useAuth();
  // Keyed by pack id: each card buys independently, so one pack's busy/error state never touches another's.
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [buyErrors, setBuyErrors] = useState<Record<string, string>>({});

  const buy = async (pack: TopupPack) => {
    if (buyingId) return;
    setBuyErrors((errors) => ({ ...errors, [pack.id]: '' }));
    setBuyingId(pack.id);
    try {
      const { url } = await api.createCheckout({ item: pack.id });
      rememberPendingCheckout(pack.id);
      await openCheckout(url);
    } catch (err) {
      setBuyErrors((errors) => ({ ...errors, [pack.id]: errorMessage(err, 'Couldn’t start checkout. Please try again.') }));
    } finally {
      setBuyingId(null);
    }
  };

  useGSAP(
    () => {
      const root = ref.current;
      if (!root) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const cards = gsap.utils.toArray<HTMLElement>('.pack-card', root);
        if (cards.length === 0) return;
        // Already on screen: play now instead of waiting for a scroll that may never come.
        const onScreen = root.getBoundingClientRect().top < window.innerHeight;
        // opacity, not autoAlpha: visibility:hidden would keep unrevealed packs out of the tab order and accessibility tree.
        const timeline = gsap
          .timeline(onScreen ? {} : { scrollTrigger: { trigger: root, start: 'top 85%', once: true } })
          .from(cards, { y: 36, opacity: 0, duration: 0.7, stagger: 0.1, ease: 'back.out(1.5)' })
          .from(
            gsap.utils.toArray('.pack-icon', root),
            { scale: 0, rotation: -40, duration: 0.6, stagger: 0.1, ease: 'back.out(2.4)' },
            '<0.15',
          );
        // Keyboard focus landing on a pack that hasn't scrolled in yet shows them straight away.
        const onFocusIn = () => {
          if (timeline.progress() === 1) return;
          timeline.scrollTrigger?.kill(false, true);
          timeline.progress(1);
        };
        root.addEventListener('focusin', onFocusIn);
        return () => root.removeEventListener('focusin', onFocusIn);
      });
      return () => mm.revert();
    },
    { scope: ref },
  );

  if (packs.length === 0) return null;

  return (
    <ul ref={ref} className={`grid gap-5 md:grid-cols-3 ${className}`}>
      {packs.map((pack, i) => {
        const accent = ACCENTS[i % ACCENTS.length];
        const Icon = accent.icon;
        const unitPrice = perUnitPrice(pack.price, pack.images, unitLabel, currency);
        const canBuy = pack.purchasable;
        const buying = buyingId === pack.id;
        const buyError = buyErrors[pack.id];
        return (
          <li
            key={pack.id}
            className="pack-card flex flex-col rounded-[2rem] border border-line bg-white p-6 shadow-soft transition-shadow duration-300 hover:shadow-lift"
          >
            <span className={`pack-icon mb-4 flex h-12 w-12 items-center justify-center rounded-2xl ${accent.bubble} shadow-soft`}>
              <Icon className="h-6 w-6 text-ink" aria-hidden />
            </span>
            <h3 className="text-2xl font-semibold tracking-tight">{packLabel(pack.images, unitLabel)}</h3>
            <p className="mt-1 font-display text-xl font-bold text-ink">{formatPrice(pack.price, currency)}</p>
            {unitPrice && <p className="mt-0.5 text-xs font-bold text-ink-soft">{unitPrice}</p>}
            {!pricesIncludeTax && <p className="mt-0.5 text-[11px] font-bold text-ink-soft">Excludes VAT/sales tax</p>}
            <p className="mb-6 mt-3 text-sm leading-relaxed text-ink-soft">Never expire · used after your plan’s allowance</p>
            {canBuy && !user ? (
              // The server can't attribute a purchase without a user id, so a signed-out visitor signs in first.
              <ButtonLink to="/login" variant="secondary" className="mt-auto w-full">
                Sign in to buy
              </ButtonLink>
            ) : canBuy ? (
              <Button
                variant="secondary"
                className="mt-auto w-full"
                onClick={() => buy(pack)}
                disabled={buyingId !== null}
                aria-label={`Buy ${packLabel(pack.images, unitLabel)}`}
              >
                {buying ? (
                  <RefreshCw className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
                ) : (
                  <Package className="h-4 w-4" aria-hidden />
                )}
                {buying ? 'Starting checkout…' : 'Buy pack'}
              </Button>
            ) : (
              <span className="mt-auto block" title={PAYMENTS_PENDING_NOTE}>
                <Button
                  disabled
                  variant="secondary"
                  className="w-full"
                  title={PAYMENTS_PENDING_NOTE}
                  aria-label={`Buy ${packLabel(pack.images, unitLabel)}: coming soon`}
                >
                  <Clock3 className="h-4 w-4" aria-hidden />
                  Coming soon
                </Button>
              </span>
            )}
            {/* Mounted before any error exists, so a screen reader reliably announces the change. */}
            <p aria-live="polite" className={buyError ? 'mt-2 text-xs font-semibold text-rose-ink' : 'sr-only'}>
              {buyError}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
