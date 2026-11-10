#!/usr/bin/env bash
# Prepares the server for the QQ bots (apps/bot). Run on the server as the
# admin user (not root; it uses sudo where needed), after deploying the code
# that contains apps/bot:
#
#   bash /home/admin/suck/scripts/bot-setup.sh [--mirror https://xxxx.mirror.aliyuncs.com]
#
#   --mirror URL   Docker Hub mirror (阿里云 容器镜像服务 -> 镜像工具 -> 镜像加速器),
#                  written to /etc/docker/daemon.json when that file does not exist.
#
# It is safe to run again: every step skips what is already there, and it
# never overwrites an existing .env, token or Docker setting.
#
# What it does:
#   1. checks Node, pnpm, memory and the code
#   2. installs Docker (Alibaba Cloud Linux 3 / CentOS family) if missing
#   3. sets up NapCat in $NAPCAT_DIR: compose file, random WebUI and OneBot
#      tokens, OneBot forward WebSocket config, and starts the container
#   4. creates apps/bot/.env with the same OneBot token
#   5. prints the manual steps that are left (QR login, QQ open platform)

set -euo pipefail

TARGET="${TARGET:-/home/admin/suck}"
NAPCAT_DIR="${NAPCAT_DIR:-/home/admin/napcat}"
BOT_DIR="$TARGET/apps/bot"
MIRROR=""

while [ $# -gt 0 ]; do
  case "$1" in
    --mirror) MIRROR="${2:?--mirror needs a URL}"; shift 2 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "unknown option: $1"; exit 1 ;;
  esac
done

ok()   { echo "  ok    $*"; }
skip() { echo "  skip  $*"; }
warn() { echo "  WARN  $*"; }
fail() { echo "  FAIL  $*"; exit 1; }
token() { openssl rand -hex 24; }

install_docker_ce() {
  echo "  ...   installing Docker CE from the Alibaba Cloud mirror ($PRETTY_NAME)"
  sudo wget -q -O /etc/yum.repos.d/docker-ce.repo http://mirrors.cloud.aliyuncs.com/docker-ce/linux/centos/docker-ce.repo
  sudo sed -i 's|https://mirrors.aliyun.com|http://mirrors.cloud.aliyuncs.com|g' /etc/yum.repos.d/docker-ce.repo
  if [ "$ID" = "alinux" ]; then
    sudo dnf -y install dnf-plugin-releasever-adapter --repo alinux3-plus
  fi
  sudo dnf -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  ok "docker installed"
}

echo "==> 1/5 checks"
[ "$(id -u)" -ne 0 ] || fail "run as the admin user, not root (the script calls sudo itself)"
[ -d "$BOT_DIR" ] || fail "$BOT_DIR not found: deploy the code with apps/bot first (scripts/deploy.sh --git)"
node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=17)?0:1)' 2>/dev/null \
  || fail "Node $(node -v 2>/dev/null || echo 'not found') is too old; 22.17 or newer is needed"
ok "node $(node -v)"
command -v pnpm >/dev/null || fail "pnpm not found"
ok "pnpm $(pnpm -v)"
command -v openssl >/dev/null || fail "openssl not found (sudo dnf install -y openssl)"
AVAIL_MB=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)
if [ "$AVAIL_MB" -lt 1200 ]; then
  warn "only ${AVAIL_MB} MB memory available; NapCat needs about 0.5-1 GB"
else
  ok "${AVAIL_MB} MB memory available"
fi
[ -d "$BOT_DIR/node_modules" ] || { echo "  ...   installing dependencies"; (cd "$TARGET" && pnpm install --frozen-lockfile); }
ok "bot dependencies installed"

echo "==> 2/5 docker"
if command -v docker >/dev/null; then
  skip "docker already installed ($(docker --version | cut -d, -f1))"
else
  . /etc/os-release
  case "${ID:-}" in
    alinux)
      if [ "${VERSION_ID%%.*}" -ge 4 ] 2>/dev/null; then
        # Alibaba Cloud Linux 4 ships Docker and the compose plugin itself.
        echo "  ...   installing Docker from the system repositories ($PRETTY_NAME)"
        sudo dnf -y install docker docker-compose-plugin
        ok "docker installed"
      else
        install_docker_ce
      fi
      ;;
    centos|rhel|rocky|almalinux|anolis)
      install_docker_ce
      ;;
    *)
      fail "no automatic Docker install for ${PRETTY_NAME:-this system}; install Docker + the compose plugin (https://help.aliyun.com/zh/ecs/user-guide/install-and-use-docker), then run this again"
      ;;
  esac
fi
if [ -n "$MIRROR" ]; then
  if [ -f /etc/docker/daemon.json ]; then
    warn "/etc/docker/daemon.json exists, not changed; add \"registry-mirrors\": [\"$MIRROR\"] yourself if it is missing"
  else
    sudo mkdir -p /etc/docker
    printf '{\n  "registry-mirrors": ["%s"]\n}\n' "$MIRROR" | sudo tee /etc/docker/daemon.json >/dev/null
    ok "registry mirror set: $MIRROR"
    sudo systemctl restart docker 2>/dev/null || true
  fi
fi
sudo systemctl enable --now docker >/dev/null 2>&1
ok "docker running, starts at boot"
if ! id -nG "$USER" | grep -qw docker; then
  sudo usermod -aG docker "$USER"
  ok "added $USER to the docker group (takes effect at your next login)"
fi
DOCKER="docker"
docker info >/dev/null 2>&1 || DOCKER="sudo docker"
if ! $DOCKER compose version >/dev/null 2>&1; then
  echo "  ...   installing the docker compose plugin"
  sudo dnf -y install docker-compose-plugin >/dev/null 2>&1 || true
  $DOCKER compose version >/dev/null 2>&1 || fail "docker compose plugin missing and could not be installed (sudo dnf -y install docker-compose-plugin)"
fi
ok "docker compose $($DOCKER compose version --short 2>/dev/null)"

echo "==> 3/5 napcat ($NAPCAT_DIR)"
mkdir -p "$NAPCAT_DIR/data/qq" "$NAPCAT_DIR/data/config" "$NAPCAT_DIR/data/plugins"
cp "$BOT_DIR/napcat/compose.yaml" "$NAPCAT_DIR/compose.yaml"
ok "compose.yaml (updated from the repository)"
if [ -f "$NAPCAT_DIR/.env" ]; then
  skip ".env exists, tokens kept"
else
  umask 077
  cat > "$NAPCAT_DIR/.env" <<EOF
NAPCAT_UID=$(id -u)
NAPCAT_GID=$(id -g)
WEBUI_TOKEN=$(token)
ONEBOT_TOKEN=$(token)
NAPCAT_IMAGE=mlikiowa/napcat-docker:latest
EOF
  umask 022
  ok ".env with new random tokens"
fi
# shellcheck disable=SC1091
. "$NAPCAT_DIR/.env"
# NapCat's image only writes its own OneBot config when none exists, so this
# one (forward WebSocket on 3001 with our token) is what it uses.
ONEBOT_CONFIG="$NAPCAT_DIR/data/config/onebot11.json"
if [ -f "$ONEBOT_CONFIG" ]; then
  skip "onebot11.json exists, not changed"
else
  ONEBOT_TOKEN="$ONEBOT_TOKEN" node -e '
    const cfg = { network: { httpServers: [], httpSseServers: [], httpClients: [], websocketClients: [], plugins: [],
      websocketServers: [{ enable: true, name: "potato-bot", host: "0.0.0.0", port: 3001, reportSelfMessage: false,
        enableForcePushEvent: true, messagePostFormat: "array", token: process.env.ONEBOT_TOKEN, debug: false, heartInterval: 30000 }] },
      musicSignUrl: "", enableLocalFile2Url: false, parseMultMsg: false };
    process.stdout.write(JSON.stringify(cfg, null, 2) + "\n");' > "$ONEBOT_CONFIG"
  chmod 600 "$ONEBOT_CONFIG"
  ok "onebot11.json: forward WebSocket on 127.0.0.1:3001 with the token"
fi
echo "  ...   pulling and starting NapCat (the image is about 600 MB; the first pull takes a while)"
if ! (cd "$NAPCAT_DIR" && $DOCKER compose up -d); then
  echo
  echo "  Pulling the image failed. Docker Hub is usually unreachable from mainland China,"
  echo "  and the Alibaba Cloud accelerator does not carry every image. Pull it through a"
  echo "  public mirror and point NAPCAT_IMAGE at it, then run this script again:"
  echo "    docker pull docker.m.daocloud.io/mlikiowa/napcat-docker:latest"
  echo "    sed -i 's|^NAPCAT_IMAGE=.*|NAPCAT_IMAGE=docker.m.daocloud.io/mlikiowa/napcat-docker:latest|' $NAPCAT_DIR/.env"
  exit 1
fi
ok "napcat container running"

echo "==> 4/5 bot settings ($BOT_DIR/.env)"
if [ -s "$BOT_DIR/.env" ]; then
  skip ".env exists, not changed (its ONEBOT_TOKEN must match $NAPCAT_DIR/.env)"
else
  [ -f "$BOT_DIR/.env.example" ] || fail "$BOT_DIR/.env.example missing: deploy the latest code (deploy.sh now copies it), or copy it from your git checkout"
  umask 077
  # Written to a temporary file first, so a failure never leaves an empty .env behind.
  sed "s|^ONEBOT_TOKEN=.*|ONEBOT_TOKEN=$ONEBOT_TOKEN|" "$BOT_DIR/.env.example" > "$BOT_DIR/.env.tmp"
  mv "$BOT_DIR/.env.tmp" "$BOT_DIR/.env"
  umask 022
  ok ".env created with the OneBot token"
fi

echo "==> 5/5 what is left"
PUBLIC_IP=$(curl -s --max-time 3 http://100.100.100.200/latest/meta-data/eipv4 2>/dev/null || true)
[[ "$PUBLIC_IP" =~ ^[0-9.]+$ ]] || PUBLIC_IP="(see the server's public IP in the Alibaba Cloud console)"
cat <<EOF

  Community bot (NapCat):
    1. On YOUR computer, open a tunnel:  ssh -L 6099:127.0.0.1:6099 $USER@<server IP>
    2. Browse to http://127.0.0.1:6099/webui  (token: WEBUI_TOKEN in $NAPCAT_DIR/.env)
    3. Scan the QR code with the bot's QQ account.
    4. In $BOT_DIR/.env set ONEBOT_SELF_ID (that QQ number) and ONEBOT_GROUPS.

  Official bot (q.qq.com):
    5. In 开发设置, copy AppID and AppSecret into $BOT_DIR/.env (QQ_APP_ID, QQ_APP_SECRET).
    6. Add this server's public IP to the IP whitelist: $PUBLIC_IP
    7. In 沙箱配置, add your test group.

  Start the bots:
    cd $BOT_DIR && pm2 start ecosystem.config.cjs && pm2 save
    pm2 logs potato-bot
  Then send 状态 in the group (@ the official bot for its reply).
EOF
