#!/usr/bin/env node

require('dotenv').config();
const https = require('https');
const { URL } = require('url');

// Comprehensive New Relic connection tester
// Combines functionality from multiple test scripts

const ACCOUNT_ID = process.env.NEW_RELIC_ACCOUNT_ID;
const USER_API_KEY = process.env.NEW_RELIC_USER_API_KEY;
const QUERY_KEY = process.env.NEW_RELIC_QUERY_KEY;
const LICENSE_KEY = process.env.NEW_RELIC_LICENSE_KEY;
const REGION = process.env.NEW_RELIC_REGION || 'US';

console.log('New Relic Connection Test Suite\n');
console.log('Configuration:');
console.log(`  Account ID: ${ACCOUNT_ID}`);
console.log(`  Region: ${REGION}`);
console.log(`  User API Key: ${USER_API_KEY ? '✓ Set' : '✗ Missing'}`);
console.log(`  Query Key: ${QUERY_KEY ? '✓ Set' : '✗ Missing'}`);
console.log(`  License Key: ${LICENSE_KEY ? '✓ Set' : '✗ Missing'}`);
console.log('\n-----------------------------------\n');

let testsPassed = 0;
let testsFailed = 0;

async function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: data
        });
      });
    });

    req.on('error', reject);
    
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function testNerdGraph() {
  if (!USER_API_KEY) {
    console.log('⚠️  Skipping NerdGraph test - User API Key not set');
    return;
  }

  console.log('Testing NerdGraph API...');
  
  const query = `{
    actor {
      user {
        name
        email
      }
      account(id: ${ACCOUNT_ID}) {
        name
      }
    }
  }`;

  try {
    const options = {
      hostname: REGION === 'EU' ? 'api.eu.newrelic.com' : 'api.newrelic.com',
      path: '/graphql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'API-Key': USER_API_KEY
      }
    };

    const response = await makeRequest(options, JSON.stringify({ query }));
    const data = JSON.parse(response.data);

    if (response.statusCode === 200 && data.data) {
      console.log('✅ NerdGraph API: Success');
      console.log(`   User: ${data.data.actor.user.name} (${data.data.actor.user.email})`);
      if (data.data.actor.account) {
        console.log(`   Account: ${data.data.actor.account.name}`);
      }
      testsPassed++;
    } else {
      console.log('❌ NerdGraph API: Failed');
      console.log(`   Status: ${response.statusCode}`);
      console.log(`   Error: ${JSON.stringify(data.errors || data)}`);
      testsFailed++;
    }
  } catch (error) {
    console.log('❌ NerdGraph API: Error');
    console.log(`   ${error.message}`);
    testsFailed++;
  }
  console.log();
}

async function testInsightsQuery() {
  if (!QUERY_KEY) {
    console.log('⚠️  Skipping Insights Query test - Query Key not set');
    return;
  }

  console.log('Testing Insights Query API...');
  
  const nrql = encodeURIComponent('SELECT count(*) FROM Transaction SINCE 1 hour ago');
  
  try {
    const options = {
      hostname: REGION === 'EU' ? 'insights-api.eu.newrelic.com' : 'insights-api.newrelic.com',
      path: `/v1/accounts/${ACCOUNT_ID}/query?nrql=${nrql}`,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Query-Key': QUERY_KEY
      }
    };

    const response = await makeRequest(options);
    const data = JSON.parse(response.data);

    if (response.statusCode === 200 && data.results) {
      console.log('✅ Insights Query API: Success');
      console.log(`   Query returned ${data.results.length} result(s)`);
      testsPassed++;
    } else {
      console.log('❌ Insights Query API: Failed');
      console.log(`   Status: ${response.statusCode}`);
      console.log(`   Error: ${response.data}`);
      testsFailed++;
    }
  } catch (error) {
    console.log('❌ Insights Query API: Error');
    console.log(`   ${error.message}`);
    testsFailed++;
  }
  console.log();
}

async function testOTLPEndpoint() {
  if (!LICENSE_KEY) {
    console.log('⚠️  Skipping OTLP test - License Key not set');
    return;
  }

  console.log('Testing OTLP Endpoint...');
  
  const testMetric = {
    resourceMetrics: [{
      resource: {
        attributes: [{
          key: "service.name",
          value: { stringValue: "nrdot-connection-test" }
        }]
      },
      scopeMetrics: [{
        metrics: [{
          name: "test.connection",
          gauge: {
            dataPoints: [{
              asDouble: 1,
              timeUnixNano: Date.now() * 1000000
            }]
          }
        }]
      }]
    }]
  };

  try {
    const options = {
      hostname: REGION === 'EU' ? 'otlp.eu01.nr-data.net' : 'otlp.nr-data.net',
      path: '/v1/metrics',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Api-Key': LICENSE_KEY
      }
    };

    const response = await makeRequest(options, JSON.stringify(testMetric));

    if (response.statusCode === 200 || response.statusCode === 202) {
      console.log('✅ OTLP Endpoint: Success');
      console.log(`   Status: ${response.statusCode}`);
      testsPassed++;
    } else {
      console.log('❌ OTLP Endpoint: Failed');
      console.log(`   Status: ${response.statusCode}`);
      console.log(`   Response: ${response.data}`);
      testsFailed++;
    }
  } catch (error) {
    console.log('❌ OTLP Endpoint: Error');
    console.log(`   ${error.message}`);
    testsFailed++;
  }
  console.log();
}

async function testMetricAPI() {
  if (!LICENSE_KEY) {
    console.log('⚠️  Skipping Metric API test - License Key not set');
    return;
  }

  console.log('Testing Metric API...');
  
  const metricData = [{
    metrics: [{
      name: 'test.connection.metric',
      type: 'gauge',
      value: 1,
      timestamp: Math.floor(Date.now() / 1000),
      attributes: {
        'service.name': 'nrdot-connection-test'
      }
    }]
  }];

  try {
    const options = {
      hostname: REGION === 'EU' ? 'metric-api.eu.newrelic.com' : 'metric-api.newrelic.com',
      path: '/metric/v1',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Api-Key': LICENSE_KEY
      }
    };

    const response = await makeRequest(options, JSON.stringify(metricData));
    const data = JSON.parse(response.data || '{}');

    if (response.statusCode === 202) {
      console.log('✅ Metric API: Success');
      console.log(`   RequestId: ${data.requestId || 'N/A'}`);
      testsPassed++;
    } else {
      console.log('❌ Metric API: Failed');
      console.log(`   Status: ${response.statusCode}`);
      console.log(`   Response: ${response.data}`);
      testsFailed++;
    }
  } catch (error) {
    console.log('❌ Metric API: Error');
    console.log(`   ${error.message}`);
    testsFailed++;
  }
  console.log();
}

async function verifyMetricsInNRDB() {
  if (!USER_API_KEY) {
    console.log('⚠️  Skipping NRDB verification - User API Key not set');
    return;
  }

  console.log('Verifying metrics in NRDB...');
  
  const query = `{
    actor {
      account(id: ${ACCOUNT_ID}) {
        nrql(query: "SELECT count(*) FROM Metric WHERE metricName LIKE 'test.%' SINCE 5 minutes ago") {
          results
        }
      }
    }
  }`;

  try {
    const options = {
      hostname: REGION === 'EU' ? 'api.eu.newrelic.com' : 'api.newrelic.com',
      path: '/graphql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'API-Key': USER_API_KEY
      }
    };

    const response = await makeRequest(options, JSON.stringify({ query }));
    const data = JSON.parse(response.data);

    if (response.statusCode === 200 && data.data) {
      const count = data.data.actor.account.nrql.results[0].count || 0;
      if (count > 0) {
        console.log('✅ NRDB Verification: Success');
        console.log(`   Found ${count} test metric(s)`);
        testsPassed++;
      } else {
        console.log('⚠️  NRDB Verification: No test metrics found');
        console.log('   This is normal if this is the first run');
      }
    } else {
      console.log('❌ NRDB Verification: Failed');
      console.log(`   Status: ${response.statusCode}`);
      console.log(`   Error: ${JSON.stringify(data.errors || data)}`);
      testsFailed++;
    }
  } catch (error) {
    console.log('❌ NRDB Verification: Error');
    console.log(`   ${error.message}`);
    testsFailed++;
  }
  console.log();
}

async function runAllTests() {
  console.log('Starting connection tests...\n');
  
  await testNerdGraph();
  await testInsightsQuery();
  await testOTLPEndpoint();
  await testMetricAPI();
  await verifyMetricsInNRDB();
  
  console.log('-----------------------------------');
  console.log('Test Summary:');
  console.log(`  ✅ Passed: ${testsPassed}`);
  console.log(`  ❌ Failed: ${testsFailed}`);
  console.log(`  Total: ${testsPassed + testsFailed}`);
  
  if (testsFailed === 0 && testsPassed > 0) {
    console.log('\n🎉 All tests passed! Your New Relic connection is properly configured.');
    process.exit(0);
  } else if (testsPassed === 0) {
    console.log('\n❌ All tests failed. Please check your configuration.');
    process.exit(1);
  } else {
    console.log('\n⚠️  Some tests failed. Please review the errors above.');
    process.exit(1);
  }
}

// Run tests
runAllTests().catch(error => {
  console.error('\n❌ Test suite error:', error.message);
  process.exit(1);
});
