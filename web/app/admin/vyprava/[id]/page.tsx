import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ExpeditionDesk } from "@/components/admin/desk";
import { adminConfigured, isAdminAuthed } from "@/lib/admin-auth";
import { loadDesk } from "@/lib/admin-store";
import { hasDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ExpeditionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ oznam?: string }>;
}) {
  if (!adminConfigured()) redirect("/admin");
  if (!(await isAdminAuthed())) redirect("/admin");
  if (!hasDatabase()) redirect("/admin");

  const { id } = await params;
  const query = await searchParams;
  let desk: Awaited<ReturnType<typeof loadDesk>>;
  try {
    desk = await loadDesk(id);
  } catch {
    return <p className="admin-error">Výpravu sa nepodarilo načítať.</p>;
  }
  if (!desk) notFound();

  return (
    <div>
      <p>
        <Link className="back-link" href="/admin">
          Všetky servery
        </Link>
      </p>
      <ExpeditionDesk desk={desk} notice={query.oznam} />
    </div>
  );
}
