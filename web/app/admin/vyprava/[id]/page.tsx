import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ExpeditionDesk } from "@/components/admin/desk";
import { loadDesk } from "@/lib/admin-store";
import { allowsServer, requireSpravca } from "@/lib/portal-accounts";

export const dynamic = "force-dynamic";

export default async function ExpeditionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ oznam?: string }>;
}) {
  const account = await requireSpravca();
  if (!account) redirect("/admin");

  const { id } = await params;
  const query = await searchParams;
  let desk: Awaited<ReturnType<typeof loadDesk>>;
  try {
    desk = await loadDesk(id);
  } catch {
    return <p className="admin-error">Výpravu sa nepodarilo načítať.</p>;
  }
  if (!desk || !allowsServer(account, desk.serverId)) notFound();
  desk = {
    ...desk,
    allowNewServer: account.allServers,
    servers: account.allServers ? desk.servers : desk.servers.filter((server) => allowsServer(account, server.id)),
  };

  return (
    <div>
      <nav className="crumbs" aria-label="Cesta">
        <Link href="/admin">Servery</Link>
        <span aria-hidden="true">/</span>
        <Link href={`/admin/server/${desk.serverId}`}>{desk.serverLabel}</Link>
      </nav>
      <ExpeditionDesk desk={desk} notice={query.oznam} />
    </div>
  );
}
