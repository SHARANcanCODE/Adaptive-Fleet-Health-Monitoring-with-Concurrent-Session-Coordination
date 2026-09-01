/**
 * Simple logging utility
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

class Logger {
  private level: LogLevel;

  constructor() {
    const envLevel = process.env.LOG_LEVEL || 'INFO';
    this.level = LogLevel[envLevel as keyof typeof LogLevel] || LogLevel.INFO;
  }

  private log(level: LogLevel, prefix: string, ...args: any[]): void {
    if (level >= this.level) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [${prefix}]`, ...args);
    }
  }

  debug(...args: any[]): void {
    this.log(LogLevel.DEBUG, 'DEBUG', ...args);
  }

  info(...args: any[]): void {
    this.log(LogLevel.INFO, 'INFO', ...args);
  }

  warn(...args: any[]): void {
    this.log(LogLevel.WARN, 'WARN', ...args);
  }

  error(...args: any[]): void {
    this.log(LogLevel.ERROR, 'ERROR', ...args);
  }
}

export const logger = new Logger();

