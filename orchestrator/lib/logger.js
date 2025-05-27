import winston from 'winston';
import chalk from 'chalk';
import path from 'path';

const logLevels = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    verbose: 3,
    debug: 4
  },
  colors: {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    verbose: 'cyan',
    debug: 'blue'
  }
};

class Logger {
  constructor() {
    this.winston = winston.createLogger({
      levels: logLevels.levels,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({
          filename: path.join(process.cwd(), 'logs', 'error.log'),
          level: 'error'
        }),
        new winston.transports.File({
          filename: path.join(process.cwd(), 'logs', 'combined.log')
        })
      ]
    });

    if (process.env.NODE_ENV !== 'production') {
      this.winston.add(new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      }));
    }
  }

  error(message, ...args) {
    console.error(chalk.red('✖'), message, ...args);
    this.winston.error(message, ...args);
  }

  warn(message, ...args) {
    console.warn(chalk.yellow('⚠'), message, ...args);
    this.winston.warn(message, ...args);
  }

  info(message, ...args) {
    console.info(chalk.green('ℹ'), message, ...args);
    this.winston.info(message, ...args);
  }

  verbose(message, ...args) {
    if (process.env.VERBOSE) {
      console.log(chalk.cyan('🔍'), message, ...args);
    }
    this.winston.verbose(message, ...args);
  }

  debug(message, ...args) {
    if (process.env.DEBUG) {
      console.log(chalk.blue('🐛'), message, ...args);
    }
    this.winston.debug(message, ...args);
  }

  success(message, ...args) {
    console.log(chalk.green('✔'), message, ...args);
    this.winston.info(`SUCCESS: ${message}`, ...args);
  }

  async logToFile(level, message, metadata = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...metadata
    };

    try {
      const logDir = path.join(process.cwd(), 'logs');
      await fs.mkdir(logDir, { recursive: true });
      
      const logFile = path.join(logDir, `${level}-${new Date().toISOString().split('T')[0]}.log`);
      await fs.appendFile(logFile, JSON.stringify(logEntry) + '\n');
    } catch (error) {
      console.error('Failed to write log:', error);
    }
  }
}

export const logger = new Logger();