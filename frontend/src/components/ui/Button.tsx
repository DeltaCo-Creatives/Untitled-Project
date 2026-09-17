import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { usePressMotion } from '../../hooks/usePressMotion';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-2xl font-bold select-none will-change-transform transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60 disabled:cursor-not-allowed disabled:opacity-60';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-lavender text-ink shadow-soft hover:bg-lavender-deep',
  secondary: 'bg-white text-ink border border-line shadow-soft hover:border-lavender',
  ghost: 'text-ink-soft hover:text-ink hover:bg-lavender-soft',
  danger: 'bg-rose text-rose-ink shadow-soft hover:bg-[#ffbfcc]',
};

const SIZES: Record<Size, string> = {
  sm: 'px-3.5 py-2 text-sm',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-7 py-3.5 text-base',
};

interface StyleProps {
  variant?: Variant;
  size?: Size;
  magnetic?: boolean;
  className?: string;
  children: ReactNode;
}

function classes({ variant = 'primary', size = 'md', className = '' }: StyleProps) {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`;
}

export function Button({
  variant,
  size,
  magnetic,
  className,
  children,
  type = 'button',
  ...rest
}: StyleProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  const handlers = usePressMotion<HTMLButtonElement>(magnetic);
  return (
    <button type={type} className={classes({ variant, size, className, children })} {...handlers} {...rest}>
      {children}
    </button>
  );
}

export function ButtonLink({ to, variant, size, magnetic, className, children }: StyleProps & { to: string }) {
  const handlers = usePressMotion<HTMLAnchorElement>(magnetic);
  const cls = classes({ variant, size, className, children });

  if (to.startsWith('#')) {
    return (
      <a href={to} className={cls} {...handlers}>
        {children}
      </a>
    );
  }
  return (
    <Link to={to} className={cls} {...handlers}>
      {children}
    </Link>
  );
}
