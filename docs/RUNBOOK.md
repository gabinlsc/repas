# RUNBOOK — exploitation de Mise

## Machine de référence
VPS 4 vCPU / 8 Go RAM / SSD, Debian 12 ou Ubuntu 24.04. Minimum : 2 vCPU / 2 Go (la construction des images est le poste le plus gourmand).
Mesures (4 vCPU) : plan 7 j × 3 repas, 500 recettes, 6 membres : p50 ≈ 5,1 s, p95 ≈ 5,5 s (`bench/run.py`) ; plan réel (157 recettes, 2 repas/j) ≈ 3,5–5 s.

## Déploiement initial
```bash
curl -fsSL https://raw.githubusercontent.com/gabinlsc/repas/main/deploy.sh | sudo DOMAIN=repas.example.fr EMAIL=admin@example.fr bash
```
Le script installe les paquets (Docker officiel, nginx, certbot, ufw, cron), télécharge la branche, génère `/opt/mise/shared/.env` (secrets aléatoires), construit et démarre les conteneurs, configure nginx + HTTPS, le pare-feu, la sauvegarde quotidienne et le service systemd.
Prérequis : l'enregistrement DNS A/AAAA du domaine pointe vers le serveur **avant** l'exécution (sinon relancer le script une fois le DNS propagé).

Arborescence :
```
/opt/mise/releases/<horodatage>/   code de chaque déploiement (3 conservés)
/opt/mise/current -> releases/…    release active
/opt/mise/shared/.env              secrets (chmod 600) — À SAUVEGARDER HORS DU SERVEUR
/opt/mise/backups/                 sauvegardes PostgreSQL (14 jours)
```

## Mise à jour
`sudo mise-update` — affiche à la fin « Mise est en ligne … (commit xxxxxxx) » ; `sudo mise-status` indique le commit actif.

> Correctif important : jusqu'au commit `f9dd9ae` inclus, une mise à jour lancée via `curl … | bash` (ou `mise-update`, qui faisait de même) s'arrêtait silencieusement après la sauvegarde de la base, car `docker compose exec` lisait la suite du script sur l'entrée standard. Le script est désormais exécuté en entier avant toute commande (`main()` + entrée standard fermée) et `mise-update` télécharge le script dans un fichier. **Les installations existantes doivent relancer une fois la commande `curl` complète** (le `mise-update` déjà installé contient l'ancienne logique).

 (ou relancer la commande `curl … | sudo bash`). Étapes : sauvegarde automatique de la base, construction, migrations (service `migrate`, idempotent), démarrage, contrôle de santé. Si `/api/health` ne répond pas sous 3 minutes, la release précédente est relancée et le script s'arrête en erreur.

Retour arrière manuel :
```bash
cd /opt/mise/releases/<release-précédente>
sudo docker compose -p mise --env-file /opt/mise/shared/.env up -d
sudo ln -sfn "$PWD" /opt/mise/current
```
Les migrations sont additives ; en cas de migration destructive, restaurer la sauvegarde `pre-deploy-<horodatage>.dump`.

## Commandes
| Commande | Rôle |
|---|---|
| `sudo mise-status` | état des conteneurs + santé |
| `sudo mise-logs [web\|worker\|planner\|postgres]` | journaux JSON en continu |
| `sudo mise-backup` | sauvegarde immédiate |
| `sudo mise-restore <fichier.dump>` | restauration |
| `sudo mise-update` | mise à jour |

## Sauvegarde et restauration
- Quotidienne à 03h17 (`/etc/cron.d/mise-backup`), format `pg_dump --format=custom`, rétention 14 jours, plus une copie de `.env`.
- **Copier régulièrement `/opt/mise/backups` hors du serveur** (ex. `rclone`, `restic`) : une sauvegarde sur la même machine ne protège pas d'une perte du disque.
- Restauration : `sudo mise-restore /opt/mise/backups/mise-AAAAMMJJ-HHMMSS.dump` (arrête web/worker, `pg_restore --clean`, redémarre).
- Procédure testée : `pg_dump` → base vide → `pg_restore` → vérification `select count(*) from recipe` et connexion d'un compte de test (voir « Test de restauration » ci-dessous, à rejouer chaque trimestre).
- La clé `DATA_ENCRYPTION_KEYS` est indispensable pour relire les allergies/régimes restaurés : elle est dans la copie de `.env`.

### Test de restauration (trimestriel)
```bash
sudo mise-backup
cd /opt/mise/current
sudo docker compose -p mise --env-file /opt/mise/shared/.env exec -T postgres createdb -U mise restore_test
sudo docker compose -p mise --env-file /opt/mise/shared/.env exec -T postgres pg_restore -U mise -d restore_test < /opt/mise/backups/<dernier>.dump
sudo docker compose -p mise --env-file /opt/mise/shared/.env exec -T postgres psql -U mise -d restore_test -c "select count(*) from recipe; select count(*) from \"user\";"
sudo docker compose -p mise --env-file /opt/mise/shared/.env exec -T postgres dropdb -U mise restore_test
```

## Rotation des secrets
| Secret | Procédure | Effet |
|---|---|---|
| `DATA_ENCRYPTION_KEYS` | Ajouter une nouvelle clé **en tête** : `k2:<openssl rand -base64 32>,k1:<ancienne>` puis `sudo mise-update`. Les nouvelles écritures utilisent k2 ; les anciennes données restent lisibles via k1 (et sont rechiffrées à leur prochaine modification). Retirer k1 seulement quand plus aucune donnée ne l'utilise. | aucune interruption |
| `POSTGRES_PASSWORD` | `docker compose exec postgres psql -U mise -c "ALTER USER mise PASSWORD '<nouveau>'"` puis modifier `.env` et `sudo mise-update`. | redémarrage web/worker |
| `METRICS_TOKEN` | modifier `.env`, `sudo mise-update`, mettre à jour Prometheus. | — |
| Sessions utilisateurs | `docker compose exec postgres psql -U mise -c "delete from session"` | déconnecte tout le monde |

## Supervision
- Santé : `GET /api/health` (base obligatoire ; solveur signalé « down » sans bloquer la consultation).
- Prometheus : `GET /api/metrics` (web, en interne ou avec `Authorization: Bearer $METRICS_TOKEN`) et `planner:8000/metrics` (durée de résolution, statuts).
- Traces : définir `OTEL_EXPORTER_OTLP_ENDPOINT` pour exporter vers un collecteur OpenTelemetry.
- Alertes recommandées : `/api/health` ≠ 200 pendant 2 min ; p95 `planner_solve_seconds` > 15 s ; `mise_login_failures_total` en forte hausse ; disque > 80 %.

## Incidents courants
| Symptôme | Cause probable | Action |
|---|---|---|
| « Le moteur de planification est indisponible » | conteneur planner arrêté / saturé | `mise-logs planner`, `docker compose restart planner`, réduire `PLANNER_WORKERS` |
| Génération toujours « en cours » | worker arrêté ou Redis indisponible | `mise-logs worker`, `docker compose restart worker redis` |
| Certificat expiré | timer certbot | `sudo certbot renew && sudo systemctl reload nginx` |
| Erreur 403 « Origine refusée » | `APP_URL` ne correspond pas au domaine | corriger `APP_URL` dans `.env`, `mise-update` |
| Liste de courses non synchronisée | appareil hors ligne | la file locale se rejoue automatiquement à la reconnexion |
