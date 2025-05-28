const chalk = require('chalk');
const { table } = require('table');
const ora = require('ora');

class Output {
  constructor(format = 'human', quiet = false) {
    this.format = format;
    this.quiet = quiet;
    this.spinner = null;
  }

  print(data, options = {}) {
    if (this.quiet && !options.force) return;

    if (this.format === 'json') {
      console.log(JSON.stringify(data, null, 2));
    } else {
      this.printHuman(data, options);
    }
  }

  printHuman(data, options = {}) {
    if (options.title) {
      console.log(chalk.bold.cyan(`\n${options.title}`));
      console.log(chalk.gray('─'.repeat(options.title.length)));
    }

    if (Array.isArray(data)) {
      this.printArray(data, options);
    } else if (typeof data === 'object' && data !== null) {
      this.printObject(data, options);
    } else {
      console.log(data);
    }
  }

  printArray(data, options = {}) {
    if (data.length === 0) {
      console.log(chalk.gray('No results found'));
      return;
    }

    if (options.table && data.length > 0 && typeof data[0] === 'object') {
      this.printTable(data, options.columns);
    } else {
      data.forEach((item, index) => {
        if (typeof item === 'object') {
          console.log(chalk.gray(`\n[${index + 1}]`));
          this.printObject(item, { indent: 2 });
        } else {
          console.log(`${chalk.gray(`[${index + 1}]`)} ${item}`);
        }
      });
    }
  }

  printObject(data, options = {}) {
    const indent = ' '.repeat(options.indent || 0);
    
    Object.entries(data).forEach(([key, value]) => {
      if (value === null || value === undefined) {
        console.log(`${indent}${chalk.gray(key + ':')} ${chalk.dim('null')}`);
      } else if (typeof value === 'object') {
        console.log(`${indent}${chalk.gray(key + ':')}`);
        this.printObject(value, { indent: (options.indent || 0) + 2 });
      } else if (typeof value === 'boolean') {
        console.log(`${indent}${chalk.gray(key + ':')} ${value ? chalk.green(value) : chalk.red(value)}`);
      } else if (typeof value === 'number') {
        console.log(`${indent}${chalk.gray(key + ':')} ${chalk.yellow(value)}`);
      } else {
        console.log(`${indent}${chalk.gray(key + ':')} ${value}`);
      }
    });
  }

  printTable(data, columns) {
    if (!columns) {
      columns = Object.keys(data[0]);
    }

    const tableData = [
      columns.map(col => chalk.bold(col))
    ];

    data.forEach(row => {
      tableData.push(columns.map(col => {
        const value = row[col];
        if (value === null || value === undefined) return chalk.dim('null');
        if (typeof value === 'boolean') return value ? chalk.green('✓') : chalk.red('✗');
        if (typeof value === 'number') return chalk.yellow(value.toString());
        return value.toString();
      }));
    });

    console.log(table(tableData, {
      border: {
        topBody: chalk.gray('─'),
        topJoin: chalk.gray('┬'),
        topLeft: chalk.gray('┌'),
        topRight: chalk.gray('┐'),
        bottomBody: chalk.gray('─'),
        bottomJoin: chalk.gray('┴'),
        bottomLeft: chalk.gray('└'),
        bottomRight: chalk.gray('┘'),
        bodyLeft: chalk.gray('│'),
        bodyRight: chalk.gray('│'),
        bodyJoin: chalk.gray('│'),
        joinBody: chalk.gray('─'),
        joinLeft: chalk.gray('├'),
        joinRight: chalk.gray('┤'),
        joinJoin: chalk.gray('┼')
      }
    }));
  }

  success(message) {
    if (!this.quiet) {
      console.log(chalk.green('✓') + ' ' + message);
    }
  }

  error(message, error = null) {
    console.error(chalk.red('✗') + ' ' + message);
    if (error && error.details) {
      this.print(error.details, { indent: 2 });
    }
  }

  warning(message) {
    if (!this.quiet) {
      console.log(chalk.yellow('⚠') + ' ' + message);
    }
  }

  info(message) {
    if (!this.quiet) {
      console.log(chalk.cyan('ℹ') + ' ' + message);
    }
  }

  startSpinner(text) {
    if (this.quiet || this.format === 'json') return;
    
    this.spinner = ora({
      text,
      spinner: 'dots'
    }).start();
  }

  updateSpinner(text) {
    if (this.spinner) {
      this.spinner.text = text;
    }
  }

  stopSpinner(success = true, text = null) {
    if (this.spinner) {
      if (success) {
        this.spinner.succeed(text);
      } else {
        this.spinner.fail(text);
      }
      this.spinner = null;
    }
  }

  formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  }

  formatBytes(bytes) {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
  }

  formatNumber(num) {
    return new Intl.NumberFormat().format(num);
  }
}

module.exports = { Output };