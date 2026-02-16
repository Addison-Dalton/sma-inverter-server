import { getDatabase } from '../database.js';

class DataCollector {
  constructor(inverters) {
    this.inverters = inverters;
    this.db = getDatabase();
    this.intervalId = null;
    this.isRunning = false;
    this.pollInterval = (process.env.POLL_INTERVAL_SECONDS || 30) * 1000;
    this.lastHourProcessed = null;
  }

  /**
   * Start the data collection service
   */
  start() {
    if (this.isRunning) {
      console.warn('Data collector is already running');
      return;
    }

    console.info(`Starting data collector (polling every ${this.pollInterval / 1000}s)`);
    this.isRunning = true;

    // Run immediately on start
    this.collect();

    // Then run on interval
    this.intervalId = setInterval(() => {
      this.collect();
    }, this.pollInterval);
  }

  /**
   * Stop the data collection service
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    console.info('Stopping data collector');
    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Collect data from all inverters
   */
  async collect() {
    try {
      const now = new Date();
      const currentDate = now.toISOString().split('T')[0];
      const currentHour = now.getHours();

      console.info(`Collecting data at ${now.toISOString()}`);

      // Collect data from all inverters
      const inverterData = [];
      let totalWatts = 0;
      let totalDailyYield = 0;
      let maxWatts = 0;

      for (const inverter of this.inverters) {
        try {
          // Get current watts and daily yield in parallel
          const [watts, dailyYield] = await Promise.all([
            inverter.getCurrentWatts(),
            inverter.getDailyYield()
          ]);

          inverterData.push({
            id: inverter.inverterIp,
            watts,
            dailyYield
          });

          totalWatts += watts;
          totalDailyYield += dailyYield;
          maxWatts = Math.max(maxWatts, watts);

          // Insert reading into database
          this.db.insertReading(inverter.inverterIp, watts, dailyYield);

        } catch (error) {
          console.error(`Error collecting data from inverter ${inverter.inverterIp}:`, error);
        }
      }

      console.info(`Collected: ${totalWatts}W total, ${totalDailyYield}Wh daily yield`);

      // Update daily summary
      if (totalWatts > 0) {
        const currentPeak = this.db.getDailySummary(currentDate);
        const shouldUpdatePeak = !currentPeak || totalWatts > (currentPeak.peak_watts || 0);

        this.db.updateDailySummary(
          currentDate,
          totalDailyYield,
          shouldUpdatePeak ? totalWatts : currentPeak?.peak_watts,
          shouldUpdatePeak ? Date.now() : currentPeak?.peak_time
        );
      }

      // Update hourly aggregate if we've moved to a new hour
      if (this.lastHourProcessed !== currentHour) {
        console.info(`Processing hourly aggregate for hour ${currentHour}`);
        this.db.updateHourlyAggregate(currentDate, currentHour);
        this.lastHourProcessed = currentHour;
      }

      // Clean up old data once per day (at midnight)
      if (currentHour === 0 && this.lastHourProcessed === 23) {
        console.info('Running daily cleanup');
        const retentionDays = parseInt(process.env.DATA_RETENTION_DAYS || '7');
        this.db.cleanupOldData(retentionDays);
      }

    } catch (error) {
      console.error('Error in data collection:', error);
    }
  }

  /**
   * Force hourly aggregate update
   */
  async updateCurrentHourAggregate() {
    const now = new Date();
    const currentDate = now.toISOString().split('T')[0];
    const currentHour = now.getHours();

    console.info(`Forcing hourly aggregate update for ${currentDate} hour ${currentHour}`);
    this.db.updateHourlyAggregate(currentDate, currentHour);
  }
}

let collectorInstance = null;

/**
 * Initialize and get the data collector singleton
 */
export function initDataCollector(inverters) {
  if (!collectorInstance) {
    collectorInstance = new DataCollector(inverters);
  }
  return collectorInstance;
}

/**
 * Get the data collector instance
 */
export function getDataCollector() {
  if (!collectorInstance) {
    throw new Error('Data collector not initialized. Call initDataCollector first.');
  }
  return collectorInstance;
}

export default DataCollector;
