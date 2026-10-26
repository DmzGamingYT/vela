#!/usr/bin/env bash
# Enregistre les secrets GitHub nécessaires à la signature Developer ID et à la
# notarisation des builds macOS de Vela.
#
#   scripts/mac-signing.sh ~/Desktop/DeveloperID.p12
#
# Le certificat et les mots de passe ne passent jamais par un fichier du dépôt :
# ils sont lus localement, envoyés directement à `gh secret set`, puis le
# temporaire est supprimé.
set -euo pipefail

REPO="DmzGamingYT/vela"
P12="${1:-}"

if [[ -z "$P12" || ! -f "$P12" ]]; then
  echo "Usage : $0 chemin/vers/certificat.p12" >&2
  echo "Le .p12 s'exporte depuis Trousseau d'accès → Mes certificats →" >&2
  echo "« Developer ID Application: … » → clic droit → Exporter." >&2
  exit 1
fi

command -v gh >/dev/null || { echo "gh (GitHub CLI) est requis." >&2; exit 1; }

echo "Certificat : $P12"
read -rsp "Mot de passe du .p12 : " P12_PASSWORD; echo
read -rp  "Apple ID (compte développeur) : " APPLE_ID
read -rsp "Mot de passe d'application Apple (format xxxx-xxxx-xxxx-xxxx) : " APPLE_PASSWORD; echo
read -rp  "Team ID (10 caractères, visible sur developer.apple.com → Membership) : " TEAM_ID

# Vérifie que le .p12 contient bien une clé privée et un certificat.
openssl pkcs12 -in "$P12" -passin "pass:$P12_PASSWORD" -noout -info >/dev/null 2>&1 \
  || { echo "Mot de passe du .p12 incorrect ou fichier illisible." >&2; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
base64 < "$P12" | tr -d '\n' > "$WORK/cert.b64"

echo "Envoi des secrets vers $REPO…"
gh secret set MAC_CERT_P12 --repo "$REPO" < "$WORK/cert.b64"
printf '%s' "$P12_PASSWORD" | gh secret set MAC_CERT_PASSWORD --repo "$REPO"
printf '%s' "$APPLE_ID" | gh secret set APPLE_ID --repo "$REPO"
printf '%s' "$APPLE_PASSWORD" | gh secret set APPLE_APP_SPECIFIC_PASSWORD --repo "$REPO"
printf '%s' "$TEAM_ID" | gh secret set APPLE_TEAM_ID --repo "$REPO"

echo
echo "Secrets en place :"
gh secret list --repo "$REPO"
cat <<'EOF'

Prochaine étape : publier une version signée.

  npm version patch && git push

Le workflow signe, notarise et agrafe le ticket Apple avant de publier. Cette
première version signée doit être installée une fois à la main depuis le .dmg
(Gatekeeper la reconnaît comme développeur identifié) ; les suivantes
s'installeront seules, sans repasser par le .dmg.
EOF
