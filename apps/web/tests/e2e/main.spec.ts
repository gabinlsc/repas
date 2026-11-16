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

  await expect(page).toHaveURL(/onboarding/);
  await page.getByRole("button", { name: "+ Ajouter un membre" }).click();
  const second = page.getByLabel("Prénom").nth(1);
  await second.fill("Léo");
  await page.getByRole("checkbox", { name: "Fruits à coque" }).nth(1).check();
  await page.getByRole("button", { name: /Terminer et générer/ }).click();

  await expect(page).toHaveURL(/semaine/);
  await expect(page.getByTestId("meal-card").first()).toBeVisible({ timeout: 60_000 });
  expect(await page.getByTestId("meal-card").count()).toBe(14);
  await page.getByText("Pourquoi ?").first().click();

  await page.getByRole("button", { name: "Faire la liste de courses" }).click();
  await expect(page).toHaveURL(/courses$/);
  await expect(page.getByText("Total estimé")).toBeVisible();
  const elapsed = Date.now() - started;
  expect(elapsed).toBeLessThan(180_000);

  await page.getByRole("link", { name: "Mode magasin" }).click();
  await expect(page).toHaveURL(/magasin/);
  const boxes = page.locator('input[type="checkbox"]');
  await expect(boxes.first()).toBeVisible();

  // Hors ligne : on coche, rien n'est perdu ; à la reconnexion, la file se vide.
  await context.setOffline(true);
  await boxes.nth(0).check();
  await boxes.nth(1).check();
  await expect(page.getByText(/modification\(s\) en attente/)).toBeVisible();
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByText(/modification\(s\) en attente/)).toHaveCount(0, { timeout: 20_000 });

  await page.goto("/courses");
  await expect(page.locator('input[type="checkbox"]:checked')).toHaveCount(2);
});

test("accessibilité de base : titres, libellés et navigation clavier", async ({ page }) => {
  await page.goto("/connexion");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mise");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Aller au contenu" })).toBeFocused();
  for (const label of ["E-mail", "Mot de passe"]) await expect(page.getByLabel(label)).toBeVisible();
});
