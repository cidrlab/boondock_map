#!/usr/bin/env bash
# Fixes the Node 25 / rollup optional-deps issues
# Run from inside the boondock/ directory: bash fix.sh
set -e

echo "🔧 Boondock Map — fixing dependencies"
echo "======================================"
echo "Node: $(node -v)  npm: $(npm -v)"
echo ""

echo "🗑️  Removing node_modules and package-lock.json..."
rm -rf node_modules package-lock.json

echo "📦 Clean install..."
npm install

echo ""
echo "✅ Done! Launch the app with:"
echo "   npm run dev"
