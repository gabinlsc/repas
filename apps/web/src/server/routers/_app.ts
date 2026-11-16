import { accountRouter } from "./account";
import { authRouter } from "./auth";
import { budgetRouter } from "./budget";
import { householdRouter } from "./household";
import { pantryRouter } from "./pantry";
import { planRouter } from "./plan";
import { productsRouter } from "./products";
import { recipesRouter } from "./recipes";
import { shoppingRouter } from "./shopping";
import { storesRouter } from "./stores";
import { router } from "../trpc";

export const appRouter = router({
  auth: authRouter,
  household: householdRouter,
  recipes: recipesRouter,
  plan: planRouter,
  shopping: shoppingRouter,
  pantry: pantryRouter,
  budget: budgetRouter,
  stores: storesRouter,
  account: accountRouter,
  products: productsRouter,
});

export type AppRouter = typeof appRouter;
