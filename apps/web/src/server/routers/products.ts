import { z } from "zod";
import { eq } from "drizzle-orm";
import { products } from "@mise/db";
import { householdProcedure, router } from "../trpc";
import { rateLimit } from "../security";

export const productsRouter = router({
  /** Scan de code-barres : catalogue local d'abord, Open Food Facts ensuite (cache + délai). */
  lookupEan: householdProcedure.input(z.object({ ean: z.string().regex(/^\d{8,14}$/) })).query(async ({ ctx, input }) => {
    const [local] = await ctx.db.select().from(products).where(eq(products.ean, input.ean));
    if (local) return { source: "local" as const, name: local.name, ingredientId: local.ingredientId, brand: local.brand, quantity: local.packageQuantity, allergens: [] as string[] };
    await rateLimit(ctx.db, `off:${ctx.householdId}`, 60, 60);
    const off = await ctx.lookupEan(input.ean);
    return off ? { source: "openfoodfacts" as const, ingredientId: null, ...off } : null;
  }),
});
