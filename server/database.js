import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class SolarDatabase {
  constructor(dbPath = process.env.DB_PATH || './data/solar.db') {
    // Ensure data directory exists
    const dataDir = path.dirname(dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      console.info(`Created database directory: ${dataDir}`);
    }

    // Initialize SQLite database
    this.db = new Database(dbPath, { verbose: console.log });
    console.info(`Database initialized at: ${dbPath}`);

    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');

    // Create tables if they don't exist
    this.initializeTables();
  }

  initializeTables() {
    console.info('Initializing database tables...');

    // Table for raw energy readings from inverters
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS energy_readings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        inverter_id TEXT NOT NULL,
        current_watts INTEGER DEFAULT 0,
        daily_yield_wh INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (strftime('%s','now') * 1000)
      );
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_timestamp
      ON energy_readings(timestamp);
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_inverter_timestamp
      ON energy_readings(inverter_id, timestamp);
    `);

    // Table for hourly aggregated data (for graphing)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS hourly_aggregates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        hour INTEGER NOT NULL,
        avg_watts INTEGER DEFAULT 0,
        max_watts INTEGER DEFAULT 0,
        readings_count INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
        UNIQUE(date, hour)
      );
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_date_hour
      ON hourly_aggregates(date, hour);
    `);

    // Table for daily summaries
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS daily_summaries (
        date TEXT PRIMARY KEY,
        total_yield_wh INTEGER NOT NULL,
        peak_watts INTEGER DEFAULT 0,
        peak_time INTEGER,
        created_at INTEGER DEFAULT (strftime('%s','now') * 1000)
      );
    `);

    console.info('Database tables initialized successfully');
  }

  /**
   * Insert a new energy reading
   */
  insertReading(inverterId, currentWatts, dailyYieldWh) {
    const stmt = this.db.prepare(`
      INSERT INTO energy_readings (timestamp, inverter_id, current_watts, daily_yield_wh)
      VALUES (?, ?, ?, ?)
    `);

    const timestamp = Date.now();
    return stmt.run(timestamp, inverterId, currentWatts, dailyYieldWh);
  }

  /**
   * Get readings for a specific time range
   */
  getReadings(startTime, endTime, inverterId = null) {
    let query = `
      SELECT * FROM energy_readings
      WHERE timestamp BETWEEN ? AND ?
    `;

    const params = [startTime, endTime];

    if (inverterId) {
      query += ' AND inverter_id = ?';
      params.push(inverterId);
    }

    query += ' ORDER BY timestamp ASC';

    const stmt = this.db.prepare(query);
    return stmt.all(...params);
  }

  /**
   * Get the most recent reading
   */
  getLatestReading(inverterId = null) {
    let query = 'SELECT * FROM energy_readings';

    if (inverterId) {
      query += ' WHERE inverter_id = ?';
    }

    query += ' ORDER BY timestamp DESC LIMIT 1';

    const stmt = this.db.prepare(query);
    return inverterId ? stmt.get(inverterId) : stmt.get();
  }

  /**
   * Update or insert hourly aggregate data
   */
  updateHourlyAggregate(date, hour) {
    // Calculate aggregates from raw readings for this hour
    const startOfHour = new Date(date + 'T' + String(hour).padStart(2, '0') + ':00:00').getTime();
    const endOfHour = startOfHour + 60 * 60 * 1000;

    const stats = this.db.prepare(`
      SELECT
        AVG(current_watts) as avg_watts,
        MAX(current_watts) as max_watts,
        COUNT(*) as readings_count
      FROM energy_readings
      WHERE timestamp BETWEEN ? AND ?
    `).get(startOfHour, endOfHour);

    if (!stats || stats.readings_count === 0) {
      return null;
    }

    // Upsert the hourly aggregate
    const stmt = this.db.prepare(`
      INSERT INTO hourly_aggregates (date, hour, avg_watts, max_watts, readings_count)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(date, hour) DO UPDATE SET
        avg_watts = excluded.avg_watts,
        max_watts = excluded.max_watts,
        readings_count = excluded.readings_count,
        created_at = strftime('%s','now') * 1000
    `);

    return stmt.run(
      date,
      hour,
      Math.round(stats.avg_watts || 0),
      stats.max_watts || 0,
      stats.readings_count
    );
  }

  /**
   * Get hourly aggregates for a specific date
   */
  getHourlyAggregates(date) {
    const stmt = this.db.prepare(`
      SELECT * FROM hourly_aggregates
      WHERE date = ?
      ORDER BY hour ASC
    `);

    return stmt.all(date);
  }

  /**
   * Update daily summary
   */
  updateDailySummary(date, totalYieldWh, peakWatts = null, peakTime = null) {
    const stmt = this.db.prepare(`
      INSERT INTO daily_summaries (date, total_yield_wh, peak_watts, peak_time)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        total_yield_wh = excluded.total_yield_wh,
        peak_watts = CASE
          WHEN excluded.peak_watts > peak_watts OR peak_watts IS NULL
          THEN excluded.peak_watts
          ELSE peak_watts
        END,
        peak_time = CASE
          WHEN excluded.peak_watts > peak_watts OR peak_watts IS NULL
          THEN excluded.peak_time
          ELSE peak_time
        END,
        created_at = strftime('%s','now') * 1000
    `);

    return stmt.run(date, totalYieldWh, peakWatts, peakTime);
  }

  /**
   * Get daily summary for a specific date
   */
  getDailySummary(date) {
    const stmt = this.db.prepare(`
      SELECT * FROM daily_summaries
      WHERE date = ?
    `);

    return stmt.get(date);
  }

  /**
   * Get current day's statistics (from readings + daily summary)
   */
  getCurrentDayStats(date) {
    // Get latest readings for current watts
    const latestReadings = this.db.prepare(`
      SELECT
        inverter_id,
        current_watts,
        daily_yield_wh,
        timestamp
      FROM energy_readings
      WHERE id IN (
        SELECT MAX(id)
        FROM energy_readings
        GROUP BY inverter_id
      )
    `).all();

    // Get daily summary
    const summary = this.getDailySummary(date);

    // Calculate totals from latest readings
    const currentWatts = latestReadings.reduce((sum, r) => sum + (r.current_watts || 0), 0);
    const dailyYieldWh = latestReadings.reduce((sum, r) => sum + (r.daily_yield_wh || 0), 0);

    // Get hourly data for graph
    const hourlyData = this.getHourlyAggregates(date);

    return {
      date,
      currentWatts,
      totalYieldWh: dailyYieldWh,
      totalYieldKwh: (dailyYieldWh / 1000).toFixed(1),
      peakWatts: summary?.peak_watts || 0,
      peakTime: summary?.peak_time,
      hourlyData: hourlyData.map(h => ({
        hour: h.hour,
        avgWatts: h.avg_watts,
        maxWatts: h.max_watts
      })),
      inverters: latestReadings.map(r => ({
        id: r.inverter_id,
        watts: r.current_watts,
        dailyYieldWh: r.daily_yield_wh,
        timestamp: r.timestamp
      }))
    };
  }

  /**
   * Clean up old data based on retention policy
   */
  cleanupOldData(retentionDays = 7) {
    const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);

    // Delete old energy readings
    const deletedReadings = this.db.prepare(`
      DELETE FROM energy_readings
      WHERE timestamp < ?
    `).run(cutoffTime);

    console.info(`Cleaned up ${deletedReadings.changes} old energy readings`);

    // Clean up old hourly aggregates (30 days retention)
    const cutoffDate = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000))
      .toISOString()
      .split('T')[0];

    const deletedAggregates = this.db.prepare(`
      DELETE FROM hourly_aggregates
      WHERE date < ?
    `).run(cutoffDate);

    console.info(`Cleaned up ${deletedAggregates.changes} old hourly aggregates`);

    // Clean up old daily summaries (1 year retention)
    const yearCutoff = new Date(Date.now() - (365 * 24 * 60 * 60 * 1000))
      .toISOString()
      .split('T')[0];

    const deletedSummaries = this.db.prepare(`
      DELETE FROM daily_summaries
      WHERE date < ?
    `).run(yearCutoff);

    console.info(`Cleaned up ${deletedSummaries.changes} old daily summaries`);

    // Run VACUUM to reclaim space
    this.db.exec('VACUUM');
    console.info('Database vacuum completed');

    return {
      deletedReadings: deletedReadings.changes,
      deletedAggregates: deletedAggregates.changes,
      deletedSummaries: deletedSummaries.changes
    };
  }

  /**
   * Close database connection
   */
  close() {
    this.db.close();
    console.info('Database connection closed');
  }
}

// Export singleton instance
let dbInstance = null;

export function getDatabase() {
  if (!dbInstance) {
    dbInstance = new SolarDatabase();
  }
  return dbInstance;
}

export default SolarDatabase;
