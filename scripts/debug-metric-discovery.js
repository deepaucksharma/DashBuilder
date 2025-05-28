#!/usr/bin/env node

const https = require('https');
const dotenv = require('dotenv');

dotenv.config();

const API_KEY = process.env.NEW_RELIC_API_KEY;
const ACCOUNT_ID = process.env.NEW_RELIC_ACCOUNT_ID;

async function testMetricDiscovery() {
  const nrql = `SELECT count(*) FROM Metric SINCE 1 hour ago FACET metricName LIMIT 10`;
  
  const query = `
    query testMetricDiscovery($accountId: Int!, $nrql: Nrql!) {
      actor {
        account(id: $accountId) {
          nrql(query: $nrql) {
            results
            metadata {
              eventTypes
              facets
            }
          }
        }
      }
    }
  `;

  const payload = JSON.stringify({
    query,
    variables: {
      accountId: parseInt(ACCOUNT_ID),
      nrql
    }
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.newrelic.com',
      path: '/graphql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'API-Key': API_KEY,
        'Content-Length': payload.length
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          console.log('Raw response:', JSON.stringify(response, null, 2));
          
          if (response.data?.actor?.account?.nrql?.results) {
            console.log('\nResults:');
            response.data.actor.account.nrql.results.forEach((result, index) => {
              console.log(`Result ${index}:`, result);
            });
          }
          
          resolve(response);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

testMetricDiscovery().catch(console.error);