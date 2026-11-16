/**
 * Repère visuel d'une recette (emoji + teinte) déduit de son titre et de ses tags.
 * Règles ordonnées : la première qui correspond l'emporte. Pas de photos (droits,
 * poids) mais une identité cohérente et immédiatement lisible.
 */
const RULES: ReadonlyArray<readonly [RegExp, string, number]> = [
  [/pancake|crêpe|crepe|galette.*sarrasin|gaufre/i, "🥞", 35],
  [/porridge|overnight|muesli|granola|bircher|avoine|chia/i, "🥣", 40],
  [/smoothie/i, "🥤", 330],
  [/brownie|chocolat|cookie|fondant|marbré|mug cake|energy/i, "🍫", 20],
  [/tiramisu|panna/i, "🍮", 30],
  [/tarte aux|crumble|clafoutis|far |galette des rois|tiramisu|panna|moelleux|gâteau|cake au|muffin|banana bread|pain d'épices/i, "🍰", 330],
  [/ananas/i, "🍍", 50],
  [/mangue/i, "🥭", 35],
  [/banan/i, "🍌", 50],
  [/salade de fruits|agrumes|orange|kiwi/i, "🍊", 30],
  [/fraise|framboise|cerise|fruits rouges|rhubarbe/i, "🍓", 350],
  [/prune|poire|pomme|compote/i, "🍐", 80],
  [/yaourt|skyr|fromage blanc/i, "🥛", 210],
  [/œuf|oeuf|omelette|shakshuka|chakchouka|tortilla espagnole|quiche sans/i, "🍳", 45],
  [/tartine|toast|croque|bagel|pain perdu/i, "🥪", 30],
  [/pizza|calzone|flammekueche|pissaladière/i, "🍕", 15],
  [/burger|bao/i, "🍔", 25],
  [/taco|burrito|quesadilla|fajita|enchilada|wrap/i, "🌮", 30],
  [/sushi|donburi|poke|teriyaki/i, "🍣", 5],
  [/ramen|phở|pho|bò bún|soupe thaïe|tom kha|nouilles|pad /i, "🍜", 15],
  [/curry|dahl|dal|masala|tikka|butter chicken|mafé|yassa|tajine|couscous|harira/i, "🍛", 35],
  [/risotto|paella|riz/i, "🍚", 45],
  [/lasagne|spaghetti|penne|pâtes|pasta|gnocchi|tagliatelle|coquillette|carbonara|bolognaise|arrabbiata/i, "🍝", 25],
  [/soupe|velouté|potage|gaspacho|minestrone|pistou|bouillabaisse/i, "🍲", 28],
  [/salade|bowl|taboulé|mezze|houmous/i, "🥗", 110],
  [/saumon|cabillaud|poisson|truite|maquereau|sardine|thon|morue/i, "🐟", 200],
  [/crevette|moule|calamar|fruits de mer/i, "🦐", 10],
  [/poulet|dinde|canard|volaille/i, "🍗", 30],
  [/bœuf|boeuf|steak|hachis|chili|kefta|moussaka|bourguignon|carbonade/i, "🥩", 8],
  [/porc|saucisse|lardon|jambon|chorizo|merguez|choucroute|petit salé|tartiflette|raclette/i, "🥓", 12],
  [/gratin|parmentier|tian/i, "🧀", 42],
  [/lentille|pois chiche|haricot|falafel/i, "🫘", 60],
  [/tofu/i, "🥢", 160],
  [/légume|ratatouille|courgette|aubergine|poivron|chou|brocoli|potiron|courge|patate douce|épinard/i, "🥦", 120],
];

export interface RecipeVisual {
  readonly emoji: string;
  readonly hue: number;
}

export function recipeVisual(title: string, tags: readonly string[] = []): RecipeVisual {
  const text = `${title} ${tags.join(" ")}`;
  for (const [re, emoji, hue] of RULES) if (re.test(text)) return { emoji, hue };
  const h = [...title].reduce((s, c) => (s * 31 + c.charCodeAt(0)) % 360, 7);
  return { emoji: "🍽️", hue: h };
}

export const AISLE_EMOJI: Readonly<Record<string, string>> = {
  fruits_legumes: "🥕", boulangerie: "🥖", boucherie: "🥩", poissonnerie: "🐟", charcuterie_traiteur: "🥓", cremerie: "🧈", fromagerie: "🧀",
  epicerie_salee: "🫒", feculents: "🍝", conserves: "🥫", condiments_epices: "🧂", epicerie_sucree: "🍯", monde: "🌏", surgeles: "🧊", boissons: "🧃",
};
