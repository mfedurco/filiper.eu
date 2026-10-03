"use server";

import { redirect } from "next/navigation";
import { readSession } from "@/lib/google-auth";
import { claimProfile, isPlayerUuid, saveProfileAbout } from "@/lib/player-profile";
import { rememberSignedIn } from "@/lib/portal-accounts";
import { isServerId } from "@/lib/portal";
import { sharedRateLimit } from "@/lib/rate-limit";
import { requireTrustedMutation } from "@/lib/security";

export async function claimProfileAction(formData: FormData) {
  await requireTrustedMutation();
  const session = await readSession();
  const serverId = String(formData.get("serverId") ?? "");
  const uuid = String(formData.get("uuid") ?? "");
  const code = String(formData.get("code") ?? "");
  if (!session) redirect(profilePath(serverId, uuid, "prihlasenie"));
  const rate = await sharedRateLimit("profile_claim", session.sub, 10, 15 * 60_000);
  if (!rate.allowed) {
    redirect(profilePath(serverId, uuid, "kod"));
  }
  const linked = await claimProfile(session.sub, serverId, uuid, code);
  if (!linked) {
    redirect(profilePath(serverId, uuid, "kod"));
  }
  try {
    await rememberSignedIn(session);
  } catch {
    // The Minecraft profile is already linked. The account row is created on the next Google visit.
  }
  redirect(profilePath(serverId, uuid, "prepojene"));
}

export async function saveAboutAction(formData: FormData) {
  await requireTrustedMutation();
  const session = await readSession();
  const serverId = String(formData.get("serverId") ?? "");
  const uuid = String(formData.get("uuid") ?? "");
  if (!session || !isServerId(serverId) || !isPlayerUuid(uuid)) {
    redirect(profilePath(serverId, uuid, "prihlasenie"));
  }
  const saved = await saveProfileAbout(session.sub, serverId, uuid, String(formData.get("about") ?? ""));
  redirect(profilePath(serverId, uuid, saved ? "ulozena" : "cudzi"));
}

function profilePath(serverId: string, uuid: string, flag: string) {
  if (!isServerId(serverId) || !isPlayerUuid(uuid)) return "/rebricek";
  return `/hrac/${serverId}/${uuid}?stav=${flag}`;
}
