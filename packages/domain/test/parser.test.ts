import { describe, expect, it } from "vitest";
import { parseIngredientLine, rat, splitCompoundLine } from "../src/index.js";

const p = parseIngredientLine;

describe("parseIngredientLine", () => {
  it.each([
    ["200 g de farine", rat(200), "g", "farine"],
    ["1,5 kg de pommes de terre", rat(3, 2), "kg", "pommes de terre"],
    ["2 oignons", rat(2), "piece", "oignons"],
    ["1 c. à soupe d'huile d'olive", rat(1), "cs", "huile d'olive"],
    ["2 cuillères à café de cumin", rat(2), "cc", "cumin"],
    ["1/2 citron", rat(1, 2), "piece", "citron"],
    ["½ citron", rat(1, 2), "piece", "citron"],
    ["10 cl de crème liquide", rat(10), "cl", "crème liquide"],
    ["3 gousses d'ail", rat(3), "gousse", "ail"],
    ["2 à 3 carottes", rat(3), "piece", "carottes"],
    ["un oignon", rat(1), "piece", "oignon"],
    ["deux et demi kg de patates", rat(5, 2), "kg", "patates"],
    ["1 boîte de tomates pelées (400 g)", rat(1), "boite", "tomates pelées"],
    ["4 œufs", rat(4), "piece", "œufs"],
    ["1 l de lait", rat(1), "l", "lait"],
    ["25 cl d’eau", rat(25), "cl", "eau"],
    ["1 tasse de riz", rat(1), "tasse", "riz"],
    ["2 pavés de saumon", rat(2), "pave", "saumon"],
    ["1 demi-baguette", rat(1, 2), "piece", "baguette"],
    ["1 1/2 verre de lait", rat(3, 2), "verre", "lait"],
    ["- 300 gr de lardons", rat(300), "g", "lardons"],
  ])("« %s »", (line, q, unit, name) => {
    const r = p(line);
    expect(r.quantity).toEqual(q);
    expect(r.unit).toBe(unit);
    expect(r.name).toBe(name);
    expect(r.fuzzy).toBe(false);
  });

  it("note entre parenthèses et après virgule", () => {
    const r = p("2 oignons, émincés finement");
    expect(r.name).toBe("oignons");
    expect(r.note).toBe("émincés finement");
    expect(p("1 boîte de tomates (400 g)").note).toBe("400 g");
  });
  it("optionnel", () => {
    expect(p("50 g de parmesan (facultatif)").optional).toBe(true);
    expect(p("50 g de noix, facultatif").optional).toBe(true);
  });
  it("unités floues", () => {
    expect(p("une pincée de sel")).toMatchObject({ fuzzy: true, unit: "pincee", name: "sel", quantity: null });
    expect(p("sel")).toMatchObject({ fuzzy: true, unit: "gout", quantity: null });
    expect(p("poivre à votre goût")).toMatchObject({ fuzzy: true, name: "poivre" });
    expect(p("un filet d'huile d'olive")).toMatchObject({ fuzzy: true, unit: "filet" });
    expect(p("quelques feuilles de basilic").fuzzy).toBe(true);
  });
  it("unité sans quantité → 1", () => {
    expect(p("botte de radis")).toMatchObject({ quantity: rat(1), unit: "botte" });
  });
  it("ne confond pas un nom commençant comme une unité", () => {
    expect(p("2 gros lardons").unit).toBe("piece");
    expect(p("200 g lentilles").name).toBe("lentilles");
  });
  it("découpe « sel, poivre » mais pas « 2 oignons, émincés »", () => {
    expect(splitCompoundLine("sel, poivre")).toEqual(["sel", "poivre"]);
    expect(splitCompoundLine("sel et poivre")).toEqual(["sel", "poivre"]);
    expect(splitCompoundLine("2 oignons, émincés")).toEqual(["2 oignons, émincés"]);
  });
});
