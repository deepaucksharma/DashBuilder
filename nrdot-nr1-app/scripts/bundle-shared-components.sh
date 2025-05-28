#!/bin/bash

# Bundle shared components into NR1 app for deployment

echo "📦 Bundling shared components into NR1 app..."

# Paths
SHARED_COMPONENTS_DIR="../shared-components"
NR1_APP_DIR="."
TARGET_DIR="$NR1_APP_DIR/lib/shared-components"

# Create target directory
echo "Creating target directory..."
mkdir -p "$TARGET_DIR"

# Copy the built files
echo "Copying built components..."
cp -r "$SHARED_COMPONENTS_DIR/dist/"* "$TARGET_DIR/"

# Copy source files for debugging
echo "Copying source files..."
mkdir -p "$TARGET_DIR/src"
cp -r "$SHARED_COMPONENTS_DIR/src/"* "$TARGET_DIR/src/"

# Create a local index.js that exports from the bundled files
cat > "$TARGET_DIR/index.js" << 'EOF'
// Re-export from the bundled distribution
module.exports = require('./dash-builder-shared.cjs.js');
EOF

# Update the import in package.json to use the bundled version
echo "Updating package.json..."
sed -i.bak 's|"@dashbuilder/shared-components": "file:../shared-components"|"@dashbuilder/shared-components": "file:./lib/shared-components"|' package.json

# Create a package.json for the bundled components
cat > "$TARGET_DIR/package.json" << EOF
{
  "name": "@dashbuilder/shared-components",
  "version": "0.3.0",
  "main": "index.js",
  "private": true
}
EOF

echo "✅ Shared components bundled successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Run the console.log cleanup script: node scripts/clean-console-logs.js"
echo "2. Convert icon.svg to icon.png (512x512)"
echo "3. Test the bundled components: npm test"
echo "4. Build the app: npm run build:webpack"
echo "5. Deploy with nr1 CLI when available"