import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/ui";

export const metadata: Metadata = { title: "Súkromie" };

export default function PrivacyPage() {
  return (
    <main className="pb-20 pt-8">
      <PageHero
        title="Ako chránime tvoje údaje"
        description="Výprava je herná služba aj pre deti. Zbierame iba údaje potrebné na prihlásenie, prepojenie Minecraft profilu, postup v hre a bezpečnú prevádzku."
      />
      <article className="section-shell surface-strong space-y-7 px-6 py-7 md:px-10">
        <Section title="Kto je prevádzkovateľ">
          <p><strong>DOPLNIŤ MIROSLAVOM PRED SPUSTENÍM:</strong> meno alebo názov prevádzkovateľa, poštová adresa, krajina a kontaktný e-mail pre súkromie.</p>
          <p>Kontakt pri bezpečnostnom incidente: <strong>DOPLNIŤ MIROSLAVOM PRED SPUSTENÍM.</strong></p>
        </Section>
        <Section title="Čo a prečo spracúvame">
          <ul className="list-disc space-y-2 pl-5">
            <li>Google identifikátor, e-mail a zobrazované meno: prihlásenie, správa účtu a oprávnení.</li>
            <li>Minecraft UUID, aktuálne a staršie meno, jazyk a voliteľný text profilu: prepojenie hráča a zobrazenie profilu.</li>
            <li>Herný postup, body, úlohy, party a príspevky: fungovanie Výpravy a rebríčkov.</li>
            <li>Hash jednorazového kódu a HMAC sieťového identifikátora: bezpečné prepojenie a ochrana pred zneužitím. Surovú IP adresu do limitov neukladáme.</li>
            <li>Prevádzkové udalosti bez mien, e-mailov, UUID, kódov a kľúčov: odhaľovanie chýb a incidentov.</li>
          </ul>
          <p>Právny základ a prípadný súhlas zákonného zástupcu závisí od spôsobu prevádzky. <strong>DOPLNIŤ MIROSLAVOM PRED SPUSTENÍM</strong> podľa krajiny a pravidiel servera.</p>
        </Section>
        <Section title="Kto údaje spracúva">
          <p>Google (prihlásenie), Vercel (web a logy), Neon (databáza) a Cloudflare (DNS/proxy, ak je zapnuté). Minecraft/Paper server spracúva herné údaje. Ich umiestnenie, zmluvy a prenosy mimo EHP musí prevádzkovateľ pred spustením skontrolovať.</p>
        </Section>
        <Section title="Viditeľnosť">
          <p>Verejnosť môže vidieť Minecraft meno, UUID v adrese profilu, body, postup a text profilu. Google identifikátor a e-mail nie sú verejné; e-mail vidia iba oprávnení správcovia účtov.</p>
        </Section>
        <Section title="Tvoje možnosti">
          <p>Môžeš požiadať o prístup/kópiu, opravu, odpojenie Google účtu alebo vymazanie. Použi stránku <Link className="underline" href="/ucet">Môj účet a údaje</Link>. Ak sa nevieš prihlásiť, použi kontakt prevádzkovateľa uvedený vyššie.</p>
          <p>Pri detskom účte môže žiadosť podať zákonný zástupca. Automatické mazanie sa nespustí iba kliknutím; správca najprv overí rozsah a zachová údaje, ktoré musí oprávnene ponechať.</p>
        </Section>
        <Section title="Uchovávanie a sťažnosť">
          <p>Lehoty sú na stránke <Link className="underline" href="/uchovavanie">Uchovávanie údajov</Link>. Môžeš sa obrátiť aj na príslušný dozorný orgán ochrany osobných údajov.</p>
        </Section>
      </article>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-2"><h2 className="font-display text-2xl text-pine-950">{title}</h2>{children}</section>;
}
