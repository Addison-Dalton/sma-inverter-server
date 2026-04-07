import fetch from 'node-fetch';

const MAX_WATT_CALL_COUNT = 3;

class Inverter {
  inverterIp;
  httpAgent;
  sid = '';
  sidRefreshPromise = null;

  constructor(inverterIp, inverterDataId, httpAgent, sid = '') {
    this.inverterIp = inverterIp;
    this.inverterDataId = inverterDataId;
    this.httpAgent = httpAgent;
    this.sid = sid;
  }

  async setSid() {
    const response = await fetch(`https://${this.inverterIp}/dyn/login.json`, {
      method: 'POST',
      body: JSON.stringify({ right: 'usr', pass: process.env.INVERTER_PASS }),
      agent: this.httpAgent
    });
    const data = await response.json();
    if (!data?.result?.sid) {
      console.error('Unable to access sid');
      this.sid = '';
    } else {
      this.sid = data?.result?.sid;
      console.info(`Retrieved new sid: ${this.sid}`);
    }
  }

  // Ensures a valid SID exists, deduplicating concurrent refresh requests
  async ensureSid() {
    if (this.sid) return;
    if (this.sidRefreshPromise) {
      await this.sidRefreshPromise;
      return;
    }
    this.sidRefreshPromise = this.setSid().finally(() => {
      this.sidRefreshPromise = null;
    });
    await this.sidRefreshPromise;
  }

  async getCurrentWatts(retryCount = 0) {
    if (retryCount >= MAX_WATT_CALL_COUNT) {
      console.error('Unable to extract live data: max live value calls made.');
      return 0;
    }

    await this.ensureSid();

    const response = await fetch(
      `https://${this.inverterIp}/dyn/getValues.json?sid=${this.sid}`,
      {
        method: 'POST',
        body: JSON.stringify({
          destDev: [],
          keys: [process.env.INVERTER_LIVE_WATT_DATA_KEY]
        }),
        agent: this.httpAgent
      }
    );

    const data = await response.json();
    // inverterSid is stale, request new one
    if (data?.err === 401) {
      console.info('Stale sid, requesting new one');
      this.sid = '';
      return this.getCurrentWatts(retryCount + 1);
    } else {
      return this.parseWattResponseData(data);
    }
  }

  parseWattResponseData(data) {
    try {
      const watts =
        data.result[this.inverterDataId][
          process.env.INVERTER_LIVE_WATT_DATA_KEY
        ]['1'][0].val || 0;
      console.info(
        `Inverter with IP ${this.inverterIp} is currently generating ${watts}w`
      );
      return watts;
    } catch (e) {
      console.error('Unable to extract live data: error in parsing data.');
      return 0;
    }
  }

  async testConnectivity() {
    const startTime = Date.now();
    try {
      // Ensure we have a session (reuse existing one if still valid)
      await this.ensureSid();

      if (!this.sid) {
        return {
          online: false,
          error: 'Authentication failed',
          responseTimeMs: null,
          lastPing: Date.now()
        };
      }

      // Test data retrieval
      const watts = await this.getCurrentWatts();
      const responseTimeMs = Date.now() - startTime;

      return {
        online: true,
        error: null,
        responseTimeMs,
        lastPing: Date.now(),
        currentWatts: watts
      };
    } catch (error) {
      return {
        online: false,
        error: error.message,
        responseTimeMs: null,
        lastPing: Date.now()
      };
    }
  }

  async getMultipleValues(keys, retryCount = 0) {
    if (retryCount >= MAX_WATT_CALL_COUNT) {
      console.error('Unable to fetch multiple values: max call count reached.');
      return {};
    }

    await this.ensureSid();

    const response = await fetch(
      `https://${this.inverterIp}/dyn/getValues.json?sid=${this.sid}`,
      {
        method: 'POST',
        body: JSON.stringify({
          destDev: [],
          keys: keys
        }),
        agent: this.httpAgent
      }
    );

    const data = await response.json();

    // Handle stale session
    if (data?.err === 401) {
      console.info('Stale sid, requesting new one for multiple values');
      this.sid = '';
      return this.getMultipleValues(keys, retryCount + 1);
    }

    // Parse and return values for each key
    try {
      const results = {};
      for (const key of keys) {
        const keyData = data.result?.[this.inverterDataId]?.[key]?.['1']?.[0]?.val;
        if (keyData !== undefined) {
          results[key] = keyData;
        }
      }
      return results;
    } catch (e) {
      console.error('Unable to parse multiple values response:', e);
      return {};
    }
  }

  async getDailyYield(retryCount = 0) {
    if (retryCount >= MAX_WATT_CALL_COUNT) {
      console.error('Unable to fetch daily yield: max call count reached.');
      return 0;
    }

    await this.ensureSid();

    const response = await fetch(
      `https://${this.inverterIp}/dyn/getValues.json?sid=${this.sid}`,
      {
        method: 'POST',
        body: JSON.stringify({
          destDev: [],
          keys: [process.env.INVERTER_DAILY_YIELD_KEY]
        }),
        agent: this.httpAgent
      }
    );

    const data = await response.json();

    // Handle stale session
    if (data?.err === 401) {
      console.info('Stale sid, requesting new one for daily yield');
      this.sid = '';
      return this.getDailyYield(retryCount + 1);
    }

    // Parse daily yield value
    try {
      const dailyYield =
        data.result?.[this.inverterDataId]?.[
          process.env.INVERTER_DAILY_YIELD_KEY
        ]?.['1']?.[0]?.val || 0;
      console.info(
        `Inverter with IP ${this.inverterIp} daily yield: ${dailyYield}Wh`
      );
      return dailyYield;
    } catch (e) {
      console.error('Unable to extract daily yield: error in parsing data.');
      return 0;
    }
  }
}

export default Inverter;
