"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const slots = [
  { href: "/", label: "Výprava" },
  { href: "/kampan", label: "Kampaň" },
  { href: "/denne", label: "Denné" },
  { href: "/tyzdenne", label: "Týždenné" },
  { href: "/dlhodobe", label: "Dlhodobé" },
  { href: "/spolocne", label: "Spoločné" },
  { href: "/party", label: "Party" },
  { href: "/rebricek", label: "Rebríček" },
  { href: "/hrac", label: "Hráč" },
];

function current(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader({
  servers,
  serverId,
}: {
  servers: { id: string; label: string }[];
  serverId: string;
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
      <div className="hud-inner">
        <a className="brand" href="https://filiper.eu">
          <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="8" fill="#2f6b4a" />
            <path fill="#f4fbf7" d="M8.5 6.5h16v6.2h-9.2v2.4h7.4v5.2h-7.4V25.5h-6.8V6.5z" />
          </svg>
          <span className="brand-word">
            <b>filiper</b>
            <span>.eu</span>
          </span>
        </a>
        <nav className="hud-nav" aria-label="Výprava">
          {servers.length > 1 ? (
            <select
              aria-label="Server"
              value={servers.some((server) => server.id === serverId) ? serverId : servers[0]?.id}
              onChange={(event) => onServer(event.target.value)}
            >
              {servers.map((server) => (
                <option key={server.id} value={server.id}>
                  {server.label}
                </option>
              ))}
            </select>
          ) : null}
          {slots.map((slot) => (
            <Link
              key={slot.href}
              href={hrefFor(slot.href)}
              aria-current={current(pathname, slot.href) ? "page" : undefined}
            >
              {slot.label}
            </Link>
          ))}
          <Link href="/admin" aria-current={current(pathname, "/admin") ? "page" : undefined}>
            Admin
          </Link>
        </nav>
      </div>
    </header>
  );
}
