import { and, eq, inArray } from "drizzle-orm";
import { householdMembers, mealPlans, plannedMeals, recipes } from "@mise/db";
import { addDays } from "@mise/domain";
import { productionDeps, sessionFromCookieHeader } from "@/server/context";

export const dynamic = "force-dynamic";

const HOURS = { breakfast: "080000", lunch: "123000", snack: "163000", dinner: "193000" } as const;
const esc = (s: string) => s.replace(/[\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");

/** Export iCalendar des repas d'une semaine (flux ICS, P2). */
export async function GET(req: Request): Promise<Response> {
  const session = await sessionFromCookieHeader(req.headers.get("cookie"));
  if (!session) return new Response("unauthorized", { status: 401 });
  const week = new URL(req.url).searchParams.get("week") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) return new Response("week attendu (AAAA-MM-JJ)", { status: 400 });
  const d = productionDeps().db;
  const [m] = await d.select({ h: householdMembers.householdId }).from(householdMembers).where(eq(householdMembers.userId, session.user.id)).limit(1);
  if (!m) return new Response("forbidden", { status: 403 });
  const [plan] = await d.select().from(mealPlans).where(and(eq(mealPlans.householdId, m.h), eq(mealPlans.weekStart, week)));
  const meals = plan ? await d.select().from(plannedMeals).where(eq(plannedMeals.mealPlanId, plan.id)) : [];
  const rs = meals.length ? await d.select({ id: recipes.id, title: recipes.title, prep: recipes.prepMinutes, cook: recipes.cookMinutes }).from(recipes).where(inArray(recipes.id, meals.map((x) => x.recipeId))) : [];
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Mise//Planificateur//FR", "CALSCALE:GREGORIAN"];
  for (const meal of meals) {
    const r = rs.find((x) => x.id === meal.recipeId)!;
    const date = addDays(week, meal.day).replace(/-/g, "");
    lines.push("BEGIN:VEVENT", `UID:${meal.id}@mise`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`, `DTSTART:${date}T${HOURS[meal.slot]}`, `DURATION:PT${Math.max(15, r.prep + r.cook)}M`, `SUMMARY:${esc(r.title)}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return new Response(lines.join("\r\n"), { headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": `attachment; filename="repas-${week}.ics"` } });
}
