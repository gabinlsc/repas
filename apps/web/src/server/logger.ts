import pino from "pino";

/**
 * Logs JSON structurés. Les champs susceptibles de contenir des données personnelles
 * sont caviardés : on ne journalise que des identifiants opaques.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "web" },
  redact: { paths: ["email", "password", "*.email", "*.password", "req.headers.cookie", "allergens", "*.allergens", "diets", "*.diets", "name", "*.name"], censor: "[caviardé]" },
  timestamp: pino.stdTimeFunctions.isoTime,
});
