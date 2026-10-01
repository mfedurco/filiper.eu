import { cookies } from "next/headers";
import type { Metadata } from "next";
import { AdminApp } from "@/components/admin-app";
import {
  getAdminPassword,
  getAdminSettings,
  getCampaign,
  getDailyPool,
  getPartyPool,
} from "@/lib/data";
import { COOKIE } from "@/lib/admin-auth";
import type {
  AdminSettings,
  Campaign,
  QuestPool,
} from "@/lib/types";

export const metadata: Metadata = {
  title: "Admin",
};

export const dynamic = "force-dynamic";

type Bundle = {
  campaign: Campaign;
  daily: QuestPool;
  party: QuestPool;
  settings: AdminSettings;
};

export default async function AdminPage() {
  const jar = await cookies();
  const authed = jar.get(COOKIE)?.value === getAdminPassword();

  let bundle: Bundle | null = null;
  let error: string | null = null;

  if (authed) {
    const results = await Promise.allSettled([
      getCampaign(),
      getDailyPool(),
      getPartyPool(),
      getAdminSettings(),
    ]);

    if (results.every((r) => r.status === "fulfilled")) {
      const [campaign, daily, party, settings] = results.map(
        (r) => (r as PromiseFulfilledResult<unknown>).value,
      ) as [Campaign, QuestPool, QuestPool, AdminSettings];
      bundle = { campaign, daily, party, settings };
    } else {
      error = "Nepodarilo sa načítať admin dáta.";
    }
  }

  return (
    <main>
      <AdminApp
        initialAuthed={authed}
        initialBundle={bundle}
        initialError={error}
      />
    </main>
  );
}
