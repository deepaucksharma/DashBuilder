const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

describe('NRDOT End-to-End Flow', () => {
  const rootDir = path.join(__dirname, '../../../..');
  
  // Helper to run shell commands
  const runCommand = (command, args = []) => {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, { 
        cwd: rootDir,
        shell: true 
      });
      
      let stdout = '';
      let stderr = '';
      
      proc.stdout.on('data', (data) => { stdout += data; });
      proc.stderr.on('data', (data) => { stderr += data; });
      
      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
        } else {
          resolve({ stdout, stderr });
        }
      });
    });
  };

  describe('Configuration Validation', () => {
    test('should validate correct NRDOT configuration', async () => {
      const configPath = path.join(rootDir, 'configs/collector-comprehensive.yaml');
      const configExists = await fs.access(configPath).then(() => true).catch(() => false);
      
      expect(configExists).toBe(true);
      
      // Validate YAML structure
      const { stdout } = await runCommand('yq', ['eval', '.', configPath]);
      expect(stdout).toBeTruthy();
    });

    test('should validate optimization profiles', async () => {
      const profilesPath = path.join(rootDir, 'configs/collector-profiles');
      const profiles = await fs.readdir(profilesPath);
      
      expect(profiles).toContain('aggressive.yaml');
      expect(profiles).toContain('balanced.yaml');
      expect(profiles).toContain('conservative.yaml');
    });
  });

  describe('Docker Environment', () => {
    test('should have valid docker-compose configuration', async () => {
      const { stdout } = await runCommand('docker-compose', ['config']);
      expect(stdout).toContain('services:');
      expect(stdout).toContain('nrdot');
    });

    test('should have monitoring stack configured', async () => {
      const { stdout } = await runCommand('docker-compose', ['-f', 'docker-compose.observability.yml', 'config']);
      expect(stdout).toContain('prometheus');
      expect(stdout).toContain('grafana');
    });
  });

  describe('Script Functionality', () => {
    test('should generate metrics in correct format', async () => {
      const testMetricsPath = path.join(rootDir, 'test-metrics-format.js');
      const exists = await fs.access(testMetricsPath).then(() => true).catch(() => false);
      
      if (exists) {
        const { stdout } = await runCommand('node', [testMetricsPath]);
        // Verify metrics format
        expect(stdout).toMatch(/nrdot_process_series_total/);
      }
    });
  });

  describe('Control Loop', () => {
    test('should have enhanced control loop script', async () => {
      const controlLoopPath = path.join(rootDir, 'scripts/control-loop-enhanced.js');
      const exists = await fs.access(controlLoopPath).then(() => true).catch(() => false);
      
      expect(exists).toBe(true);
      
      // Verify script syntax
      const { stdout, stderr } = await runCommand('node', ['--check', controlLoopPath]);
      expect(stderr).toBe('');
    });
  });
});