import * as dotenv from 'dotenv';
import * as https from 'https';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from server/.env.local
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

// Disable certificate validation for self-signed certs
const rejectCertAgent = new https.Agent({ rejectUnauthorized: false });

// Get the current working key from environment
const CURRENT_WORKING_KEY = process.env.INVERTER_LIVE_WATT_DATA_KEY;

// Candidate data keys from SMA inverter documentation
const CANDIDATE_KEYS = [
  // Test current working key first (if available)
  ...(CURRENT_WORKING_KEY ? [CURRENT_WORKING_KEY] : []),
  '6400_00262200', // Daily yield (Wh) - PRIMARY TARGET
  '6400_00260100', // Current power (W)
  '6100_40263F00', // Power total (W)
  '6400_00462400', // Total lifetime yield (Wh)
  '6400_00462500', // Absorbed energy (Wh)
  '6400_00462300', // Feed-in time
  '6400_00462600', // Operating time
  '6380_40251E00', // Grid frequency
  '6380_40451F00', // Voltage phase A
  '6380_40452100', // Voltage phase B
  '6380_40452200', // Voltage phase C
];

// Test configuration
const INVERTERS = [
  // Temporarily skip Inverter One due to 503 rate limiting
  // {
  //   name: 'Inverter One',
  //   ip: process.env.INVERTER_ONE_IP,
  //   dataId: process.env.INVERTER_ONE_DATA_ID,
  // },
  {
    name: 'Inverter Two',
    ip: process.env.INVERTER_TWO_IP,
    dataId: process.env.INVERTER_TWO_DATA_ID,
  },
];

console.log("inverters", INVERTERS);

/**
 * Authenticate with an inverter and get session ID
 */
async function getSessionId(inverterIp) {
  try {
    console.log(`\n🔐 Authenticating with inverter at ${inverterIp}...`);
    const response = await fetch(`https://${inverterIp}/dyn/login.json`, {
      method: 'POST',
      body: JSON.stringify({ right: 'usr', pass: process.env.INVERTER_PASS }),
      agent: rejectCertAgent,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (!data?.result?.sid) {
      throw new Error('No session ID in response');
    }

    console.log(`✅ Authenticated successfully. Session ID: ${data.result.sid}`);
    return data.result.sid;
  } catch (error) {
    console.error(`❌ Authentication failed: ${error.message}`);
    return null;
  }
}

/**
 * Test a data key and return the response
 */
async function testDataKey(inverterIp, inverterDataId, sid, key) {
  try {
    const response = await fetch(
      `https://${inverterIp}/dyn/getValues.json?sid=${sid}`,
      {
        method: 'POST',
        body: JSON.stringify({
          destDev: [],
          keys: [key],
        }),
        agent: rejectCertAgent,
      }
    );

    if (!response.ok) {
      return {
        key,
        success: false,
        error: `HTTP ${response.status}`,
      };
    }

    const data = await response.json();

    // Check for authentication error
    if (data?.err === 401) {
      return {
        key,
        success: false,
        error: 'Session expired (401)',
      };
    }

    // Try to extract data using the inverter data ID
    const keyData = data?.result?.[inverterDataId]?.[key];

    if (keyData) {
      return {
        key,
        success: true,
        data: keyData,
        fullResponse: data,
      };
    } else {
      return {
        key,
        success: false,
        error: 'Key not found in response',
        fullResponse: data,
      };
    }
  } catch (error) {
    return {
      key,
      success: false,
      error: error.message,
    };
  }
}

/**
 * Format and display test results
 */
function displayResults(inverterName, results) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 RESULTS FOR ${inverterName.toUpperCase()}`);
  console.log(`${'='.repeat(80)}\n`);

  const successfulKeys = results.filter((r) => r.success);
  const failedKeys = results.filter((r) => !r.success);

  console.log(`✅ Successful: ${successfulKeys.length}/${results.length}`);
  console.log(`❌ Failed: ${failedKeys.length}/${results.length}\n`);

  if (successfulKeys.length > 0) {
    console.log('SUCCESSFUL KEYS:');
    console.log('-'.repeat(80));
    successfulKeys.forEach((result) => {
      console.log(`\n🔑 Key: ${result.key}`);
      console.log(`   Data structure:`);
      console.log(`   ${JSON.stringify(result.data, null, 2).split('\n').join('\n   ')}`);
    });
  }

  if (failedKeys.length > 0) {
    console.log('\n\nFAILED KEYS:');
    console.log('-'.repeat(80));
    failedKeys.forEach((result) => {
      console.log(`\n❌ Key: ${result.key}`);
      console.log(`   Error: ${result.error}`);
    });

    // Show raw response for first failed key to help debug
    const firstFailed = failedKeys[0];
    if (firstFailed?.fullResponse) {
      console.log('\n\n📋 RAW RESPONSE SAMPLE (first failed key):');
      console.log('-'.repeat(80));
      console.log(JSON.stringify(firstFailed.fullResponse, null, 2));
    }
  }

  // Special focus on daily yield key
  const dailyYieldResult = results.find((r) => r.key === '6400_00262200');
  if (dailyYieldResult) {
    console.log('\n\n' + '⭐'.repeat(40));
    console.log('🎯 PRIMARY TARGET: DAILY YIELD (6400_00262200)');
    console.log('⭐'.repeat(40));
    if (dailyYieldResult.success) {
      console.log('✅ SUCCESS! This key is available.');
      console.log('\nFull response structure:');
      console.log(JSON.stringify(dailyYieldResult.fullResponse, null, 2));
    } else {
      console.log(`❌ FAILED: ${dailyYieldResult.error}`);
      console.log('⚠️  Will need to use fallback integration calculation.');
    }
  }
}

/**
 * Main discovery function
 */
async function discoverKeys() {
  console.log('🔍 SMA INVERTER DATA KEY DISCOVERY SCRIPT');
  console.log('=========================================\n');
  console.log(`Testing ${CANDIDATE_KEYS.length} data keys on ${INVERTERS.length} inverters...\n`);

  // Check environment variables
  if (
    !process.env.INVERTER_ONE_IP ||
    !process.env.INVERTER_TWO_IP ||
    !process.env.INVERTER_PASS
  ) {
    console.error(
      '❌ Error: Missing required environment variables in .env.local'
    );
    console.error('   Required: INVERTER_ONE_IP, INVERTER_TWO_IP, INVERTER_PASS');
    process.exit(1);
  }

  for (const inverter of INVERTERS) {
    console.log(`\n${'#'.repeat(80)}`);
    console.log(`# Testing: ${inverter.name} (${inverter.ip})`);
    console.log(`${'#'.repeat(80)}`);

    // Authenticate
    const sid = await getSessionId(inverter.ip);
    if (!sid) {
      console.error(
        `\n❌ Skipping ${inverter.name} - authentication failed\n`
      );
      continue;
    }

    // Test each key
    console.log(`\n📋 Testing ${CANDIDATE_KEYS.length} keys...`);
    const results = [];

    for (let i = 0; i < CANDIDATE_KEYS.length; i++) {
      const key = CANDIDATE_KEYS[i];
      process.stdout.write(
        `   [${i + 1}/${CANDIDATE_KEYS.length}] Testing ${key}... `
      );

      const result = await testDataKey(
        inverter.ip,
        inverter.dataId,
        sid,
        key
      );
      results.push(result);

      if (result.success) {
        console.log('✅');
      } else {
        console.log(`❌ (${result.error})`);
      }

      // Small delay to avoid overwhelming the inverter
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Display results for this inverter
    displayResults(inverter.name, results);
  }

  console.log('\n\n' + '='.repeat(80));
  console.log('🏁 DISCOVERY COMPLETE');
  console.log('='.repeat(80));
  console.log('\n💡 Next steps:');
  console.log('   1. Review the successful keys above');
  console.log(
    '   2. Update INVERTER_DAILY_YIELD_KEY in .env.local if daily yield is available'
  );
  console.log('   3. Note any other useful keys for future features');
  console.log(
    '   4. Proceed to Phase 2: Database setup\n'
  );
}

// Run the discovery script
discoverKeys().catch((error) => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
