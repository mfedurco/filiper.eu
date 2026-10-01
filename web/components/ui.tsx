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
    <section className="section-shell pb-6 pt-2 md:pt-4">
      {eyebrow ? <p className="kicker animate-fade-up">{eyebrow}</p> : null}
      <h1 className="font-display animate-fade-up text-4xl text-moss-50 md:text-5xl">
        {title}
      </h1>
      {description ? (
        <p className="lead animate-fade-up-delay">{description}</p>
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
    <div className="surface section-shell px-6 py-12 text-center">
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
      <div className="callout px-6 py-10 text-center">
        <h2 className="font-display text-2xl text-lantern">{title}</h2>
        <p className="mt-2 text-mist-muted">{description}</p>
      </div>
    </div>
  );
}

export function LoadingBlock({ label = "Načítavam…" }: { label?: string }) {
  return (
    <div className="section-shell py-16">
      <div className="surface px-6 py-12 text-center">
        <div className="bar mx-auto mb-4 w-40">
          <i className="animate-soft-pulse" style={{ width: "55%" }} />
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
      className={cn("bar", className)}
      role="progressbar"
      aria-valuenow={safe}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <i className="animate-progress" style={{ width: `${safe}%` }} />
    </div>
  );
}
