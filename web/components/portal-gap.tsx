import { EmptyState, ErrorState } from "@/components/ui";
import { getPortalMeta } from "@/lib/portal";

export async function PortalGap({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const meta = await getPortalMeta();
  if (meta.failed) {
    return <ErrorState description="Výpravu sa nepodarilo načítať. Skús obnoviť stránku." />;
  }
  if (!meta.connected) {
    return (
      <EmptyState
        title="Databáza nie je pripojená"
        description="Verejné stránky ostanú prázdne, kým server nemá DATABASE_URL."
      />
    );
  }
  if (!meta.expedition) {
    return (
      <EmptyState
        title="Žiadna aktívna výprava"
        description={`Server ${meta.serverId} teraz nemá bežiacu výpravu.`}
      />
    );
  }
  return <EmptyState title={title} description={description} />;
}
