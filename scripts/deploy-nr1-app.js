#!/usr/bin/env node

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ACCOUNT_ID = process.env.NEW_RELIC_ACCOUNT_ID;
const USER_API_KEY = process.env.NEW_RELIC_USER_API_KEY;
const REGION = process.env.NEW_RELIC_REGION || 'US';

if (!ACCOUNT_ID || !USER_API_KEY) {
  console.error('Missing required environment variables: NEW_RELIC_ACCOUNT_ID or NEW_RELIC_USER_API_KEY');
  process.exit(1);
}

// NR1 app configuration
const NR1_APP_PATH = path.join(__dirname, '..', 'nrdot-nr1-app');
const PACKAGE_JSON_PATH = path.join(NR1_APP_PATH, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
const APP_UUID = packageJson.nr1.uuid;
const APP_NAME = packageJson.name;
const APP_VERSION = packageJson.version;

console.log(`Deploying ${APP_NAME} v${APP_VERSION} (UUID: ${APP_UUID})`);

// Build the app using webpack
async function buildApp() {
  console.log('Building NR1 app...');
  
  // Since we don't have nr1 CLI, we'll use webpack directly
  const webpackConfig = `
const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: 'production',
  entry: {
    'overview': './nerdlets/overview/index.js',
    'console': './nerdlets/console/index.js'
  },
  output: {
    filename: '[name]/index.js',
    path: path.resolve(__dirname, 'dist')
  },
  module: {
    rules: [
      {
        test: /\\.jsx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-react']
          }
        }
      },
      {
        test: /\\.scss$/,
        use: ['style-loader', 'css-loader', 'sass-loader']
      }
    ]
  },
  resolve: {
    extensions: ['.js', '.jsx']
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'nr1.json' },
        { from: 'catalog', to: 'catalog' },
        { from: 'launchers', to: 'launchers' },
        { from: 'nerdlets/overview/nr1.json', to: 'overview/nr1.json' },
        { from: 'nerdlets/console/nr1.json', to: 'console/nr1.json' }
      ]
    })
  ],
  externals: {
    'react': 'React',
    'react-dom': 'ReactDOM',
    'prop-types': 'PropTypes'
  }
};
`;

  fs.writeFileSync(path.join(NR1_APP_PATH, 'webpack.config.js'), webpackConfig);

  // Install build dependencies
  console.log('Installing build dependencies...');
  await execPromise('npm install --save-dev webpack webpack-cli babel-loader @babel/core @babel/preset-react copy-webpack-plugin style-loader css-loader sass-loader --legacy-peer-deps', { cwd: NR1_APP_PATH });

  // Run webpack build
  console.log('Running webpack build...');
  await execPromise('npx webpack', { cwd: NR1_APP_PATH });
  
  console.log('Build completed successfully!');
}

// Deploy to New Relic using GraphQL API
async function deployApp() {
  console.log('Deploying to New Relic...');
  
  // Create deployment package
  const distPath = path.join(NR1_APP_PATH, 'dist');
  if (!fs.existsSync(distPath)) {
    throw new Error('Build output not found. Run build first.');
  }

  // Package the app
  const packageData = {
    uuid: APP_UUID,
    name: APP_NAME,
    version: APP_VERSION,
    accountId: ACCOUNT_ID
  };

  // Deploy using GraphQL mutation
  const mutation = `
    mutation {
      nerdpackPublish(
        accountId: ${ACCOUNT_ID}
        nerdpackId: "${APP_UUID}"
        version: "${APP_VERSION}"
      ) {
        success
        errors
      }
    }
  `;

  const apiEndpoint = REGION === 'EU' ? 'api.eu.newrelic.com' : 'api.newrelic.com';
  
  const options = {
    hostname: apiEndpoint,
    path: '/graphql',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'API-Key': USER_API_KEY
    }
  };

  const response = await makeRequest(options, JSON.stringify({ query: mutation }));
  console.log('Deployment response:', response);
  
  console.log('Deployment completed!');
  console.log(`Access your app at: https://one.newrelic.com/launcher/${APP_UUID}`);
}

// Helper functions
function execPromise(command, options = {}) {
  return new Promise((resolve, reject) => {
    exec(command, options, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error: ${error.message}`);
        reject(error);
        return;
      }
      if (stderr) {
        console.error(`stderr: ${stderr}`);
      }
      resolve(stdout);
    });
  });
}

function makeRequest(options, data) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(responseData));
        } catch (e) {
          resolve(responseData);
        }
      });
    });
    
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Main execution
async function main() {
  try {
    await buildApp();
    await deployApp();
  } catch (error) {
    console.error('Deployment failed:', error);
    process.exit(1);
  }
}

main();