import { cn } from "@/lib/utils";

export function PageHero({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="section-shell pt-10 pb-6 md:pt-14">
      {eyebrow ? (
        <p className="badge mb-4 animate-fade-up">{eyebrow}</p>
      ) : null}
      <h1 className="font-display animate-fade-up text-4xl font-semibold tracking-tight text-moss-50 md:text-5xl">
        {title}
      </h1>
      {description ? (
        <p className="mt-3 max-w-2xl animate-fade-up-delay text-base text-mist-muted md:text-lg">
          {description}
        </p>
      ) : null}
      {children ? <div className="mt-6 animate-fade-up-delay-2">{children}</div> : null}
    </section>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="surface section-shell rounded-xl px-6 py-12 text-center">
      <h2 className="font-display text-2xl text-moss-50">{title}</h2>
      <p className="mt-2 text-mist-muted">{description}</p>
    </div>
  );
}

export function ErrorState({
  title = "Niečo sa pokazilo",
  description = "Dáta sa nepodarilo načítať. Skús obnoviť stránku.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="section-shell">
      <div className="rounded-xl border border-[rgba(196,163,90,0.35)] bg-[rgba(196,163,90,0.08)] px-6 py-10 text-center">
        <h2 className="font-display text-2xl text-lantern">{title}</h2>
        <p className="mt-2 text-mist-muted">{description}</p>
      </div>
    </div>
  );
}

export function LoadingBlock({ label = "Načítavam…" }: { label?: string }) {
  return (
    <div className="section-shell py-16">
      <div className="surface rounded-xl px-6 py-12 text-center">
        <div className="mx-auto mb-4 h-2 w-40 overflow-hidden rounded-sm bg-[rgba(201,214,204,0.12)]">
          <div className="h-full w-1/2 animate-soft-pulse rounded-sm bg-moss-500" />
        </div>
        <p className="text-mist-muted">{label}</p>
      </div>
    </div>
  );
}

export function ProgressBar({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const safe = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn(
        "h-2.5 overflow-hidden rounded-sm bg-[rgba(201,214,204,0.12)]",
        className,
      )}
    >
      <div
        className="animate-progress h-full rounded-sm bg-gradient-to-r from-moss-600 to-lantern"
        style={{ width: `${safe}%` }}
      />
    </div>
  );
}
