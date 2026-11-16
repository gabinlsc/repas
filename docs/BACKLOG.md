# Backlog

Tout reste-à-faire du code est référencé ici (aucun TODO orphelin).

| ID | Sujet | Détail | Priorité |
|---|---|---|---|
| B-001 | OAuth Google / Apple | Table `oauth_account` prête ; brancher `arctic` + écrans. Nécessite des identifiants clients fournis par le propriétaire. | P1 |
| B-002 | OCR de tickets | Pipeline côté client prévu (Tesseract.js) → rapprochement `product` par EAN/libellé ; aujourd'hui saisie manuelle des prix réels en mode magasin. | P1 |
| B-003 | Open Prices | Client HTTP avec cache/timeout/backoff prêt dans `data/external` ; job périodique de rafraîchissement à planifier. | P1 |
| B-004 | Import Ciqual officiel en CI | Le script fonctionne sur le XLS officiel ; ajouter un job mensuel qui vérifie la version publiée. | P2 |
| B-005 | Lighthouse CI sur build prod réel | Config `lighthouserc.json` fournie ; budget à recalibrer sur la machine de référence. | P1 |
| B-006 | Aide LLM (optionnelle) | Interface `LlmProvider` à créer (extraction de recette / correspondances), sortie validée par schéma strict + relecture ; l'application fonctionne entièrement sans. | P2 |
| B-007 | Cibles nutritionnelles par membre dans le solveur | Le solveur pénalise l'écart à la cible kcal du foyer ; décliner par membre et par macro. | P1 |
| B-008 | Traduction EN complète | Dictionnaire EN présent pour la navigation et les écrans principaux ; compléter les recettes. | P2 |
| B-009 | Jeu de tickets réels (critère ±10 %) | Fixture synthétique fournie (`apps/web/tests/fixtures/receipts`) ; remplacer par des tickets réels anonymisés. | P1 |
| B-010 | API publique OpenAPI | Adaptateur `trpc-to-openapi` si un client tiers apparaît. | P2 |
| B-011 | Export OpenTelemetry | Brancher `@opentelemetry/sdk-node` (web, worker) et `opentelemetry-instrumentation-fastapi` derrière `OTEL_EXPORTER_OTLP_ENDPOINT`. | P1 |
| B-012 | Scan code-barres dans l'interface | L'API `products.lookupEan` (local puis Open Food Facts) est prête ; ajouter la capture caméra (`BarcodeDetector`, repli ZXing) dans Stock. | P2 |
| B-013 | Substitutions intelligentes | Les substituts sont stockés (`recipe_ingredient.substitutes`) ; ajouter la suggestion quand un ingrédient manque ou est en promotion. | P2 |
| B-014 | Formulaire de recette manuel complet | Création possible par import texte/URL ; ajouter un éditeur ligne à ligne (l'API `recipes.create/update` le permet déjà). | P1 |
| B-015 | Éditeur visuel de l'ordre des rayons | L'API `stores.create/setLayout` existe ; ajouter le glisser-déposer des rayons dans Réglages. | P2 |
| B-016 | Invitations de membres avec compte | Table `household_invite` prête ; écran d'invitation par lien pour partager le foyer entre plusieurs comptes. | P1 |
