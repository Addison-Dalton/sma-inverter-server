import fetch from 'node-fetch';

const MAX_WATT_CALL_COUNT = 3;

class Inverter {
  inverterIp;
  httpAgent;
  sid = '';
  wattCallCount = 0;

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
    }
    this.sid = data?.result?.sid;
  }

  async getCurrentWatts() {
    if (this.wattCallCount === MAX_WATT_CALL_COUNT) {
      console.error('Unable to extract live data: max live value calls made.');
      return 0;
    }

    if (!this.sid) {
      await this.setSid();
    }

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
    console.log('INVETER DATA', JSON.stringify(data, null, 2));
    // inverterSid is stale, request new one
    if (data?.err === 401) {
      this.sid = '';
      this.wattCallCount++;
      return this.getCurrentWatts();
    } else {
      return this.parseWattResponseData(data);
    }
  }

  parseWattResponseData(data) {
    try {
      const watt =
        data.result[this.inverterDataId][
          process.env.INVERTER_LIVE_WATT_DATA_KEY
        ]['1'][0].val || 0;
      this.wattCallCount = 0;
      return watt;
    } catch (e) {
      console.error('Unable to extract live data: error in parsing data.');
      return 0;
    }
  }
}

export default Inverter;
