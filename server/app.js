import * as dotenv from 'dotenv';
import * as https from 'https';
import express from 'express';

import Inverter from './inverter.js';
import { getDatabase } from './database.js';
import { initDataCollector } from './services/dataCollector.js';

dotenv.config({ path: '.env.local' });
// inverters have a self-hosted cert, so need to disable rejection of unauthorized certs
const rejectCertAgent = new https.Agent({ rejectUnauthorized: false });
const app = express();

// Initialize database
const db = getDatabase();

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

const inverters = [inverterOne, inverterTwo];

// Initialize and start data collector
const dataCollector = initDataCollector(inverters);

app.listen(process.env.PORT, async () => {
  console.log(`Listening on port ${process.env.PORT}`);

  // Start data collection
  dataCollector.start();
  console.log('Data collector started');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  dataCollector.stop();
  db.close();
  process.exit(0);
});

app.get('/live/watts', async (req, res) => {
  const watts = await getWattsFromInverters([inverterOne, inverterTwo]);
  res.status(200).send({
    watts: watts
  });
});

app.get('/health/inverters', async (req, res) => {
  console.info('Health check requested');

  const inverterOneHealth = await inverterOne.testConnectivity();
  const inverterTwoHealth = await inverterTwo.testConnectivity();

  const allOnline = inverterOneHealth.online && inverterTwoHealth.online;
  const anyOnline = inverterOneHealth.online || inverterTwoHealth.online;

  const status = allOnline ? 'healthy' : anyOnline ? 'degraded' : 'down';

  res.status(200).send({
    status,
    inverters: {
      one: {
        online: inverterOneHealth.online,
        lastPing: inverterOneHealth.lastPing,
        responseTimeMs: inverterOneHealth.responseTimeMs,
        error: inverterOneHealth.error,
        currentWatts: inverterOneHealth.currentWatts
      },
      two: {
        online: inverterTwoHealth.online,
        lastPing: inverterTwoHealth.lastPing,
        responseTimeMs: inverterTwoHealth.responseTimeMs,
        error: inverterTwoHealth.error,
        currentWatts: inverterTwoHealth.currentWatts
      }
    }
  });
});

// New endpoint: Get current live data with daily totals
app.get('/api/live', async (req, res) => {
  try {
    const inverterData = [];
    let totalWatts = 0;
    let totalDailyYield = 0;

    for (const inverter of inverters) {
      const [watts, dailyYield] = await Promise.all([
        inverter.getCurrentWatts(),
        inverter.getDailyYield()
      ]);

      inverterData.push({
        id: inverter.inverterIp,
        watts: watts,
        dailyYieldWh: dailyYield,
        status: 'online'
      });

      totalWatts += watts;
      totalDailyYield += dailyYield;
    }

    res.status(200).send({
      timestamp: Date.now(),
      currentWatts: totalWatts,
      dailyYieldWh: totalDailyYield,
      dailyYieldKwh: (totalDailyYield / 1000).toFixed(1),
      inverters: inverterData
    });
  } catch (error) {
    console.error('Error fetching live data:', error);
    res.status(500).send({ error: 'Failed to fetch live data' });
  }
});

// New endpoint: Get daily statistics with hourly data for graphing
app.get('/api/daily/stats', async (req, res) => {
  try {
    const currentDate = new Date().toISOString().split('T')[0];

    // Force update current hour's aggregate before fetching
    dataCollector.updateCurrentHourAggregate();

    const stats = db.getCurrentDayStats(currentDate);

    // Format peak time as HH:MM if available
    let peakTimeFormatted = null;
    if (stats.peakTime) {
      const peakDate = new Date(stats.peakTime);
      peakTimeFormatted = peakDate.toTimeString().substring(0, 5);
    }

    res.status(200).send({
      date: stats.date,
      currentWatts: stats.currentWatts,
      totalYieldWh: stats.totalYieldWh,
      totalYieldKwh: stats.totalYieldKwh,
      peakWatts: stats.peakWatts,
      peakTime: peakTimeFormatted,
      hourlyData: stats.hourlyData,
      inverters: stats.inverters
    });
  } catch (error) {
    console.error('Error fetching daily stats:', error);
    res.status(500).send({ error: 'Failed to fetch daily stats' });
  }
});

const getWattsFromInverters = async (inverters) => {
  let totalWatts = 0;

  for (let i = 0; i <= inverters.length; i++) {
    const watts = (await inverters[i]?.getCurrentWatts()) || 0;
    totalWatts += watts;
  }

  return totalWatts;
};
