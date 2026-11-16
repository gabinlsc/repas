/** i18n typée : le français fait référence, l'anglais doit couvrir les mêmes clés. */
export const fr = {
  "app.name": "Mise",
  "app.tagline": "Dis-moi ton budget et tes contraintes, je te donne la semaine, la liste, et zéro gaspillage.",
  "nav.week": "Semaine",
  "nav.recipes": "Recettes",
  "nav.shopping": "Courses",
  "nav.pantry": "Stock",
  "nav.budget": "Budget",
  "nav.settings": "Réglages",
  "auth.login": "Se connecter",
  "auth.register": "Créer un compte",
  "auth.email": "E-mail",
  "auth.password": "Mot de passe",
  "auth.name": "Prénom",
  "auth.noAccount": "Pas encore de compte ?",
  "auth.hasAccount": "Déjà un compte ?",
  "auth.logout": "Se déconnecter",
  "common.save": "Enregistrer",
  "common.cancel": "Annuler",
  "common.undo": "Annuler",
  "common.retry": "Réessayer",
  "common.loading": "Chargement…",
  "common.error": "Une erreur est survenue",
  "common.offline": "Hors ligne — vos modifications seront synchronisées.",
  "common.delete": "Supprimer",
  "common.add": "Ajouter",
  "days.0": "Lundi", "days.1": "Mardi", "days.2": "Mercredi", "days.3": "Jeudi", "days.4": "Vendredi", "days.5": "Samedi", "days.6": "Dimanche",
  "slot.breakfast": "Petit-déj", "slot.lunch": "Déjeuner", "slot.dinner": "Dîner", "slot.snack": "Collation",
  "week.title": "Ma semaine",
  "week.generate": "Générer la semaine",
  "week.regenerate": "Regénérer (hors repas verrouillés)",
  "week.generating": "Calcul du meilleur plan…",
  "week.empty": "Aucun repas planifié pour cette semaine.",
  "week.shopping": "Faire la liste de courses",
  "week.lock": "Verrouiller",
  "week.unlock": "Déverrouiller",
  "week.swap": "Autre idée",
  "week.cooked": "Cuisiné",
  "week.why": "Pourquoi ?",
  "week.leftover": "Restes",
  "week.batch": "Cuisiner double",
  "week.cost": "Coût estimé",
  "week.nutrition": "Score nutrition",
  "week.prev": "Semaine précédente",
  "week.next": "Semaine suivante",
  "shopping.title": "Liste de courses",
  "shopping.store": "Mode magasin",
  "shopping.toCheck": "Basiques à vérifier",
  "shopping.total": "Total estimé",
  "shopping.partial": "(certains prix inconnus)",
  "shopping.surplus": "Surplus qui ira au stock",
  "shopping.close": "Terminer les courses",
  "shopping.addExtra": "Ajouter un article",
  "shopping.export": "Exporter (Markdown)",
  "shopping.print": "Imprimer",
  "shopping.empty": "Pas encore de liste : générez d'abord la semaine.",
  "shopping.price": "Prix payé (€)",
  "pantry.title": "Stock",
  "pantry.add": "Ajout rapide",
  "pantry.empty": "Votre stock est vide.",
  "pantry.removed": "Article retiré du stock",
  "budget.title": "Budget",
  "settings.title": "Réglages",
  "settings.weights": "Priorités de l'optimisation",
  "settings.export": "Exporter mes données",
  "settings.delete": "Supprimer mon compte",
  "onboarding.title": "Bienvenue ! Configurons votre foyer",
  "onboarding.finish": "Terminer et générer ma semaine",
  "recipes.title": "Recettes",
  "recipes.import": "Importer une recette",
  "recipes.search": "Rechercher…",
  "nutrition.lowEnergy": "Apport énergétique bas", "nutrition.highEnergy": "Apport énergétique élevé", "nutrition.lowFiber": "Peu de fibres",
  "nutrition.lowProtein": "Peu de protéines", "nutrition.lowVegetableDiversity": "Peu de variété de légumes",
} as const;

export type MessageKey = keyof typeof fr;

export const en: Record<MessageKey, string> = {
  ...fr,
  "app.tagline": "Tell me your budget and constraints; I'll give you the week, the list, and zero waste.",
  "nav.week": "Week", "nav.recipes": "Recipes", "nav.shopping": "Shopping", "nav.pantry": "Pantry", "nav.budget": "Budget", "nav.settings": "Settings",
  "auth.login": "Log in", "auth.register": "Sign up", "auth.email": "Email", "auth.password": "Password", "auth.name": "First name",
  "auth.noAccount": "No account yet?", "auth.hasAccount": "Already have an account?", "auth.logout": "Log out",
  "common.save": "Save", "common.cancel": "Cancel", "common.undo": "Undo", "common.retry": "Retry", "common.loading": "Loading…", "common.error": "Something went wrong",
  "common.offline": "Offline — changes will sync later.", "common.delete": "Delete", "common.add": "Add",
  "days.0": "Monday", "days.1": "Tuesday", "days.2": "Wednesday", "days.3": "Thursday", "days.4": "Friday", "days.5": "Saturday", "days.6": "Sunday",
  "slot.breakfast": "Breakfast", "slot.lunch": "Lunch", "slot.dinner": "Dinner", "slot.snack": "Snack",
  "week.title": "My week", "week.generate": "Plan my week", "week.generating": "Finding the best plan…", "week.shopping": "Build shopping list",
  "shopping.title": "Shopping list", "shopping.store": "Store mode", "pantry.title": "Pantry", "budget.title": "Budget", "settings.title": "Settings", "recipes.title": "Recipes",
};

const dicts = { "fr-FR": fr, "en-GB": en } as const;
export type Locale = keyof typeof dicts;

export function translator(locale: Locale = "fr-FR") {
  const d = dicts[locale];
  return (key: MessageKey, params: Record<string, string | number> = {}): string => d[key].replace(/\{(\w+)\}/g, (_m, k: string) => String(params[k] ?? ""));
}

export function formatMoney(cents: number, locale: Locale = "fr-FR"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(cents / 100);
}

/** Lundi de la semaine contenant `d` (AAAA-MM-JJ, UTC). */
export function mondayOf(d = new Date()): string {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
}

export function shiftWeek(iso: string, weeks: number): string {
  const x = new Date(`${iso}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + 7 * weeks);
  return x.toISOString().slice(0, 10);
}
