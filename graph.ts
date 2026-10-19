// ดึงข้อมูลจาก SharePoint List ผ่าน Microsoft Graph (client credentials)
// ต้องมี app registration ที่ได้สิทธิ์ Sites.Selected บน site นี้

let tokenCache: { token: string; exp: number } | null = null;

export function graphConfigured() {
  return Boolean(
    process.env.MS_TENANT_ID && process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET &&
      process.env.SP_SITE && process.env.SP_DIV_LIST,
  );
}

async function token(): Promise<string> {
  if (tokenCache && tokenCache.exp > Date.now() + 60_000) return tokenCache.token;
  const res = await fetch(
    `https://login.microsoftonline.com/${process.env.MS_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: process.env.MS_CLIENT_ID!,
        client_secret: process.env.MS_CLIENT_SECRET!,
        scope: "https://graph.microsoft.com/.default",
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!res.ok) throw new Error(`ขอ token ไม่สำเร็จ (${res.status})`);
  const j = await res.json();
  tokenCache = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return tokenCache.token;
}

async function gget(url: string) {
  const res = await fetch(url.startsWith("http") ? url : `https://graph.microsoft.com/v1.0${url}`, {
    headers: { Authorization: `Bearer ${await token()}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Graph ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

let listPathCache: string | null = null;

async function listPath() {
  if (listPathCache) return listPathCache;
  // SP_SITE เช่น centralgroup.sharepoint.com:/sites/CDSBangnaWarehouse
  const site = await gget(`/sites/${process.env.SP_SITE}`);
  const lists = await gget(
    `/sites/${site.id}/lists?$filter=displayName eq '${process.env.SP_DIV_LIST!.replace(/'/g, "''")}'`,
  );
  if (!lists.value?.length) throw new Error(`ไม่พบ list ชื่อ ${process.env.SP_DIV_LIST}`);
  listPathCache = `/sites/${site.id}/lists/${lists.value[0].id}`;
  return listPathCache;
}

/** ดึงเฉพาะแถวที่เปลี่ยนตั้งแต่ deltaLink ครั้งก่อน (ครั้งแรกได้ทั้งหมด) */
export async function fetchListDelta(deltaLink: string | null) {
  let url = deltaLink ?? `${await listPath()}/items/delta?$expand=fields&$top=500`;
  const items: Record<string, any>[] = [];
  let nextDelta: string | null = null;
  for (let page = 0; page < 50; page++) {
    const j = await gget(url);
    for (const it of j.value ?? []) if (!it.deleted && it.fields) items.push(it.fields);
    if (j["@odata.nextLink"]) url = j["@odata.nextLink"];
    else {
      nextDelta = j["@odata.deltaLink"] ?? null;
      break;
    }
  }
  return { items, deltaLink: nextDelta };
}
