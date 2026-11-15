import { describe, expect, it } from "vitest";
import { extractRecipeFromHtml, parseDurationMinutes, parseRecipeText, rat } from "../src/index.js";

describe("durées", () => {
  it.each([["PT1H20M", 80], ["PT45M", 45], ["P0DT2H", 120], ["1 h 20", 80], ["45 min", 45], ["30", 30], ["1h", 60], [null, null], ["bientôt", null]])("%s", (t, m) => {
    expect(parseDurationMinutes(t)).toBe(m);
  });
});

const jsonLd = (obj: object) => `<html><head><script type="application/ld+json">${JSON.stringify(obj)}</script></head><body></body></html>`;

describe("import JSON-LD", () => {
  it("lit un Recipe direct", () => {
    const r = extractRecipeFromHtml(
      jsonLd({
        "@context": "https://schema.org", "@type": "Recipe", name: "Quiche &amp; lardons", recipeYield: "6 parts",
        prepTime: "PT20M", cookTime: "PT35M", author: { name: "Mamie" }, image: ["https://x/img.jpg"],
        recipeIngredient: ["200 g de lardons", "3 œufs", "sel, poivre"],
        recipeInstructions: [{ "@type": "HowToStep", text: "Préchauffer le four." }, { "@type": "HowToSection", itemListElement: [{ "@type": "HowToStep", text: "Battre les œufs." }] }],
      }),
      "https://exemple.fr/quiche",
    );
    expect(r).not.toBeNull();
    expect(r!.title).toBe("Quiche & lardons");
    expect(r!.servings).toBe(6);
    expect(r!.prepMinutes).toBe(20);
    expect(r!.cookMinutes).toBe(35);
    expect(r!.ingredients.map((i) => i.name)).toEqual(["lardons", "œufs", "sel", "poivre"]);
    expect(r!.steps).toEqual(["Préchauffer le four.", "Battre les œufs."]);
    expect(r!.sourceName).toBe("Mamie");
    expect(r!.imageUrl).toBe("https://x/img.jpg");
  });
  it("trouve le Recipe dans un @graph et ignore un JSON invalide", () => {
    const html = `<script type="application/ld+json">{oops</script>` + jsonLd({ "@graph": [{ "@type": "WebPage" }, { "@type": ["Recipe"], name: "Crêpes", recipeYield: 4, recipeIngredient: ["250 g de farine"], recipeInstructions: "Mélanger. Laisser reposer." }] });
    const r = extractRecipeFromHtml(html, "https://site.fr/x");
    expect(r!.title).toBe("Crêpes");
    expect(r!.servings).toBe(4);
    expect(r!.ingredients[0]!.quantity).toEqual(rat(250));
    expect(r!.steps).toEqual(["Mélanger.", "Laisser reposer."]);
    expect(r!.sourceName).toBe("site.fr");
  });
  it("repli HTML (microdonnées puis liste après titre)", () => {
    const micro = `<h1>Soupe</h1><li itemprop="recipeIngredient">2 poireaux</li><li itemprop="recipeIngredient">1 l d'eau</li>`;
    expect(extractRecipeFromHtml(micro)!.ingredients).toHaveLength(2);
    const list = `<title>Gratin</title><h2>Ingrédients</h2><ul><li>1 kg de pommes de terre</li><li>50 cl de crème</li></ul><h2>Préparation</h2><ol><li>Éplucher.</li><li>Cuire.</li></ol>`;
    const r = extractRecipeFromHtml(list, "bad url")!;
    expect(r.title).toBe("Gratin");
    expect(r.steps).toEqual(["Éplucher.", "Cuire."]);
    expect(r.sourceName).toBeNull();
    expect(extractRecipeFromHtml("<p>rien</p>")).toBeNull();
  });
});

describe("import texte collé", () => {
  it("sections, portions et durées", () => {
    const r = parseRecipeText(`# Gratin dauphinois
Pour 6 personnes
Préparation : 20 min
Cuisson : 1 h 10
Ingrédients :
- 1,2 kg de pommes de terre
- 50 cl de crème
- 1 gousse d'ail
Préparation
1. Éplucher et trancher.
2) Cuire 1 h.`);
    expect(r.title).toBe("Gratin dauphinois");
    expect(r.servings).toBe(6);
    expect(r.prepMinutes).toBe(20);
    expect(r.cookMinutes).toBe(70);
    expect(r.ingredients).toHaveLength(3);
    expect(r.steps).toEqual(["Éplucher et trancher.", "Cuire 1 h."]);
  });
});
