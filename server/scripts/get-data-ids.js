import * as dotenv from 'dotenv';
import * as https from 'https';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

// Disable certificate validation for self-signed certs
const rejectCertAgent = new https.Agent({ rejectUnauthorized: false });

const INVERTERS = [
  { name: 'Inverter One', ip: process.env.INVERTER_ONE_IP },
  // { name: 'Inverter Two', ip: process.env.INVERTER_TWO_IP },
];

/**
 * Get session ID
 */
async function getSessionId(inverterIp) {
  const response = await fetch(`https://${inverterIp}/dyn/login.json`, {
    method: 'POST',
    body: JSON.stringify({ right: 'usr', pass: process.env.INVERTER_PASS }),
    agent: rejectCertAgent,
  });
  const data = await response.json();
  return data?.result?.sid;
}

/**
 * Get data ID from inverter response
 */
async function getDataId(inverterIp, sid) {
  const response = await fetch(
    `https://${inverterIp}/dyn/getValues.json?sid=${sid}`,
    {
      method: 'POST',
      body: JSON.stringify({
        destDev: [],
        keys: ['6100_40263F00'], // Use a common key
      }),
      agent: rejectCertAgent,
    }
  );

  const data = await response.json();

  // Extract the data ID from the result object
  const resultKeys = Object.keys(data?.result || {});

  return {
    dataId: resultKeys[0],
    fullResponse: data
  };
}

/**
 * Main function
 */
async function main() {
  console.log('🔍 EXTRACTING INVERTER DATA IDs\n');
  console.log('This will help you update your .env.local file with the correct values.\n');
  console.log('='.repeat(80));

  for (const inverter of INVERTERS) {
    console.log(`\n📡 ${inverter.name} (${inverter.ip})`);
    console.log('-'.repeat(80));

    try {
      // Authenticate
      console.log('   Authenticating...');
      const sid = await getSessionId(inverter.ip);

      if (!sid) {
        console.log('   ❌ Authentication failed');
        continue;
      }

      console.log('   ✅ Authenticated');

      // Get data ID
      console.log('   Fetching data ID...');
      const { dataId, fullResponse } = await getDataId(inverter.ip, sid);

      if (dataId) {
        console.log(`   ✅ Data ID found: ${dataId}`);
        console.log('\n   📋 Add this to your .env.local file:');
        if (inverter.name.includes('One')) {
          console.log(`   INVERTER_ONE_DATA_ID="${dataId}"`);
        } else {
          console.log(`   INVERTER_TWO_DATA_ID="${dataId}"`);
        }

        console.log('\n   Raw response structure:');
        console.log('   ' + JSON.stringify(fullResponse, null, 2).split('\n').join('\n   '));
      } else {
        console.log('   ❌ Could not find data ID in response');
      }

    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }

    // Small delay between inverters
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ DONE\n');
  console.log('Next steps:');
  console.log('1. Update your server/.env.local file with the Data IDs shown above');
  console.log('2. Re-run the discovery script: node scripts/discover-keys.js');
  console.log('');
}

main().catch(console.error);
