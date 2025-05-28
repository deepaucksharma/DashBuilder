#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Directories to process
const directories = ['nerdlets', 'lib'];

// Track changes
let filesModified = 0;
let logsRemoved = 0;

// Function to process a file
function processFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Pattern to match console.log statements
  // This handles multi-line console.log statements too
  const consoleLogPattern = /console\s*\.\s*log\s*\([^;]*\);?/g;
  
  // Count matches
  const matches = content.match(consoleLogPattern);
  if (!matches) return;
  
  // Replace console.log with a comment or remove entirely
  let newContent = content;
  
  // Option 1: Comment out (safer for debugging)
  // newContent = newContent.replace(consoleLogPattern, '// $&');
  
  // Option 2: Remove entirely
  newContent = newContent.replace(consoleLogPattern, '');
  
  // Clean up any resulting empty lines
  newContent = newContent.replace(/^\s*\n/gm, '\n');
  
  // Write back only if changes were made
  if (newContent !== content) {
    fs.writeFileSync(filePath, newContent, 'utf8');
    filesModified++;
    logsRemoved += matches.length;
    console.log(`✓ Cleaned ${matches.length} console.log(s) from ${filePath}`);
  }
}

// Function to recursively process directories
function processDirectory(dir) {
  const items = fs.readdirSync(dir);
  
  items.forEach(item => {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
      processDirectory(fullPath);
    } else if (stat.isFile() && (item.endsWith('.js') || item.endsWith('.jsx'))) {
      processFile(fullPath);
    }
  });
}

// Main execution
console.log('🧹 Cleaning console.log statements...\n');

directories.forEach(dir => {
  const dirPath = path.join(__dirname, '..', dir);
  if (fs.existsSync(dirPath)) {
    console.log(`Processing ${dir}/...`);
    processDirectory(dirPath);
  }
});

console.log(`\n✅ Complete! Modified ${filesModified} files and removed ${logsRemoved} console.log statements.`);

// Also report any console.error, console.warn that might need attention
console.log('\n📊 Other console statements to review:');
directories.forEach(dir => {
  const dirPath = path.join(__dirname, '..', dir);
  if (fs.existsSync(dirPath)) {
    const warnCount = require('child_process')
      .execSync(`grep -r "console\\.\\(error\\|warn\\)" ${dirPath} --include="*.js" --include="*.jsx" 2>/dev/null | wc -l`)
      .toString().trim();
    if (parseInt(warnCount) > 0) {
      console.log(`  - ${dir}: ${warnCount} console.error/warn statements`);
    }
  }
});

console.log('\n💡 Tip: Consider using a proper logging service for production.');