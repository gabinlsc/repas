import { expect, test } from "@playwright/test";

/**
 * Parcours principal (critère d'acceptation) : inscription → foyer → plan hebdo →
 * liste de courses → mode magasin hors ligne → resynchronisation. < 3 minutes.
 */
test("un nouvel utilisateur obtient sa semaine et sa liste, utilisable hors ligne", async ({ page, context }, info) => {
  const started = Date.now();
  const email = `e2e-${info.project.name}-${Date.now()}@test.fr`;

  await page.goto("/inscription");
  await page.getByLabel("Prénom").fill("Camille");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe").fill("motdepasse-e2e-123");
  await page.getByRole("button", { name: "Créer un compte" }).click();

  // Onboarding en 4 étapes
  await expect(page).toHaveURL(/onboarding/);
  await page.getByRole("button", { name: "Ajouter un membre" }).click();
  await page.getByLabel("Prénom").nth(1).fill("Léo");
  await page.getByRole("button", { name: /Régime et allergies/ }).nth(1).click();
  await page.getByRole("button", { name: "Fruits à coque" }).click();
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByRole("heading", { name: "Quels repas ?" })).toBeVisible();
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByRole("heading", { name: "Quel budget ?" })).toBeVisible();
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByRole("button", { name: "Créer ma semaine" }).click();

  await expect(page).toHaveURL(/semaine/);
  await expect(page.getByTestId("meal-card").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("meal-card")).toHaveCount(14);
  // Variété : aucune recette répétée pour le déjeuner et le dîner
  const titles = await page.getByTestId("meal-card").locator("a.font-semibold").allTextContents();
  expect(new Set(titles).size).toBe(14);

  await page.getByRole("button", { name: "Courses", exact: true }).click();
  await expect(page).toHaveURL(/courses$/);
  await expect(page.getByText("Total estimé")).toBeVisible();
  expect(Date.now() - started).toBeLessThan(180_000);

  await page.getByRole("link", { name: "Mode magasin" }).click();
  await expect(page).toHaveURL(/magasin/);
  const items = page.locator('label[for^="b-"]');
  await expect(items.first()).toBeVisible();

  // Hors ligne : on coche, rien n'est perdu ; à la reconnexion, la file se vide.
  await context.setOffline(true);
  await items.nth(0).click();
  await items.nth(1).click();
  await expect(page.getByText(/modification\(s\) en attente/)).toBeVisible();
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByText(/modification\(s\) en attente/)).toHaveCount(0, { timeout: 20_000 });

  await page.goto("/courses");
  await expect(page.locator('input[type="checkbox"]:checked')).toHaveCount(2);
});

test("une nouvelle proposition change la semaine", async ({ page }, info) => {
  await page.goto("/inscription");
  await page.getByLabel("Prénom").fill("Sam");
  await page.getByLabel("E-mail").fill(`e2e-regen-${info.project.name}-${Date.now()}@test.fr`);
  await page.getByLabel("Mot de passe").fill("motdepasse-e2e-123");
  await page.getByRole("button", { name: "Créer un compte" }).click();
  await expect(page).toHaveURL(/onboarding/);
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByRole("button", { name: "Créer ma semaine" }).click();
  await expect(page.getByTestId("meal-card")).toHaveCount(14, { timeout: 60_000 });
  const before = await page.getByTestId("meal-card").locator("a.font-semibold").allTextContents();
  await page.getByRole("button", { name: "Nouvelle proposition" }).click();
  await expect.poll(async () => (await page.getByTestId("meal-card").locator("a.font-semibold").allTextContents()).join("|"), { timeout: 60_000 }).not.toBe(before.join("|"));
  const after = await page.getByTestId("meal-card").locator("a.font-semibold").allTextContents();
  // La nouvelle semaine diffère nettement de la précédente (pénalité d'historique).
  expect(after.filter((t) => before.includes(t)).length).toBeLessThan(7);
});

test("accessibilité de base : titres, libellés et navigation clavier", async ({ page }) => {
  await page.goto("/connexion");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Bon retour");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Aller au contenu" })).toBeFocused();
  for (const label of ["E-mail", "Mot de passe"]) await expect(page.getByLabel(label)).toBeVisible();
});
