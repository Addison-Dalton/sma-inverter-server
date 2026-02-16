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

// Test configuration - using existing SID from logs
const INVERTER = {
  name: 'Inverter Two',
  ip: process.env.INVERTER_TWO_IP,
  dataId: process.env.INVERTER_TWO_DATA_ID,
  sid: process.env.EXISTING_SID || 's77jsV46b_v6qVY_', // Use env var or hardcoded from logs
};

console.log('Using inverter:', INVERTER.ip);
console.log('Using session ID:', INVERTER.sid);
console.log('Data ID:', INVERTER.dataId);

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
function displayResults(results) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 RESULTS`);
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
  }

  // Special focus on daily yield key
  const dailyYieldResult = results.find((r) => r.key === '6400_00262200');
  if (dailyYieldResult) {
    console.log('\n\n' + '⭐'.repeat(40));
    console.log('🎯 PRIMARY TARGET: DAILY YIELD (6400_00262200)');
    console.log('⭐'.repeat(40));
    if (dailyYieldResult.success) {
      console.log('✅ SUCCESS! This key is available.');
      console.log('\nValue:', dailyYieldResult.data);
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
  console.log('\n🔍 SMA INVERTER DATA KEY DISCOVERY (Using existing SID)');
  console.log('='.repeat(80));
  console.log(`Testing ${CANDIDATE_KEYS.length} data keys...\n`);

  const results = [];

  for (let i = 0; i < CANDIDATE_KEYS.length; i++) {
    const key = CANDIDATE_KEYS[i];
    process.stdout.write(
      `   [${i + 1}/${CANDIDATE_KEYS.length}] Testing ${key}... `
    );

    const result = await testDataKey(
      INVERTER.ip,
      INVERTER.dataId,
      INVERTER.sid,
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

  // Display results
  displayResults(results);

  console.log('\n\n' + '='.repeat(80));
  console.log('🏁 DISCOVERY COMPLETE');
  console.log('='.repeat(80));

  const sessionExpired = results.some(r => r.error === 'Session expired (401)');
  if (sessionExpired) {
    console.log('\n⚠️  Session expired. Wait for rate limit to reset, then run regular discovery script.');
  } else {
    console.log('\n💡 Next steps:');
    console.log('   1. Review the successful keys above');
    console.log('   2. Note which keys are available for implementation');
    console.log('   3. Proceed to Phase 2: Database setup\n');
  }
}

// Run the discovery script
discoverKeys().catch((error) => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
