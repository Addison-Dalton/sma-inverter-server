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
    } else {
      this.sid = data?.result?.sid;
      console.info(`Retrieved new sid: ${this.sid}`);
    }
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
    // inverterSid is stale, request new one
    if (data?.err === 401) {
      console.info('Stale sid, requesting new one');
      this.sid = '';
      this.wattCallCount++;
      return this.getCurrentWatts();
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
      this.wattCallCount = 0;
      console.info(
        `Inverter with IP ${this.inverterIp} is currently generating ${watts}w`
      );
      return watts;
    } catch (e) {
      console.error('Unable to extract live data: error in parsing data.');
      return 0;
    }
  }
}

export default Inverter;
