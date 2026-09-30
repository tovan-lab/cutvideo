import path from 'path';

export const INPAINTING_CONFIG = {
  // Provider configuration
  PROVIDER: process.env.INPAINTING_PROVIDER || 'replicate',
  MODEL: process.env.INPAINTING_MODEL || 'jd7h/propainter',
  VERSION: process.env.INPAINTING_VERSION || '',

  // Limits
  MAX_FILE_SIZE_BYTES: 150 * 1024 * 1024, // 150 MB limit
  MAX_DURATION_SECONDS: 180, // Max 3 minutes
  MAX_WIDTH: 1920,
  MAX_HEIGHT: 1080,

  // Temporary file directory
  TEMP_DIR: path.resolve(process.cwd(), 'temp', 'inpainting'),

  // Timeouts & Cleanups
  JOB_TIMEOUT_MS: 10 * 60 * 1000, // 10 minutes max job execution
  JOB_RETENTION_MS: 30 * 60 * 1000, // Retain completed/failed job records in memory for 30 minutes
};
