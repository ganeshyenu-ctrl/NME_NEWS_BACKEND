export const logger = {
  info: (msg, meta = {}) => {
    console.log(`[INFO] ${new Date().toISOString()} - ${msg}`, Object.keys(meta).length ? JSON.stringify(meta) : '');
  },
  warn: (msg, meta = {}) => {
    console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`, Object.keys(meta).length ? JSON.stringify(meta) : '');
  },
  error: (msg, meta = {}) => {
    console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`, Object.keys(meta).length ? JSON.stringify(meta) : '');
  },
  security: (msg, meta = {}) => {
    console.log(`[CYBER-SEC] 🚨 ${new Date().toISOString()} - ${msg}`, JSON.stringify(meta));
  },
};

export default logger;
