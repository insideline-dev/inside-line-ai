#!/bin/bash
# Pre-flight env check — validates backend/.env has all required vars before docker compose up

set -e

ENV_FILE="backend/.env"
ERRORS=0

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ $ENV_FILE not found. Copy backend/.env.example to backend/.env and fill in the values."
  exit 1
fi

echo "Checking $ENV_FILE..."
echo ""

check_required() {
  local var="$1"
  local desc="$2"
  local val=$(grep "^${var}=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2-)

  if [ -z "$val" ] || echo "$val" | grep -qE '^(your-|change-me|user:|password)'; then
    echo "❌ $var — $desc"
    ERRORS=$((ERRORS + 1))
  else
    echo "✅ $var"
  fi
}

check_optional() {
  local var="$1"
  local desc="$2"
  local val=$(grep "^${var}=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2-)

  if [ -z "$val" ]; then
    echo "⚠️  $var — $desc (optional, skipped)"
  else
    echo "✅ $var"
  fi
}

echo "=== Required ==="
check_required "DATABASE_URL" "PostgreSQL connection string"
check_required "JWT_SECRET" "JWT secret (min 32 chars)"
check_required "STORAGE_ENDPOINT" "R2/S3 endpoint URL"
check_required "STORAGE_ACCESS_KEY_ID" "R2/S3 access key"
check_required "STORAGE_SECRET_ACCESS_KEY" "R2/S3 secret key"
check_required "STORAGE_BUCKET" "R2/S3 bucket name"

echo ""
echo "=== Auth ==="
check_optional "GOOGLE_CLIENT_ID" "Google OAuth (login with Google won't work)"
check_optional "GOOGLE_CLIENT_SECRET" "Google OAuth secret"

echo ""
echo "=== AI Pipeline ==="
check_optional "GOOGLE_AI_API_KEY" "Gemini API key (AI pipeline won't work)"
check_optional "OPENAI_API_KEY" "OpenAI API key"
check_optional "MISTRAL_API_KEY" "Mistral API key (OCR won't work)"

echo ""
echo "=== Email ==="
check_optional "RESEND_API_KEY" "Email sending won't work"

echo ""
echo "=== Integrations ==="
check_optional "AGENTMAIL_API_KEY" "Clara email assistant won't work"
check_optional "TWILIO_ACCOUNT_SID" "WhatsApp notifications won't work"
check_optional "UNIPILE_API_KEY" "LinkedIn scraping won't work"

echo ""
if [ $ERRORS -gt 0 ]; then
  echo "🚫 $ERRORS required variable(s) missing or using placeholder values."
  echo "   Edit $ENV_FILE and fill in the real values."
  exit 1
else
  echo "🟢 All required variables set. Ready to run: docker compose up -d"
fi
