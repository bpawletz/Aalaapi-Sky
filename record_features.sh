#!/usr/bin/env bash
# ==============================================================================
# record_features.sh
# Automated Feature Video Recording Script for Aalaapi Sky (Bash / Linux / macOS)
# ==============================================================================
set -e

echo "🎬 ======================================================="
echo "🚁 Aalaapi Sky Automated Feature Video Recorder"
echo "📍 Using Default Rural Aalaapi Sky Location (41.3215, -88.9950)"
echo "🎬 ======================================================="

FEATURE="$1"

if [ -n "$FEATURE" ]; then
    if [ "$FEATURE" == "--list" ] || [ "$FEATURE" == "-l" ]; then
        node tools/record_features.js --list
        exit 0
    elif [ "$FEATURE" == "--help" ] || [ "$FEATURE" == "-h" ]; then
        node tools/record_features.js --help
        exit 0
    elif [ "$FEATURE" == "all" ] || [ "$FEATURE" == "--all" ]; then
        node tools/record_features.js --all
    else
        echo "🎥 Recording target feature: $FEATURE..."
        node tools/record_features.js "--feature=$FEATURE"
    fi
else
    echo "🎥 Recording all major application features..."
    node tools/record_features.js --all
fi

echo ""
echo "✅ Video generation finished!"
echo "📁 Output directory: recordings/ (*.webm)"
echo "🔒 Git Hygiene: Video directory is strictly gitignored."
