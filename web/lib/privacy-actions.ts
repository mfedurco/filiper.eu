"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dbQuery } from "@/lib/db";
import { readSession } from "@/lib/google-auth";
import { rememberSignedIn } from "@/lib/portal-accounts";
import { requireTrustedMutation } from "@/lib/security";

export type PrivacyRequestType = "export" | "unlink" | "delete";

export async function createPrivacyRequestAction(formData: FormData) {
  await requireTrustedMutation();
  const session = await readSession();
  if (!session) redirect("/api/auth/google?next=/ucet");
  const type = String(formData.get("type") ?? "");
  if (!isRequestType(type)) redirect("/ucet?stav=neplatna");

  await rememberSignedIn(session);
  await dbQuery(
    `insert into privacy_requests (google_sub, request_type)
     values ($1, $2)
     on conflict (google_sub, request_type) where status = 'pending'
     do nothing`,
    [session.sub, type],
  );
  revalidatePath("/ucet");
  redirect("/ucet?stav=prijata");
}

export async function listPrivacyRequests(googleSub: string): Promise<Array<{
  type: PrivacyRequestType;
  status: "pending" | "completed" | "rejected";
  requestedAt: Date;
}>> {
  const rows = await dbQuery<{
    request_type: PrivacyRequestType;
    status: "pending" | "completed" | "rejected";
    requested_at: Date;
  }>(
    `select request_type, status, requested_at
     from privacy_requests
     where google_sub = $1
     order by requested_at desc
     limit 20`,
    [googleSub],
  );
  return rows.map((row) => ({
    type: row.request_type,
    status: row.status,
    requestedAt: row.requested_at,
  }));
}

function isRequestType(value: string): value is PrivacyRequestType {
  return value === "export" || value === "unlink" || value === "delete";
}
