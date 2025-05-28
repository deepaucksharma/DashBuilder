const axios = require('axios');
require('dotenv').config({ path: '../.env' });

async function testAPI() {
  const accountId = process.env.NEW_RELIC_ACCOUNT_ID;
  const apiKey = process.env.NEW_RELIC_API_KEY;
  const userApiKey = process.env.NEW_RELIC_USER_API_KEY;
  const queryKey = process.env.NEW_RELIC_QUERY_KEY;
  
  console.log('Account ID:', accountId);
  console.log('\nTesting different API keys:\n');

  // Test 1: User API Key (NNRAK)
  console.log('1. Testing User API Key (NNRAK):', userApiKey ? `${userApiKey.substring(0, 15)}...` : 'NOT SET');
  try {
    const response = await axios.post(
      'https://api.newrelic.com/graphql',
      {
        query: `{ actor { account(id: ${accountId}) { name } } }`
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'API-Key': userApiKey
        }
      }
    );
    console.log('✅ User API Key works:', response.data);
  } catch (error) {
    console.error('❌ User API Key failed:', error.response?.data || error.message);
  }

  // Test 2: API Key (NNRAK - same as user key)
  console.log('\n2. Testing API Key (NNRAK):', apiKey ? `${apiKey.substring(0, 15)}...` : 'NOT SET');
  try {
    const response = await axios.post(
      'https://api.newrelic.com/graphql',
      {
        query: `{ actor { account(id: ${accountId}) { name } } }`
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'API-Key': apiKey
        }
      }
    );
    console.log('✅ API Key works:', response.data);
  } catch (error) {
    console.error('❌ API Key failed:', error.response?.data || error.message);
  }

  // Test 3: Query Key (NRIQ) 
  console.log('\n3. Testing Query Key (NRIQ):', queryKey ? `${queryKey.substring(0, 15)}...` : 'NOT SET');
  try {
    const response = await axios.post(
      'https://api.newrelic.com/graphql',
      {
        query: `{ actor { account(id: ${accountId}) { name } } }`
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'API-Key': queryKey
        }
      }
    );
    console.log('✅ Query Key works:', response.data);
  } catch (error) {
    console.error('❌ Query Key failed:', error.response?.data || error.message);
  }

  // Test with NerdGraph endpoint
  console.log('\n4. Testing with NerdGraph endpoint:');
  try {
    const response = await axios({
      method: 'post',
      url: 'https://api.newrelic.com/graphql',
      headers: {
        'API-Key': userApiKey,
        'Content-Type': 'application/json',
      },
      data: {
        query: `{
          actor {
            user {
              email
              name
            }
          }
        }`
      }
    });
    console.log('✅ NerdGraph works:', response.data);
  } catch (error) {
    console.error('❌ NerdGraph failed:', error.response?.data || error.message);
  }
}

testAPI();