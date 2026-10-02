import { Suspense } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getPortalMeta } from "@/lib/portal";

export const dynamic = "force-dynamic";

export default async function HlbinaLayout({ children }: { children: React.ReactNode }) {
  const meta = await getPortalMeta();
  const note = !meta.connected
    ? "databáza nie je pripojená"
    : meta.failed
      ? "výpravu sa nepodarilo načítať"
      : (meta.expedition?.title ?? "žiadna aktívna výprava");

  return (
    <div className="flex min-h-full flex-col">
      <Suspense fallback={<div className="hud" />}>
        <SiteHeader servers={meta.servers} serverId={meta.serverId} note={note} />
      </Suspense>
      <div className="board flex-1">{children}</div>
      <SiteFooter />
    </div>
  );
}
