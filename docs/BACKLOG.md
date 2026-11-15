# Backlog

Tout reste-à-faire du code est référencé ici (aucun TODO orphelin).

| ID | Sujet | Détail | Priorité |
|---|---|---|---|
| B-001 | OAuth Google / Apple | Table `oauth_account` prête ; brancher `arctic` + écrans. Nécessite des identifiants clients fournis par le propriétaire. | P1 |
| B-002 | OCR de tickets | Pipeline côté client prévu (Tesseract.js) → rapprochement `product` par EAN/libellé ; aujourd'hui saisie manuelle des prix réels en mode magasin. | P1 |
| B-003 | Open Prices | Client HTTP avec cache/timeout/backoff prêt dans `data/external` ; job périodique de rafraîchissement à planifier. | P1 |
| B-004 | Import Ciqual officiel en CI | Le script fonctionne sur le XLS officiel ; ajouter un job mensuel qui vérifie la version publiée. | P2 |
| B-005 | Lighthouse CI sur build prod réel | Config `lighthouserc.json` fournie ; budget à recalibrer sur la machine de référence. | P1 |
| B-006 | Fournisseur LLM | Interface `LlmProvider` + implémentation nulle ; brancher un fournisseur (désactivé par défaut). | P2 |
| B-007 | Cibles nutritionnelles par membre dans le solveur | Le solveur pénalise l'écart à la cible kcal du foyer ; décliner par membre et par macro. | P1 |
| B-008 | Traduction EN complète | Dictionnaire EN présent pour la navigation et les écrans principaux ; compléter les recettes. | P2 |
| B-009 | Jeu de tickets réels (critère ±10 %) | Fixture synthétique fournie (`apps/web/tests/fixtures/receipts`) ; remplacer par des tickets réels anonymisés. | P1 |
| B-010 | API publique OpenAPI | Adaptateur `trpc-to-openapi` si un client tiers apparaît. | P2 |
