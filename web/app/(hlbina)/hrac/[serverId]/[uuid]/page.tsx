import type { Metadata } from "next";
import Link from "next/link";
import { PortalGap } from "@/components/portal-gap";
import { PageHero } from "@/components/ui";
import { googleConfigured, readSession } from "@/lib/google-auth";
import { claimProfileAction, saveAboutAction } from "@/lib/profile-actions";
import { loadPublicProfile } from "@/lib/player-profile";

export const dynamic = "force-dynamic";

const NOTICE: Record<string, string> = {
  kod: "Kód nesedí alebo už vypršal. V hre napíš /vyprava prepojit a zadaj nový.",
  prepojene: "Profil je prepojený s tvojím Google účtom.",
  ulozena: "Poznámka je uložená.",
  cudzi: "Tento profil patrí inému účtu.",
  prihlasenie: "Najprv sa prihlás cez Google.",
  off: "Prihlásenie cez Google nie je nastavené.",
  zlyhalo: "Google prihlásenie sa nepodarilo.",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ serverId: string; uuid: string }>;
}): Promise<Metadata> {
  const { serverId, uuid } = await params;
  const profile = await loadPublicProfile(serverId, uuid).catch(() => null);
  return { title: profile?.name ?? "Hráč" };
}

export default async function PlayerProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ serverId: string; uuid: string }>;
  searchParams: Promise<{ stav?: string; google?: string }>;
}) {
  const { serverId, uuid } = await params;
  const query = await searchParams;
  const notice = NOTICE[query.stav ?? ""] ?? NOTICE[query.google ?? ""] ?? "";
  let profile: Awaited<ReturnType<typeof loadPublicProfile>> = null;
  let failed = false;
  try {
    profile = await loadPublicProfile(serverId, uuid);
  } catch {
    failed = true;
  }

  if (failed) {
    return (
      <main className="pb-16 pt-8">
        <PageHero title="Hráč" />
        <PortalGap title="Profil sa nenačítal" description="Skús to znova o chvíľu." />
      </main>
    );
  }
  if (!profile) {
    return (
      <main className="pb-16 pt-8">
        <PageHero title="Hráč" />
        <PortalGap title="Hráč sa nenašiel" description="Tento profil na serveri nie je." />
      </main>
    );
  }

  const session = await readSession();
  const owner = Boolean(session && profile.googleSub && session.sub === profile.googleSub);
  const path = `/hrac/${profile.serverId}/${profile.uuid}`;

  return (
    <main className="pb-20 pt-8">
      <PageHero
        eyebrow={profile.serverId}
        title={profile.name}
        description={`${profile.points} bodov · tento týždeň ${profile.weeklyPoints}`}
      >
        <Link href="/rebricek" className="btn-secondary">
          Rebríček
        </Link>
      </PageHero>

      {notice ? <p className="section-shell callout">{notice}</p> : null}

      <div className="section-shell grid gap-6 lg:grid-cols-2">
        <section className="surface-strong px-6 py-6 md:px-8">
          <h2 className="font-display text-2xl text-pine-950">Meno</h2>
          <p className="mt-3 text-lg text-moss-50">{profile.name}</p>
          <h2 className="mt-8 font-display text-2xl text-pine-950">Staršie mená</h2>
          {profile.previous.length === 0 ? (
            <p className="mt-3 text-ink-muted">Zatiaľ žiadne staršie meno.</p>
          ) : (
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-mist-muted">
              {profile.previous.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ol>
          )}
          <h2 className="mt-8 font-display text-2xl text-pine-950">Body</h2>
          <p className="mt-3 font-display text-4xl text-lantern">{profile.points}</p>
        </section>

        <section className="surface-strong px-6 py-6 md:px-8">
          <h2 className="font-display text-2xl text-pine-950">O mne</h2>
          {profile.about ? (
            <p className="mt-3 text-mist">{profile.about}</p>
          ) : (
            <p className="mt-3 text-ink-muted">Krátka poznámka zatiaľ nie je.</p>
          )}

          {owner ? (
            <form action={saveAboutAction} className="mt-6 space-y-3">
              <input type="hidden" name="serverId" value={profile.serverId} />
              <input type="hidden" name="uuid" value={profile.uuid} />
              <label className="block text-sm text-mist-muted">
                Poznámka, najviac 280 znakov
                <textarea
                  name="about"
                  maxLength={280}
                  defaultValue={profile.about}
                  rows={4}
                  className="mt-2 w-full bg-[var(--inset-dark)] px-3 py-2 text-moss-50"
                />
              </label>
              <button className="btn-primary" type="submit">
                Uložiť poznámku
              </button>
            </form>
          ) : (
            <ClaimBlock path={path} serverId={profile.serverId} uuid={profile.uuid} signedIn={Boolean(session)} />
          )}

          {session ? (
            <form action="/api/auth/logout" method="post" className="mt-4">
              <input type="hidden" name="next" value={path} />
              <button className="btn-secondary" type="submit">
                Odhlásiť Google
              </button>
            </form>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function ClaimBlock({
  path,
  serverId,
  uuid,
  signedIn,
}: {
  path: string;
  serverId: string;
  uuid: string;
  signedIn: boolean;
}) {
  if (!googleConfigured()) {
    return (
      <p className="mt-6">
        <button className="btn-primary" type="button" disabled>
          Prihlásiť sa cez Google
        </button>
        <span className="mt-3 block text-sm text-ink-muted">Prihlásenie cez Google nie je nastavené.</span>
      </p>
    );
  }
  if (!signedIn) {
    return (
      <p className="mt-6">
        <a className="btn-primary" href={`/api/auth/google?next=${encodeURIComponent(path)}`}>
          Prihlásiť sa cez Google
        </a>
        <span className="mt-3 block text-sm text-ink-muted">
          Profil sa nedá obsadiť menom. V hre napíš /vyprava prepojit a kód zadaj tu.
        </span>
      </p>
    );
  }
  return (
    <form action={claimProfileAction} className="mt-6 space-y-3">
      <p className="text-sm text-ink-muted">Zadaj kód z hry, príkaz /vyprava prepojit. Menom sa profil obsadiť nedá.</p>
      <input type="hidden" name="serverId" value={serverId} />
      <input type="hidden" name="uuid" value={uuid} />
      <label className="block text-sm text-mist-muted">
        Kód
        <input
          name="code"
          required
          autoComplete="one-time-code"
          pattern="[A-Za-z2-9]{8}"
          className="mt-2 w-full bg-[var(--inset-dark)] px-3 py-2 text-moss-50"
        />
      </label>
      <button className="btn-primary" type="submit">
        Prepojiť profil
      </button>
    </form>
  );
}
