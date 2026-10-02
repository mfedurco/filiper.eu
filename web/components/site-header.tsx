"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

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

export function SiteHeader({
  servers,
  serverId,
  note,
}: {
  servers: { id: string; label: string }[];
  serverId: string;
  note: string;
}) {
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const router = useRouter();

  function hrefFor(path: string) {
    const params = new URLSearchParams(searchParams.toString());
    const query = params.toString();
    return query ? `${path}?${query}` : path;
  }

  function onServer(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("server", next);
    params.delete("hrac");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <header className="hud">
      <Link href={hrefFor("/")} className="brand">
        <span className="brand-mark">Výprava</span>
        <small>{note}</small>
      </Link>
      <nav className="hud-links" aria-label="Hráč a admin">
        {servers.length > 1 ? (
          <label className="chip">
            Server
            <select
              aria-label="Server"
              value={servers.some((server) => server.id === serverId) ? serverId : servers[0]?.id}
              onChange={(event) => onServer(event.target.value)}
              style={{ background: "transparent", color: "inherit", border: 0, font: "inherit" }}
            >
              {servers.map((server) => (
                <option key={server.id} value={server.id}>
                  {server.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <Link href={hrefFor("/hrac")} className="chip" aria-current={current(pathname, "/hrac") ? "page" : undefined}>
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
            href={hrefFor(slot.href)}
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
