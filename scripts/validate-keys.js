const https = require('https');
require('dotenv').config({ path: '../.env' });

function testKey(keyName, keyValue, endpoint) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.newrelic.com',
      path: endpoint,
      method: 'GET',
      headers: {
        'Api-Key': keyValue,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        console.log(`${keyName}: Status ${res.statusCode}`);
        if (res.statusCode === 200) {
          console.log('✅ Valid key');
        } else {
          console.log('❌ Invalid key');
          console.log('Response:', data.substring(0, 200));
        }
        resolve();
      });
    });

    req.on('error', (e) => {
      console.log(`${keyName}: ❌ Error - ${e.message}`);
      resolve();
    });

    req.end();
  });
}

async function validateKeys() {
  const accountId = process.env.NEW_RELIC_ACCOUNT_ID;
  const userApiKey = process.env.NEW_RELIC_USER_API_KEY;
  const queryKey = process.env.NEW_RELIC_QUERY_KEY;
  
  console.log('Validating New Relic API Keys...\n');
  console.log('Account ID:', accountId);
  console.log('\n--- Testing Keys ---\n');

  // Test User API Key with REST API
  await testKey(
    'User API Key (REST)',
    userApiKey,
    `/v2/accounts/${accountId}.json`
  );

  console.log('\n');

  // Test Query Key
  await testKey(
    'Query Key (REST)',
    queryKey,
    `/v2/accounts/${accountId}.json`
  );

  // Test with NRQL endpoint
  console.log('\n--- Testing NRQL Query ---\n');
  
  const nrqlQuery = encodeURIComponent("SELECT count(*) FROM Transaction SINCE 1 minute ago");
  const nrqlOptions = {
    hostname: 'insights-api.newrelic.com',
    path: `/v1/accounts/${accountId}/query?nrql=${nrqlQuery}`,
    method: 'GET',
    headers: {
      'X-Query-Key': queryKey,
      'Accept': 'application/json'
    }
  };

  https.request(nrqlOptions, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      console.log(`NRQL Query: Status ${res.statusCode}`);
      if (res.statusCode === 200) {
        console.log('✅ Query key works for NRQL');
        console.log('Response:', JSON.parse(data));
      } else {
        console.log('❌ Query key failed for NRQL');
        console.log('Response:', data);
      }
    });
  }).on('error', (e) => {
    console.log(`NRQL Query: ❌ Error - ${e.message}`);
  }).end();
}

validateKeys();