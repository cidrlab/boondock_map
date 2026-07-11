#!/usr/bin/env bash
# Boondock Map — first-time setup on macOS
# Run once: bash setup.sh
set -e

echo "🏕️  Boondock Map setup"
echo "========================"

# Check Node
if ! command -v node &>/dev/null; then
  echo "❌ Node.js not found. Install via: brew install node"
  exit 1
fi

NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VER" -lt 18 ]; then
  echo "❌ Node 18+ required (found $NODE_VER). Run: brew install node"
  exit 1
fi

echo "✓ Node $(node -v)"
echo "✓ npm $(npm -v)"

# Install dependencies (all pure JS — sql.js is WASM, no native compile needed)
echo ""
echo "📦 Installing dependencies…"
npm install

echo ""
echo "✅ Setup complete!"
echo ""
echo "To launch the app:"
echo "  npm run dev"
echo ""
echo "Your iCloud sync folder:"
echo "  ~/Library/Mobile Documents/com~apple~CloudDocs/BoondockMap/"
echo ""
echo "Waypoints saved there sync automatically to your iPhone"
echo "once you build the iOS companion app."
