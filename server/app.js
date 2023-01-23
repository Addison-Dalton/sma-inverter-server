import * as dotenv from 'dotenv';
import * as https from 'https';
import express from 'express';

import Inverter from './inverter.js';

dotenv.config({ path: '.env.local' });
// inverters have a self-hosted cert, so need to disable rejection of unauthorized certs
const rejectCertAgent = new https.Agent({ rejectUnauthorized: false });
const app = express();

const inverterOne = new Inverter(
  process.env.INVERTER_ONE_IP,
  process.env.INVERTER_ONE_DATA_ID,
  rejectCertAgent
);
const inverterTwo = new Inverter(
  process.env.INVERTER_TWO_IP,
  process.env.INVERTER_TWO_DATA_ID,
  rejectCertAgent
);

app.listen(process.env.PORT, async () => {
  console.log(`Listening on port ${process.env.PORT}`);
});

app.get('/live/watts', async (req, res) => {
  const watts = await getWattsFromInverters([inverterOne, inverterTwo]);
  res.status(200).send({
    watts: watts
  });
});

const getWattsFromInverters = async (inverters) => {
  let totalWatts = 0;

  for (let i = 0; i <= inverters.length; i++) {
    const watts = (await inverters[i]?.getCurrentWatts()) || 0;
    totalWatts += watts;
  }

  return totalWatts;
};
