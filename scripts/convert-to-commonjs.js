#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

async function convertFile(filePath) {
  console.log(`Converting ${filePath}...`);
  
  let content = await fs.readFile(filePath, 'utf8');
  
  // Convert import statements to require
  content = content.replace(/import\s+(.+?)\s+from\s+['"](.*?)['"]/g, (match, imports, module) => {
    // Handle default imports
    if (!imports.includes('{')) {
      return `const ${imports} = require('${module}')`;
    }
    
    // Handle named imports
    const cleanImports = imports.replace(/\s+as\s+/g, ': ');
    return `const ${cleanImports} = require('${module}')`;
  });
  
  // Convert export class/function to class/function + module.exports
  content = content.replace(/export\s+(class|function)\s+(\w+)/g, '$1 $2');
  
  // Convert export const/let/var
  content = content.replace(/export\s+(const|let|var)\s+/g, '$1 ');
  
  // Convert export default
  content = content.replace(/export\s+default\s+/g, 'module.exports = ');
  
  // Convert export { ... }
  content = content.replace(/export\s*\{([^}]+)\}/g, (match, exports) => {
    const exportList = exports.split(',').map(e => e.trim());
    const exportPairs = exportList.map(e => {
      if (e.includes(' as ')) {
        const [local, exported] = e.split(' as ').map(s => s.trim());
        return `  ${exported}: ${local}`;
      }
      return `  ${e}`;
    });
    return `module.exports = {\n${exportPairs.join(',\n')}\n}`;
  });
  
  // Check if we need to add module.exports for classes/functions
  const hasClass = content.match(/^class\s+(\w+)/m);
  const hasFunction = content.match(/^function\s+(\w+)/m);
  const hasModuleExports = content.includes('module.exports');
  
  if ((hasClass || hasFunction) && !hasModuleExports) {
    // Extract all class and function names
    const classNames = [...content.matchAll(/^class\s+(\w+)/gm)].map(m => m[1]);
    const functionNames = [...content.matchAll(/^function\s+(\w+)/gm)].map(m => m[1]);
    const allExports = [...classNames, ...functionNames];
    
    if (allExports.length > 0) {
      content += `\n\nmodule.exports = {\n  ${allExports.join(',\n  ')}\n};`;
    }
  }
  
  await fs.writeFile(filePath, content);
  console.log(`✓ Converted ${filePath}`);
}

async function convertDirectory(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      await convertDirectory(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      await convertFile(fullPath);
    }
  }
}

async function main() {
  const targetDirs = [
    '/Users/deepaksharma/DashBuilder/scripts/src/services',
    '/Users/deepaksharma/DashBuilder/scripts/src/commands'
  ];
  
  for (const dir of targetDirs) {
    console.log(`\nConverting files in ${dir}...`);
    await convertDirectory(dir);
  }
  
  console.log('\n✅ Conversion complete!');
}

main().catch(console.error);