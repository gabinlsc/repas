# Modèle de menaces (STRIDE)

Actifs : comptes, **données de santé** (allergies, régimes, cibles caloriques), habitudes alimentaires, historique d'achats, disponibilité du service.
Frontières : navigateur ↔ nginx (TLS) ↔ web (Next/tRPC) ↔ PostgreSQL / Redis / solveur (réseau Docker interne, non exposé).

| Catégorie | Menace | Atténuations | Tests |
|---|---|---|---|
| **S**poofing | vol de session, bourrage d'identifiants | cookie `HttpOnly; Secure; SameSite=Lax`, jeton 256 bits stocké haché (SHA-256), rotation toutes les 24 h, expiration glissante 30 j ; Argon2id (OWASP) ; limitation par IP et par e-mail (base) + nginx `limit_req` ; messages d'erreur identiques (pas d'énumération) ; temps constant si compte inconnu | `flow.test.ts` (rotation, limitation, erreurs génériques) |
| **T**ampering | CSRF, injection SQL, falsification de la file hors ligne | vérification `Origin` sur toute mutation ; Drizzle (requêtes paramétrées) ; Zod sur chaque entrée ; opérations de sync validées (schéma, appartenance au foyer, idempotence par UUID) ; CSP stricte avec nonce | `authz.test.ts` (sync refusée inter-foyers) |
| **R**epudiation | contestation d'une suppression ou modification | table `audit_event` (inscription, connexion, membres, recettes, génération, clôture, suppression de compte) sans données personnelles | — |
| **I**nformation disclosure | accès inter-foyers (IDOR), fuite des données de santé, journaux | chaque requête résout le foyer côté serveur et filtre par `household_id` ; données de santé chiffrées AES-256-GCM au repos (clé hors base, rotation) ; logs JSON caviardés ; `/api/metrics` non public ; HSTS ; snapshot du solveur sans noms | `authz.test.ts` (toutes les routes à identifiant), `services.test.ts` (chiffré en base) |
| **D**enial of service | génération massive, import de pages énormes, SSE | limitation par foyer (générations, imports), solveur borné en temps et en concurrence, import URL : 3 Mo / 8 s / 3 redirections, limites de taille Zod, `limit_conn` nginx | — |
| **E**levation of privilege | membre modifiant le foyer, SSRF via import d'URL | rôles (owner/admin requis pour réglages et membres) ; import : http(s) seulement, résolution DNS vérifiée (IP privées/loopback/link-local refusées), redirections revérifiées ; conteneurs non root | tests unitaires `http.ts` (`isPrivateIp`) |

## RGPD
- Minimisation : seules les données utiles au calcul sont collectées ; pas de date de naissance, pas de poids.
- Export complet (JSON, données de santé déchiffrées) : Réglages → « Exporter mes données » (`account.export`).
- Suppression complète : `account.delete` (mot de passe + confirmation) ; le foyer part en cascade s'il n'a plus de compte. Les sauvegardes expirent sous 14 jours.
- Sous-traitants : aucun par défaut (auto-hébergé). Open Food Facts n'est appelé qu'avec un code-barres, sans donnée personnelle.

## Risques résiduels connus
- `style-src 'unsafe-inline'` (styles injectés par Next/Tailwind) : impact limité (pas d'exécution de script).
- OAuth Google/Apple non activé (BACKLOG B-001).
- Le chiffrement applicatif ne protège pas contre un attaquant ayant à la fois la base **et** `.env`.
