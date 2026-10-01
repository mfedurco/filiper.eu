import { NextRequest, NextResponse } from "next/server";
import {
  getAdminSettings,
  getCampaign,
  getDailyPool,
  getPartyPool,
  writeQuestData,
} from "@/lib/data";
import { requireAdmin } from "@/lib/admin-auth";
import type { AdminSettings, Campaign, QuestPool } from "@/lib/types";

export async function GET(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  const [campaign, daily, party, settings] = await Promise.all([
    getCampaign(),
    getDailyPool(),
    getPartyPool(),
    getAdminSettings(),
  ]);

  return NextResponse.json({ campaign, daily, party, settings });
}

export async function PUT(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  let body: {
    campaign?: Campaign;
    daily?: QuestPool;
    party?: QuestPool;
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
    if (body.party) await writeQuestData("party", body.party);
    if (body.settings) await writeQuestData("settings", body.settings);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Uloženie zlyhalo.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    note: "Uložené do web/data/quests/. Paper plugin môže tieto JSON súbory synchronizovať / konvertovať späť do YAML.",
  });
}
