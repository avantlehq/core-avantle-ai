import { appConfig } from './config.js'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogContext {
  correlation_id?: string
  user_id?: string
  tenant_id?: string
  api_client_id?: string
  ip_address?: string
  action?: string
  entity_type?: string
  entity_id?: string
}

class Logger {
  private logLevel: LogLevel

  constructor() {
    this.logLevel = appConfig.server.log_level as LogLevel
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error']
    return levels.indexOf(level) >= levels.indexOf(this.logLevel)
  }

  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString()
    const baseLog = {
      timestamp,
      level: level.toUpperCase(),
      message,
      service: 'core-api',
      ...context,
    }

    return JSON.stringify(baseLog)
  }

  debug(message: string, context?: LogContext): void {
    if (this.shouldLog('debug')) {
      console.log(this.formatMessage('debug', message, context))
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', message, context))
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, context))
    }
  }

  error(message: string, context?: LogContext, error?: Error): void {
    if (this.shouldLog('error')) {
      const errorContext = {
        ...context,
        error: error ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        } : undefined,
      }
      console.error(this.formatMessage('error', message, errorContext))
    }
  }
}

export const logger = new Logger()