import { describe, expect, it } from "vitest";
import { CiqualFormatError, parseCiqualCsv, parseCiqualValue } from "../src/import/ciqual.js";

const HEADER = "alim_grp_code;alim_code;alim_nom_fr;Energie, Règlement UE N° 1169/2011 (kcal/100 g);Protéines, N x facteur de Jones (g/100 g);Glucides (g/100 g);Lipides (g/100 g);Sucres (g/100 g);Fibres alimentaires (g/100 g);Sel chlorure de sodium (g/100 g)";

describe("import Ciqual", () => {
  it("lit l'export CSV officiel", () => {
    const rows = parseCiqualCsv(`﻿${HEADER}\n02;20034;"Oignon, cru";40;1,25;6,4;< 0,5;4,24;1,7;traces\n02;20009;Carotte, crue;36;-;7,6;0,26;5;2,7;0,08\n`);
    expect(rows).toEqual([
      { code: "20034", name: "Oignon, cru", nutrition: { kcal: "40", protein: "1.25", carbs: "6.4", fat: "0.5", fiber: "1.7", sugar: "4.24", salt: "0" } },
      { code: "20009", name: "Carotte, crue", nutrition: { kcal: "36", protein: "0", carbs: "7.6", fat: "0.26", fiber: "2.7", sugar: "5", salt: "0.08" } },
    ]);
  });
  it("valeurs particulières", () => {
    expect(parseCiqualValue("traces")).toBe("0");
    expect(parseCiqualValue(undefined)).toBe("0");
    expect(parseCiqualValue("n.d.")).toBe("0");
  });
  it("refuse un format inattendu", () => {
    expect(() => parseCiqualCsv("")).toThrow(CiqualFormatError);
    expect(() => parseCiqualCsv("a;b\n1;2")).toThrow(/alim_code/);
    expect(() => parseCiqualCsv("alim_code;alim_nom_fr\n1;2")).toThrow(/nutritionnelle/);
  });
});
