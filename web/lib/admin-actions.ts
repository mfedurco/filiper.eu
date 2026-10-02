"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  ADMIN_COOKIE,
  adminConfigured,
  isAdminAuthed,
  secretMatches,
  sessionToken,
} from "@/lib/admin-auth";
import { hasDatabase, publicDbError } from "@/lib/db";
import {
  copyExpedition,
  createGeneratedDraft,
  endExpedition,
  removeQuest,
  saveExpeditionMeta,
  saveQuest,
  startExpedition,
} from "@/lib/admin-store";
import { isServerId } from "@/lib/portal";

export type ActionResult = { ok: true; message: string } | { ok: false; message: string };

function fail(error: unknown): ActionResult {
  if (error instanceof Error && error.message && !/select |insert |update |postgres/i.test(error.message)) {
    return { ok: false, message: error.message };
  }
  return { ok: false, message: publicDbError() };
}

async function gate(): Promise<ActionResult | null> {
  if (!adminConfigured()) return { ok: false, message: "Admin je zamknutý." };
  if (!(await isAdminAuthed())) return { ok: false, message: "Najprv zadaj heslo admina." };
  if (!hasDatabase()) return { ok: false, message: "Databáza nie je pripojená." };
  return null;
}

function refresh() {
  revalidatePath("/", "layout");
  revalidatePath("/admin");
}

export async function loginAction(formData: FormData) {
  if (!adminConfigured()) redirect("/admin");
  const password = String(formData.get("password") ?? "");
  if (!secretMatches(password)) redirect("/admin?chyba=1");
  const token = sessionToken();
  if (!token) redirect("/admin");
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  redirect("/admin");
}

export async function logoutAction() {
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  redirect("/admin");
}

export async function generateDraftAction(formData: FormData): Promise<ActionResult> {
  const denied = await gate();
  if (denied) return denied;
  const serverId = String(formData.get("serverId") ?? "").trim();
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
  const denied = await gate();
  if (denied) return denied;
  const sourceId = String(formData.get("expeditionId") ?? "");
  const serverId = String(formData.get("serverId") ?? "").trim();
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
  const denied = await gate();
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
  const denied = await gate();
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
  const denied = await gate();
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
  const denied = await gate();
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

export async function removeQuestAction(formData: FormData): Promise<ActionResult> {
  const denied = await gate();
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
