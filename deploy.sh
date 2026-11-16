#!/usr/bin/env bash
# =============================================================================
#  Mise — déploiement complet sur un serveur Debian 12 / Ubuntu 22.04+ (VPS).
#
#  Installation ET mise à jour (le script est idempotent) :
#
#    curl -fsSL https://raw.githubusercontent.com/gabinlsc/repas/main/deploy.sh \
#      | sudo DOMAIN=repas.example.fr EMAIL=admin@example.fr bash
#
#  (Juste après un push, le CDN peut servir l'ancienne version ~5 min : remplacer « main »
#   par l'identifiant du commit dans l'URL, ou utiliser « sudo mise-update » qui le fait.)
#
#  Dépôt privé : ajouter GITHUB_TOKEN=<jeton lecture seule> (jamais écrit sur disque).
#    curl -fsSL -H "Authorization: token $GITHUB_TOKEN" \
#      https://raw.githubusercontent.com/gabinlsc/repas/main/deploy.sh \
#      | sudo GITHUB_TOKEN=$GITHUB_TOKEN DOMAIN=... EMAIL=... bash
#
#  Variables (toutes optionnelles sauf mention) :
#    DOMAIN        nom de domaine pointant vers ce serveur (sinon accès http://IP)
#    EMAIL         e-mail Let's Encrypt (requis pour HTTPS)
#    REPO          propriétaire/dépôt GitHub          (défaut : gabinlsc/repas)
#    BRANCH        branche à déployer                  (défaut : main)
#    GITHUB_TOKEN  jeton pour dépôt privé
#    INSTALL_DIR   répertoire d'installation          (défaut : /opt/mise)
#    SKIP_FIREWALL=1  ne pas configurer ufw
#    SKIP_TLS=1       ne pas demander de certificat
#
#  Ce que fait le script :
#    1. paquets système (curl, nginx, certbot, ufw, cron…) et Docker officiel
#    2. téléchargement de la branche depuis GitHub dans une nouvelle « release »
#    3. génération de .env avec des secrets aléatoires (une seule fois, conservé)
#    4. sauvegarde de la base, construction des images, migrations, démarrage
#    5. vérification de santé, sinon retour automatique à la release précédente
#    6. nginx (reverse proxy, en-têtes de sécurité, limitation de débit, SSE)
#    7. HTTPS Let's Encrypt + renouvellement automatique
#    8. pare-feu, sauvegardes quotidiennes, service systemd, commandes mise-*
# =============================================================================
set -Eeuo pipefail
umask 027

REPO="${REPO:-gabinlsc/repas}"
BRANCH="${BRANCH:-main}"
DOMAIN="${DOMAIN:-}"
EMAIL="${EMAIL:-}"
INSTALL_DIR="${INSTALL_DIR:-/opt/mise}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
KEEP_RELEASES=3
PROJECT=mise
WEB_PORT=3000

RELEASES="$INSTALL_DIR/releases"
SHARED="$INSTALL_DIR/shared"
BACKUPS="$INSTALL_DIR/backups"
STAMP="$(date -u +%Y%m%d%H%M%S)"
NEW_RELEASE="$RELEASES/$STAMP"

c_blue=$'\033[1;34m'; c_green=$'\033[1;32m'; c_yellow=$'\033[1;33m'; c_red=$'\033[1;31m'; c_off=$'\033[0m'
step() { printf '\n%s==>%s %s\n' "$c_blue" "$c_off" "$*"; }
ok()   { printf '%s ✓ %s%s\n' "$c_green" "$*" "$c_off"; }
warn() { printf '%s ! %s%s\n' "$c_yellow" "$*" "$c_off" >&2; }
die()  { printf '%s ✗ %s%s\n' "$c_red" "$*" "$c_off" >&2; exit 1; }
trap 'die "échec à la ligne $LINENO (commande : $BASH_COMMAND)"' ERR

# Tout le script est dans main() : avec « curl … | bash », bash lit alors le fichier en
# entier AVANT d'exécuter quoi que ce soit. Sans cela, une commande qui lit l'entrée
# standard (ex. « docker compose exec ») avalait la suite du script, qui s'arrêtait en
# silence avec un code de succès — et la mise à jour ne s'appliquait jamais.
main() {
# Plus aucune commande ne peut lire le script depuis l'entrée standard.
exec </dev/null

# ----------------------------------------------------------------------------- 0. pré-requis
[[ $EUID -eq 0 ]] || die "à lancer en root (sudo)."
[[ -r /etc/os-release ]] || die "système non reconnu."
# shellcheck disable=SC1091
. /etc/os-release
case "${ID:-}" in debian|ubuntu) ;; *) die "Debian ou Ubuntu requis (détecté : ${ID:-?})." ;; esac
[[ "$REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || die "REPO invalide : $REPO"
[[ "$BRANCH" =~ ^[A-Za-z0-9_./-]+$ ]] || die "BRANCH invalide : $BRANCH"
[[ -z "$DOMAIN" || "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]] || die "DOMAIN invalide : $DOMAIN"
[[ "$INSTALL_DIR" == /* && "$INSTALL_DIR" != "/" ]] || die "INSTALL_DIR doit être un chemin absolu autre que /"
MEM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
(( MEM_MB >= 1800 )) || warn "seulement ${MEM_MB} Mo de RAM : 2 Go minimum recommandés (construction des images)."

# ----------------------------------------------------------------------------- 1. paquets
step "Paquets système"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg tar gzip openssl nginx certbot python3-certbot-nginx ufw cron jq >/dev/null
ok "paquets installés"

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  step "Docker (dépôt officiel)"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/${ID}/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/${ID} ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
fi
systemctl enable --now docker >/dev/null
# Journaux Docker bornés (évite de remplir le disque).
if [[ ! -f /etc/docker/daemon.json ]]; then
  printf '{\n  "log-driver": "json-file",\n  "log-opts": { "max-size": "20m", "max-file": "5" }\n}\n' > /etc/docker/daemon.json
  systemctl restart docker
fi
ok "Docker $(docker --version | awk '{print $3}' | tr -d ,)"

# ----------------------------------------------------------------------------- 2. sources
step "Téléchargement de $REPO@$BRANCH"
install -d -m 0750 "$RELEASES" "$SHARED" "$BACKUPS"
TMP_TGZ="$(mktemp)"
AUTH=()
[[ -n "$GITHUB_TOKEN" ]] && AUTH=(-H "Authorization: token $GITHUB_TOKEN")
# L'API GitHub renvoie l'archive de la branche (dépôt public ou privé avec jeton).
curl -fsSL --retry 4 --retry-delay 3 "${AUTH[@]}" -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/${REPO}/tarball/${BRANCH}" -o "$TMP_TGZ" \
  || die "téléchargement impossible (dépôt privé ? fournir GITHUB_TOKEN)."
install -d -m 0750 "$NEW_RELEASE"
# sed lit toute la liste (pas de « head ») : tar ne reçoit jamais SIGPIPE, ce qui ferait
# échouer la commande sous « set -o pipefail ».
TOP_DIR="$(tar -tzf "$TMP_TGZ" | sed -n '1{s|/.*||;p;}')"
tar -xzf "$TMP_TGZ" -C "$NEW_RELEASE" --strip-components=1
rm -f -- "$TMP_TGZ"
# Le dossier racine de l'archive GitHub se termine par le commit (owner-repo-<sha>).
REVISION="${TOP_DIR##*-}"
echo "$REVISION" > "$NEW_RELEASE/REVISION"
[[ -f "$NEW_RELEASE/docker-compose.yml" ]] || die "archive inattendue : docker-compose.yml absent."
ok "release $STAMP (commit ${REVISION})"
CURRENT_REV="$(cat "$INSTALL_DIR/current/REVISION" 2>/dev/null || echo aucune)"
[[ "$CURRENT_REV" == "$REVISION" ]] && warn "le commit $REVISION est déjà déployé : reconstruction quand même."

# ----------------------------------------------------------------------------- 3. secrets
step "Configuration (.env)"
ENV_FILE="$SHARED/.env"
# Secret alphanumérique de $1 caractères (≤ 64) ; cut lit toute l'entrée (pas de SIGPIPE).
rand() { openssl rand -hex 32 | cut -c1-"$1"; }
if [[ -n "$DOMAIN" && -z "${SKIP_TLS:-}" ]]; then APP_URL="https://$DOMAIN"
elif [[ -n "$DOMAIN" ]]; then APP_URL="http://$DOMAIN"
else APP_URL="http://$(curl -fsS4 --max-time 5 https://api.ipify.org || hostname -I | awk '{print $1}')"; fi
if [[ ! -f "$ENV_FILE" ]]; then
  cat > "$ENV_FILE" <<EOF
# Généré par deploy.sh le $(date -u +%FT%TZ). À SAUVEGARDER hors du serveur :
# sans DATA_ENCRYPTION_KEYS, les données de santé chiffrées sont illisibles.
DOMAIN=${DOMAIN}
APP_URL=${APP_URL}
POSTGRES_USER=mise
POSTGRES_PASSWORD=$(rand 40)
POSTGRES_DB=mise
DATA_ENCRYPTION_KEYS=k1:$(openssl rand -base64 32)
METRICS_TOKEN=$(rand 40)
PLANNER_TIME_LIMIT_S=10
PLANNER_WORKERS=$(nproc)
LOG_LEVEL=info
WEB_BIND=127.0.0.1
WEB_PORT=${WEB_PORT}
EOF
  ok ".env créé avec des secrets aléatoires"
else
  # Seules les valeurs dépendant du domaine sont mises à jour ; les secrets restent.
  sed -i "s|^DOMAIN=.*|DOMAIN=${DOMAIN}|; s|^APP_URL=.*|APP_URL=${APP_URL}|" "$ENV_FILE"
  ok ".env existant conservé"
fi
chmod 600 "$ENV_FILE"
ln -sfn "$ENV_FILE" "$NEW_RELEASE/.env"

compose() { docker compose -p "$PROJECT" --env-file "$ENV_FILE" "$@"; }

# ----------------------------------------------------------------------------- 4. sauvegarde + build
PREVIOUS=""
[[ -L "$INSTALL_DIR/current" ]] && PREVIOUS="$(readlink -f "$INSTALL_DIR/current")"
if [[ -n "$PREVIOUS" ]] && (cd "$PREVIOUS" && compose ps --status running postgres 2>/dev/null | grep postgres >/dev/null); then
  step "Sauvegarde de la base avant mise à jour"
  (cd "$PREVIOUS" && compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' </dev/null) > "$BACKUPS/pre-deploy-$STAMP.dump"
  ok "$BACKUPS/pre-deploy-$STAMP.dump"
fi

step "Construction des images (quelques minutes la première fois)"
cd "$NEW_RELEASE"
compose build --pull
ok "images construites"

step "Migrations et démarrage"
compose up -d --remove-orphans
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${WEB_PORT}/api/health" >/dev/null 2>&1; then break; fi
  sleep 3
  if (( i == 60 )); then
    warn "l'application ne répond pas ; journaux :"
    compose logs --tail 80 migrate web || true
    if [[ -n "$PREVIOUS" ]]; then
      warn "retour à la release précédente : $PREVIOUS"
      (cd "$PREVIOUS" && compose up -d --remove-orphans)
    fi
    die "déploiement interrompu (la release précédente reste active)."
  fi
done
ln -sfn "$NEW_RELEASE" "$INSTALL_DIR/current"
ok "application en ligne : $(curl -fsS "http://127.0.0.1:${WEB_PORT}/api/health")"

# ----------------------------------------------------------------------------- 5. nginx
step "nginx"
SERVER_NAME="${DOMAIN:-_}"
cat > /etc/nginx/conf.d/mise-ratelimit.conf <<'EOF'
# Limitation de débit par IP (complément de la limitation applicative par compte).
limit_req_zone $binary_remote_addr zone=mise_api:10m rate=20r/s;
limit_req_zone $binary_remote_addr zone=mise_auth:10m rate=5r/m;
limit_conn_zone $binary_remote_addr zone=mise_conn:10m;
EOF
cat > /etc/nginx/sites-available/mise <<EOF
# Généré par deploy.sh — modifié à chaque déploiement.
upstream mise_web { server 127.0.0.1:${WEB_PORT}; keepalive 32; }

server {
    listen 80;
    listen [::]:80;
    server_name ${SERVER_NAME};

    server_tokens off;
    client_max_body_size 2m;
    limit_conn mise_conn 50;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript image/svg+xml application/manifest+json;

    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    location /.well-known/acme-challenge/ { root /var/www/html; }

    # Les métriques ne sont pas exposées publiquement (scraping interne uniquement).
    location = /api/metrics { allow 127.0.0.1; deny all; proxy_pass http://mise_web; }

    # Temps réel (SSE) : pas de mise en tampon, connexions longues.
    location = /api/events {
        proxy_pass http://mise_web;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 1h;
    }

    location ~ ^/api/trpc/auth\. {
        limit_req zone=mise_auth burst=10 nodelay;
        proxy_pass http://mise_web;
        include /etc/nginx/snippets/mise-proxy.conf;
    }

    location /api/ {
        limit_req zone=mise_api burst=60 nodelay;
        proxy_pass http://mise_web;
        include /etc/nginx/snippets/mise-proxy.conf;
    }

    location /_next/static/ {
        proxy_pass http://mise_web;
        include /etc/nginx/snippets/mise-proxy.conf;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location / {
        proxy_pass http://mise_web;
        include /etc/nginx/snippets/mise-proxy.conf;
    }
}
EOF
cat > /etc/nginx/snippets/mise-proxy.conf <<'EOF'
proxy_http_version 1.1;
proxy_set_header Connection "";
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host $host;
proxy_read_timeout 120s;
EOF
ln -sfn /etc/nginx/sites-available/mise /etc/nginx/sites-enabled/mise
[[ -L /etc/nginx/sites-enabled/default ]] && rm -f -- /etc/nginx/sites-enabled/default
nginx -t -q
systemctl enable --now nginx >/dev/null
systemctl reload nginx
ok "nginx configuré"

# ----------------------------------------------------------------------------- 6. pare-feu
if [[ -z "${SKIP_FIREWALL:-}" ]]; then
  step "Pare-feu (ufw)"
  ufw allow OpenSSH >/dev/null
  ufw allow 'Nginx Full' >/dev/null
  ufw --force enable >/dev/null
  ok "ports ouverts : SSH, 80, 443"
fi

# ----------------------------------------------------------------------------- 7. HTTPS
if [[ -n "$DOMAIN" && -z "${SKIP_TLS:-}" ]]; then
  step "Certificat HTTPS (Let's Encrypt)"
  if [[ -z "$EMAIL" ]]; then
    warn "EMAIL non fourni : HTTPS non configuré (relancer avec EMAIL=...)."
  else
    certbot --nginx --non-interactive --agree-tos --redirect --hsts -m "$EMAIL" -d "$DOMAIN" --keep-until-expiring \
      && ok "HTTPS actif, renouvellement automatique (timer certbot)" \
      || warn "certbot a échoué : le DNS de $DOMAIN pointe-t-il vers ce serveur ?"
  fi
fi

# ----------------------------------------------------------------------------- 8. exploitation
step "Sauvegardes, service et commandes d'administration"
cat > /usr/local/bin/mise-backup <<EOF
#!/usr/bin/env bash
# Sauvegarde PostgreSQL (format custom) + .env ; rétention 14 jours.
set -euo pipefail
cd "$INSTALL_DIR/current"
out="$BACKUPS/mise-\$(date -u +%Y%m%d-%H%M%S).dump"
docker compose -p $PROJECT --env-file "$ENV_FILE" exec -T postgres sh -c 'pg_dump -U "\$POSTGRES_USER" -d "\$POSTGRES_DB" --format=custom' </dev/null > "\$out"
cp "$ENV_FILE" "$BACKUPS/env-\$(date -u +%Y%m%d).bak"
chmod 600 "\$out" "$BACKUPS"/env-*.bak
find "$BACKUPS" -maxdepth 1 -type f \( -name 'mise-*.dump' -o -name 'env-*.bak' -o -name 'pre-deploy-*.dump' \) -mtime +14 -delete
echo "sauvegarde : \$out"
EOF
cat > /usr/local/bin/mise-restore <<EOF
#!/usr/bin/env bash
# Restaure une sauvegarde : mise-restore $BACKUPS/mise-AAAAMMJJ-HHMMSS.dump
set -euo pipefail
dump="\${1:?chemin du fichier .dump}"
[[ -f "\$dump" ]] || { echo "fichier introuvable : \$dump" >&2; exit 1; }
cd "$INSTALL_DIR/current"
dc() { docker compose -p $PROJECT --env-file "$ENV_FILE" "\$@"; }
dc stop web worker
dc exec -T postgres sh -c 'pg_restore -U "\$POSTGRES_USER" -d "\$POSTGRES_DB" --clean --if-exists --no-owner' < "\$dump"
dc up -d web worker
echo "restauration terminée"
EOF
cat > /usr/local/bin/mise-update <<EOF
#!/usr/bin/env bash
# Met à jour vers la dernière version de la branche (relance deploy.sh depuis GitHub).
set -euo pipefail
auth=()
[[ -n "\${GITHUB_TOKEN:-}" ]] && auth=(-H "Authorization: token \$GITHUB_TOKEN")
tmp="\$(mktemp)"
trap 'rm -f -- "\$tmp"' EXIT
# Fichier plutôt que « curl | bash » : rien ne peut tronquer le script en cours de route.
# raw.githubusercontent.com garde une branche en cache jusqu'à 5 minutes (selon le serveur
# du CDN) : on résout d'abord le dernier commit via l'API, puis on télécharge à ce commit.
sha="\$(curl -fsSL "\${auth[@]}" -H "Accept: application/vnd.github.sha" "https://api.github.com/repos/${REPO}/commits/${BRANCH}")"
[[ "\$sha" =~ ^[0-9a-f]{40}\$ ]] || { echo "commit introuvable pour ${REPO}@${BRANCH}" >&2; exit 1; }
echo "mise à jour vers le commit \${sha:0:7}"
curl -fsSL "\${auth[@]}" "https://raw.githubusercontent.com/${REPO}/\$sha/deploy.sh" -o "\$tmp"
REPO="${REPO}" BRANCH="${BRANCH}" DOMAIN="${DOMAIN}" EMAIL="${EMAIL}" INSTALL_DIR="${INSTALL_DIR}" GITHUB_TOKEN="\${GITHUB_TOKEN:-}" bash "\$tmp"
EOF
cat > /usr/local/bin/mise-logs <<EOF
#!/usr/bin/env bash
cd "$INSTALL_DIR/current" && exec docker compose -p $PROJECT --env-file "$ENV_FILE" logs -f --tail 100 "\$@"
EOF
cat > /usr/local/bin/mise-status <<EOF
#!/usr/bin/env bash
cd "$INSTALL_DIR/current" && echo "commit déployé : \$(cat REVISION 2>/dev/null || echo inconnu)" && docker compose -p $PROJECT --env-file "$ENV_FILE" ps && curl -fsS http://127.0.0.1:${WEB_PORT}/api/health && echo
EOF
chmod 0750 /usr/local/bin/mise-{backup,restore,update,logs,status}

cat > /etc/cron.d/mise-backup <<'EOF'
# Sauvegarde quotidienne de la base Mise à 03h17.
17 3 * * * root /usr/local/bin/mise-backup >> /var/log/mise-backup.log 2>&1
EOF
chmod 0644 /etc/cron.d/mise-backup

cat > /etc/systemd/system/mise.service <<EOF
[Unit]
Description=Mise (planificateur de repas)
Requires=docker.service
After=docker.service network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$INSTALL_DIR/current
ExecStart=/usr/bin/docker compose -p $PROJECT --env-file $ENV_FILE up -d --remove-orphans
ExecStop=/usr/bin/docker compose -p $PROJECT --env-file $ENV_FILE stop
TimeoutStartSec=600

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable mise.service >/dev/null
ok "sauvegarde quotidienne, service systemd, commandes mise-backup / mise-restore / mise-update / mise-logs / mise-status"

# ----------------------------------------------------------------------------- 9. ménage
step "Nettoyage"
mapfile -t OLD < <(find "$RELEASES" -mindepth 1 -maxdepth 1 -type d -regex '.*/[0-9]\{14\}' | sort | head -n -"$KEEP_RELEASES")
for d in "${OLD[@]}"; do
  [[ "$d" == "$RELEASES"/* && "$d" != "$(readlink -f "$INSTALL_DIR/current")" ]] && rm -rf -- "$d"
done
docker image prune -f >/dev/null
ok "anciennes releases et images supprimées"

printf '\n%s Mise est en ligne : %s (commit %s)%s\n' "$c_green" "$APP_URL" "$REVISION" "$c_off"
printf '   Secrets : %s (à sauvegarder hors du serveur)\n' "$ENV_FILE"
printf '   Mise à jour : sudo mise-update   ·   Statut : sudo mise-status   ·   Journaux : sudo mise-logs\n'
}

main "$@"
