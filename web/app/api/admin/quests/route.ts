import { NextRequest, NextResponse } from "next/server";
import {
  getAdminSettings,
  getCampaign,
  getDailyPool,
  getLongTermPool,
  getPartyPool,
  getSharedGoals,
  getWeeklyPool,
  writeQuestData,
} from "@/lib/data";
import { requireAdmin } from "@/lib/admin-auth";
import type { AdminSettings, Campaign, QuestPool, SharedGoal } from "@/lib/types";

export async function GET(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  const [campaign, daily, weekly, longterm, party, shared, settings] = await Promise.all([
    getCampaign(),
    getDailyPool(),
    getWeeklyPool(),
    getLongTermPool(),
    getPartyPool(),
    getSharedGoals(),
    getAdminSettings(),
  ]);

  return NextResponse.json({
    campaign,
    daily,
    weekly,
    longterm,
    party,
    shared,
    settings,
  });
}

export async function PUT(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  let body: {
    campaign?: Campaign;
    daily?: QuestPool;
    weekly?: QuestPool;
    longterm?: QuestPool;
    party?: QuestPool;
    shared?: SharedGoal[];
    settings?: AdminSettings;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Neplatné JSON." }, { status: 400 });
  }

  try {
    if (body.campaign) await writeQuestData("campaign", body.campaign);
    if (body.daily) await writeQuestData("daily", body.daily);
    if (body.weekly) await writeQuestData("weekly", body.weekly);
    if (body.longterm) await writeQuestData("longterm", body.longterm);
    if (body.party) await writeQuestData("party", body.party);
    if (body.shared) await writeQuestData("shared", body.shared);
    if (body.settings) await writeQuestData("settings", body.settings);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Uloženie zlyhalo.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    note: "Uložené lokálne (a do Supabase settings ak je service role).",
  });
}
