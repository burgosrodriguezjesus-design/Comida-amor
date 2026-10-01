import clsx from 'clsx';
import { LoaderCircle } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  icon,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  loading?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      {...props}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex select-none items-center justify-center gap-2 rounded-2xl font-semibold transition-all duration-150 active:scale-[0.98] disabled:opacity-55 disabled:active:scale-100',
        {
          'bg-brand text-brand-ink shadow-soft-sm hover:bg-brand-strong': variant === 'primary',
          'border border-line-strong bg-surface text-ink hover:bg-surface-2': variant === 'secondary',
          'text-ink-2 hover:bg-surface-2 hover:text-ink': variant === 'ghost',
          'bg-danger text-white hover:opacity-90 dark:text-[#2a1210]': variant === 'danger',
          'bg-brand-soft text-brand hover:brightness-[0.98]': variant === 'soft',
          'h-9 px-3 text-sm': size === 'sm',
          'h-11 px-4 text-[15px]': size === 'md',
          'h-13 px-5 text-base': size === 'lg',
          'h-15 px-6 text-lg': size === 'xl',
        },
        className,
      )}
    >
      {loading ? <LoaderCircle className="animate-spin" size={18} aria-hidden="true" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...props}
      className={clsx(
        'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink active:scale-95 disabled:opacity-40',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Chip({
  selected,
  className,
  children,
  icon,
  style,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean; icon?: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      {...props}
      style={style}
      className={clsx(
        'inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all duration-150 active:scale-[0.97]',
        selected
          ? 'border-transparent bg-ink text-bg shadow-soft-sm'
          : 'border-line-strong bg-surface text-ink hover:border-ink-3',
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  className?: string;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={clsx('inline-flex rounded-2xl bg-surface-2 p-1', className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={clsx(
            'flex-1 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all duration-200',
            value === option.value ? 'bg-surface text-ink shadow-soft-sm' : 'text-ink-2 hover:text-ink',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
  hideLabel,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: ReactNode;
  disabled?: boolean;
  hideLabel?: boolean;
}) {
  return (
    <label className={clsx('flex items-center justify-between gap-4 py-1', disabled && 'opacity-60')}>
      <span className={clsx('min-w-0', hideLabel && 'sr-only')}>
        <span className="block font-medium text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-sm text-ink-2">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx(
          'relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200',
          checked ? 'bg-brand' : 'bg-surface-3',
        )}
      >
        <span
          className={clsx(
            'absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200',
            checked && 'translate-x-5',
          )}
        />
      </button>
    </label>
  );
}

export function Spinner({ className, label = 'Cargando…' }: { className?: string; label?: string }) {
  return (
    <div role="status" className={clsx('flex items-center justify-center gap-2 py-10 text-ink-3', className)}>
      <LoaderCircle className="animate-spin" size={22} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('flex flex-col items-center px-6 py-10 text-center', className)}>
      {icon && <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-brand-soft text-brand">{icon}</div>}
      <h3 className="font-display text-xl font-semibold text-ink">{title}</h3>
      {children && <div className="mt-2 max-w-sm text-[15px] leading-relaxed text-ink-2">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-5 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display text-[1.9rem] leading-tight font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </header>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-[13px] font-bold tracking-[0.08em] text-ink-3 uppercase">{children}</h2>
      {action}
    </div>
  );
}
