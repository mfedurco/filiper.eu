"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { adminConfigured, secretMatches } from "@/lib/admin-auth";
import { dbQuery, hasDatabase, publicDbError } from "@/lib/db";
import { clearSession, googleConfigured, readSession } from "@/lib/google-auth";
import {
  copyExpedition,
  createGeneratedDraft,
  endExpedition,
  expeditionAccess,
  removeQuest,
  saveExpeditionMeta,
  saveQuest,
  startExpedition,
} from "@/lib/admin-store";
import { isServerId } from "@/lib/portal";
import {
  allowsServer,
  bootstrapSpravca,
  requireSpravca,
  setAccountRole,
  type PortalRole,
} from "@/lib/portal-accounts";
import { ensureServerKeyColumn, generateServerKey, hashServerKey } from "@/lib/server-key";

export type ActionResult = { ok: true; message: string } | { ok: false; message: string };
export type KeyResult = { ok: true; key: string } | { ok: false; message: string };

function fail(error: unknown): ActionResult {
  if (error instanceof Error && error.message && !/select |insert |update |postgres/i.test(error.message)) {
    return { ok: false, message: error.message };
  }
  return { ok: false, message: publicDbError() };
}

async function gateServer(serverId: string): Promise<ActionResult | null> {
  if (!googleConfigured()) return { ok: false, message: "Prihlásenie cez Google nie je nastavené." };
  if (!hasDatabase()) return { ok: false, message: "Databáza nie je pripojená." };
  const account = await requireSpravca();
  if (!account) return { ok: false, message: "Tento Google účet výpravy nespravuje." };
  if (!isServerId(serverId) || !allowsServer(account, serverId)) {
    return { ok: false, message: "Tento server nespravuješ." };
  }
  return null;
}

async function gateExpedition(id: string): Promise<ActionResult | null> {
  const access = await expeditionAccess(id);
  if (!access) return { ok: false, message: "Výprava sa nenašla." };
  return gateServer(access.serverId);
}

function refresh() {
  revalidatePath("/", "layout");
  revalidatePath("/admin");
}

export async function bootstrapAction(formData: FormData) {
  const session = await readSession();
  if (!session || !adminConfigured()) redirect("/admin");
  const password = String(formData.get("secret") ?? "");
  if (!secretMatches(password)) redirect("/admin?chyba=1");
  try {
    await bootstrapSpravca(session);
  } catch {
    redirect("/admin?chyba=1");
  }
  redirect("/admin");
}

export async function setRoleAction(formData: FormData) {
  const actor = await requireSpravca();
  if (!actor?.allServers) redirect("/admin");
  const role = String(formData.get("role") ?? "");
  if (role !== "hrac" && role !== "spravca") redirect("/admin?oznam=Rola%20nie%20je%20v%20poriadku.");
  const serverIds = String(formData.get("serverIds") ?? "")
    .split(/[\s,]+/)
    .map((id) => id.trim())
    .filter(Boolean);
  try {
    await setAccountRole({
      actorSub: actor.googleSub,
      targetSub: String(formData.get("targetSub") ?? ""),
      role: role as PortalRole,
      allServers: formData.get("allServers") === "on",
      serverIds,
    });
  } catch (error) {
    const result = fail(error);
    redirect(`/admin?oznam=${encodeURIComponent(result.ok ? "Rolu sa nepodarilo uložiť." : result.message)}`);
  }
  refresh();
  redirect("/admin?oznam=Rola%20je%20ulo%C5%BEen%C3%A1.");
}

export async function logoutAction() {
  await clearSession();
  redirect("/admin");
}

export async function generateDraftAction(formData: FormData): Promise<ActionResult> {
  const serverId = String(formData.get("serverId") ?? "").trim();
  const denied = await gateServer(serverId);
  if (denied) return denied;
  if (!isServerId(serverId)) {
    return { ok: false, message: "Vyber server, alebo napíš nový názov z písmen a čísiel." };
  }
  let id: string;
  try {
    id = await createGeneratedDraft(serverId);
  } catch (error) {
    return fail(error);
  }
  refresh();
  redirect(`/admin/vyprava/${id}`);
}

export async function copyDraftAction(formData: FormData): Promise<ActionResult> {
  const sourceId = String(formData.get("expeditionId") ?? "");
  const serverId = String(formData.get("serverId") ?? "").trim();
  const deniedSource = await gateExpedition(sourceId);
  if (deniedSource) return deniedSource;
  const deniedTarget = await gateServer(serverId);
  if (deniedTarget) return deniedTarget;
  const title = String(formData.get("title") ?? "");
  if (!isServerId(serverId)) {
    return { ok: false, message: "Cieľový server potrebuje názov z písmen a čísiel." };
  }
  let copy: { id: string; note: string };
  try {
    copy = await copyExpedition(sourceId, serverId, title);
  } catch (error) {
    return fail(error);
  }
  refresh();
  redirect(`/admin/vyprava/${copy.id}?oznam=${encodeURIComponent(copy.note)}`);
}

export async function saveMetaAction(formData: FormData): Promise<ActionResult> {
  const denied = await gateExpedition(String(formData.get("expeditionId") ?? ""));
  if (denied) return denied;
  try {
    await saveExpeditionMeta({
      id: String(formData.get("expeditionId") ?? ""),
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
      startsAt: String(formData.get("startsAt") ?? ""),
      endsAt: String(formData.get("endsAt") ?? ""),
    });
    refresh();
    return { ok: true, message: "Termín a názov sú uložené." };
  } catch (error) {
    return fail(error);
  }
}

export async function startAction(formData: FormData): Promise<ActionResult> {
  const denied = await gateExpedition(String(formData.get("expeditionId") ?? ""));
  if (denied) return denied;
  try {
    await startExpedition(String(formData.get("expeditionId") ?? ""));
    refresh();
    return { ok: true, message: "Výprava beží. Predchádzajúca aktívna na tomto serveri skončila." };
  } catch (error) {
    return fail(error);
  }
}

export async function endAction(formData: FormData): Promise<ActionResult> {
  const denied = await gateExpedition(String(formData.get("expeditionId") ?? ""));
  if (denied) return denied;
  try {
    await endExpedition(String(formData.get("expeditionId") ?? ""));
    refresh();
    return { ok: true, message: "Výprava je ukončená." };
  } catch (error) {
    return fail(error);
  }
}

export async function saveQuestAction(formData: FormData): Promise<ActionResult> {
  const denied = await gateExpedition(String(formData.get("expeditionId") ?? ""));
  if (denied) return denied;
  const expeditionId = String(formData.get("expeditionId") ?? "");
  const questId = String(formData.get("questId") ?? "").trim();
  try {
    await saveQuest(expeditionId, questId || null, formData);
    refresh();
    return { ok: true, message: questId ? "Úloha je upravená." : "Úloha je pridaná." };
  } catch (error) {
    return fail(error);
  }
}

export async function rotateServerKeyAction(formData: FormData): Promise<KeyResult> {
  const denied = await gateServer(String(formData.get("serverId") ?? "").trim());
  if (denied) return { ok: false, message: denied.message };
  const serverId = String(formData.get("serverId") ?? "").trim();
  if (!isServerId(serverId)) {
    return { ok: false, message: "Server nie je platný." };
  }
  const key = generateServerKey();
  const hash = hashServerKey(key);
  try {
    await ensureServerKeyColumn();
    const rows = await dbQuery<{ id: string }>(
      "update servers set key_hash = $2 where id = $1 returning id",
      [serverId, hash],
    );
    if (rows.length === 0) return { ok: false, message: "Server sa nenašiel." };
  } catch (error) {
    const result = fail(error);
    return { ok: false, message: result.ok ? "Kľúč sa nepodarilo uložiť." : result.message };
  }
  refresh();
  return { ok: true, key };
}

export async function removeQuestAction(formData: FormData): Promise<ActionResult> {
  const denied = await gateExpedition(String(formData.get("expeditionId") ?? ""));
  if (denied) return denied;
  try {
    await removeQuest(
      String(formData.get("expeditionId") ?? ""),
      String(formData.get("questId") ?? ""),
    );
    refresh();
    return { ok: true, message: "Úloha je preč." };
  } catch (error) {
    return fail(error);
  }
}
