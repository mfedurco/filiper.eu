import type { Metadata } from "next";
import { PageHero } from "@/components/ui";

export const metadata: Metadata = { title: "Uchovávanie údajov" };

export default function RetentionPage() {
  return (
    <main className="pb-20 pt-8">
      <PageHero
        title="Ako dlho údaje uchovávame"
        description="Lehoty obmedzujú zbytočné držanie údajov. Prevádzkovateľ ich musí pred verejným spustením potvrdiť."
      />
      <article className="section-shell surface-strong space-y-6 px-6 py-7 md:px-10">
        <p><strong>DOPLNIŤ A SCHVÁLIŤ MIROSLAVOM PRED SPUSTENÍM:</strong> vlastník procesu, kontaktný e-mail a prípadné zákonné výnimky.</p>
        <Retention name="Jednorazové claim kódy" value="15 minút; hash odstráni denná úloha po uplynutí." />
        <Retention name="Limity požiadaviek" value="Najviac dvojnásobok okna limitu (typicky 2 až 30 minút); ukladajú iba HMAC identifikátor." />
        <Retention name="Nevybavené žiadosti o údaje" value="Do vybavenia. Vybavené alebo zamietnuté záznamy sa odstránia po 365 dňoch." />
        <Retention name="Prevádzkové logy" value="Navrhované maximum 30 dní vo Verceli/Cloudflare; potvrdiť nastavenie plánu a exportov." />
        <Retention name="Aktívny účet a prepojený profil" value="Počas používania a potom najviac 12 mesiacov bez aktivity, ak nie je potrebná kratšia lehota alebo otvorená žiadosť." />
        <Retention name="Ukončené výpravy a herný postup" value="Navrhované maximum 12 mesiacov po skončení výpravy; anonymizované súhrny môžu zostať dlhšie." />
        <Retention name="Zálohy" value="Podľa schváleného plánu záloh; vymazanie sa premietne pri rotácii záloh. Presnú lehotu treba doplniť." />
        <p>Automatická denná úloha čistí iba expirované claim hashe, rate-limit buckety a staré vybavené žiadosti. Mazanie účtov a herných dát je manuálne kontrolované, aby sa nevymazal nesprávny profil alebo spoločné výsledky.</p>
      </article>
    </main>
  );
}

function Retention({ name, value }: { name: string; value: string }) {
  return <section><h2 className="font-display text-xl text-pine-950">{name}</h2><p className="mt-1 text-ink-muted">{value}</p></section>;
}
