import chalk from 'chalk';
import { logger } from './logger.js';
import fs from 'fs/promises';
import path from 'path';

export class ErrorHandler {
  constructor() {
    this.errorLog = [];
    this.recoveryStrategies = new Map();
    this.setupDefaultStrategies();
  }

  setupDefaultStrategies() {
    // API errors
    this.recoveryStrategies.set('ApiError', {
      retry: true,
      maxRetries: 3,
      backoff: 1000,
      handler: async (error, context) => {
        logger.warn('API error detected, implementing retry strategy');
        return this.retryWithBackoff(context.operation, context.retries);
      }
    });

    // Authentication errors
    this.recoveryStrategies.set('AuthError', {
      retry: false,
      handler: async (error, context) => {
        logger.error('Authentication failed');
        console.log(chalk.yellow('\n⚠️  Authentication Error'));
        console.log('Please check your API keys and try again.');
        console.log('Run: npm run setup init');
        return false;
      }
    });

    // Network errors
    this.recoveryStrategies.set('NetworkError', {
      retry: true,
      maxRetries: 5,
      backoff: 2000,
      handler: async (error, context) => {
        logger.warn('Network error, retrying...');
        await this.delay(this.recoveryStrategies.get('NetworkError').backoff);
        return this.retryWithBackoff(context.operation, context.retries);
      }
    });

    // File system errors
    this.recoveryStrategies.set('FileSystemError', {
      retry: false,
      handler: async (error, context) => {
        logger.error('File system error:', error.message);
        if (error.code === 'ENOENT') {
          console.log(chalk.yellow('File or directory not found'));
          await this.createMissingStructure(error.path);
          return true;
        }
        return false;
      }
    });

    // Rate limit errors
    this.recoveryStrategies.set('RateLimitError', {
      retry: true,
      handler: async (error, context) => {
        const waitTime = error.retryAfter || 60000;
        logger.warn(`Rate limited. Waiting ${waitTime}ms before retry`);
        console.log(chalk.yellow(`⏱️  Rate limited. Waiting ${Math.ceil(waitTime / 1000)} seconds...`));
        await this.delay(waitTime);
        return true;
      }
    });
  }

  async handle(error, context = {}) {
    // Log the error
    this.logError(error, context);

    // Classify the error
    const errorType = this.classifyError(error);
    logger.debug(`Error classified as: ${errorType}`);

    // Get recovery strategy
    const strategy = this.recoveryStrategies.get(errorType);
    
    if (!strategy) {
      logger.error('No recovery strategy for error type:', errorType);
      return this.defaultHandler(error, context);
    }

    // Apply recovery strategy
    try {
      const recovered = await strategy.handler(error, {
        ...context,
        retries: (context.retries || 0) + 1
      });

      if (recovered && strategy.retry && context.retries < strategy.maxRetries) {
        logger.info('Recovery successful, retrying operation');
        return { retry: true, delay: strategy.backoff };
      }

      return { retry: false, recovered };

    } catch (recoveryError) {
      logger.error('Recovery strategy failed:', recoveryError);
      return { retry: false, recovered: false };
    }
  }

  classifyError(error) {
    // API errors
    if (error.response?.status === 401 || error.message?.includes('Unauthorized')) {
      return 'AuthError';
    }
    if (error.response?.status === 429 || error.message?.includes('rate limit')) {
      return 'RateLimitError';
    }
    if (error.response?.status >= 400) {
      return 'ApiError';
    }

    // Network errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return 'NetworkError';
    }

    // File system errors
    if (error.code === 'ENOENT' || error.code === 'EACCES') {
      return 'FileSystemError';
    }

    // Default
    return 'UnknownError';
  }

  async retryWithBackoff(operation, attempt = 1) {
    const backoff = Math.min(1000 * Math.pow(2, attempt), 30000);
    logger.debug(`Retry attempt ${attempt} with ${backoff}ms backoff`);
    
    await this.delay(backoff);
    
    try {
      return await operation();
    } catch (error) {
      if (attempt < 3) {
        return this.retryWithBackoff(operation, attempt + 1);
      }
      throw error;
    }
  }

  async createMissingStructure(missingPath) {
    try {
      const dir = path.dirname(missingPath);
      await fs.mkdir(dir, { recursive: true });
      logger.info(`Created missing directory: ${dir}`);
      return true;
    } catch (error) {
      logger.error('Failed to create directory:', error);
      return false;
    }
  }

  async defaultHandler(error, context) {
    console.error(chalk.red('\n❌ Unhandled Error:'));
    console.error(error.message);
    
    if (process.env.DEBUG) {
      console.error(chalk.gray('\nStack trace:'));
      console.error(chalk.gray(error.stack));
    }

    await this.saveErrorReport(error, context);
    
    return { retry: false, recovered: false };
  }

  logError(error, context) {
    const errorEntry = {
      timestamp: new Date().toISOString(),
      message: error.message,
      type: error.constructor.name,
      context,
      stack: error.stack
    };

    this.errorLog.push(errorEntry);
    logger.error('Error occurred:', errorEntry);
  }

  async saveErrorReport(error, context) {
    const errorDir = path.join(process.cwd(), 'logs', 'errors');
    await fs.mkdir(errorDir, { recursive: true });

    const errorFile = path.join(
      errorDir,
      `error-${Date.now()}.json`
    );

    const report = {
      timestamp: new Date().toISOString(),
      error: {
        message: error.message,
        stack: error.stack,
        code: error.code,
        type: error.constructor.name
      },
      context,
      systemInfo: {
        platform: process.platform,
        nodeVersion: process.version,
        cwd: process.cwd()
      }
    };

    await fs.writeFile(errorFile, JSON.stringify(report, null, 2));
    logger.info(`Error report saved to ${errorFile}`);
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async gracefulShutdown(reason = 'Unknown') {
    console.log(chalk.yellow(`\n⚠️  Shutting down: ${reason}`));
    
    // Save current state
    await this.saveState();
    
    // Save error log
    if (this.errorLog.length > 0) {
      await this.saveErrorLog();
    }

    console.log(chalk.gray('Cleanup complete'));
    process.exit(1);
  }

  async saveState() {
    try {
      const stateFile = path.join(process.cwd(), '.dashbuilder', 'last-state.json');
      await fs.mkdir(path.dirname(stateFile), { recursive: true });
      
      await fs.writeFile(stateFile, JSON.stringify({
        timestamp: new Date().toISOString(),
        errorCount: this.errorLog.length,
        lastError: this.errorLog[this.errorLog.length - 1] || null
      }, null, 2));
      
    } catch (error) {
      logger.error('Failed to save state:', error);
    }
  }

  async saveErrorLog() {
    try {
      const logFile = path.join(
        process.cwd(),
        'logs',
        `error-session-${Date.now()}.json`
      );
      
      await fs.writeFile(logFile, JSON.stringify(this.errorLog, null, 2));
      
    } catch (error) {
      console.error('Failed to save error log:', error);
    }
  }
}

// Global error handler instance
export const errorHandler = new ErrorHandler();

// Process error handlers
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  errorHandler.gracefulShutdown('Uncaught Exception');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  errorHandler.gracefulShutdown('Unhandled Promise Rejection');
});

process.on('SIGINT', () => {
  errorHandler.gracefulShutdown('User Interrupt (Ctrl+C)');
});

process.on('SIGTERM', () => {
  errorHandler.gracefulShutdown('Process Termination');
});