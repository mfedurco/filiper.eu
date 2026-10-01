"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const slots = [
  { href: "/kampan", label: "Kampaň", icon: "/hlbina/icon-campaign.jpg" },
  { href: "/denne", label: "Denné", icon: "/hlbina/icon-daily.jpg" },
  { href: "/tyzdenne", label: "Týždenné", icon: "/hlbina/icon-weekly.jpg" },
  { href: "/dlhodobe", label: "Dlhodobé", icon: "/hlbina/icon-longterm.jpg" },
  { href: "/spolocne", label: "Spoločné", icon: "/hlbina/icon-shared.jpg" },
  { href: "/party", label: "Party", icon: "/hlbina/icon-party.jpg" },
  { href: "/rebricek", label: "Rebríček", icon: "/hlbina/icon-board.jpg" },
];

function current(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader() {
  const pathname = usePathname() ?? "/";

  return (
    <header className="hud">
      <Link href="/" className="brand">
        <span className="brand-mark">Výprava</span>
        <small>triedny survival · domáci server</small>
      </Link>
      <nav className="hud-links" aria-label="Hráč a admin">
        <Link href="/hrac" className="chip" aria-current={current(pathname, "/hrac") ? "page" : undefined}>
          Hráč
        </Link>
        <Link href="/admin" className="chip" aria-current={current(pathname, "/admin") ? "page" : undefined}>
          Admin
        </Link>
      </nav>
      <nav className="hotbar" aria-label="Typy cieľov">
        {slots.map((slot) => (
          <Link
            key={slot.href}
            href={slot.href}
            className="slot"
            aria-current={current(pathname, slot.href) ? "page" : undefined}
          >
            <span className="slot-icon">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={slot.icon} alt="" />
            </span>
            <span className="slot-label">{slot.label}</span>
          </Link>
        ))}
      </nav>
    </header>
  );
}
