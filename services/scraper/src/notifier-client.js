import { request } from 'undici';
import { logger } from './logger.js';

/**
 * Checks if current time is within allowed OTP hours (08:00 - 22:00 Israel time)
 * @returns {boolean}
 */
export function isWithinOtpHours() {
  const tz = process.env.TIMEZONE || 'Asia/Jerusalem';
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      hour12: false
    });
    const currentHour = parseInt(formatter.format(new Date()), 10);
    return currentHour >= 8 && currentHour < 22;
  } catch (err) {
    const fallbackHour = new Date().getHours();
    return fallbackHour >= 8 && fallbackHour < 22;
  }
}

/**
 * Requests an OTP from the user via Notifier service.
 * Direct HTTP connection (NO ProxyAgent used).
 * 
 * @param {object} params
 * @param {string|number} params.accountId
 * @param {string} params.bank
 * @param {string} [params.prompt]
 * @param {number} [params.timeoutMs=185000]
 * @returns {Promise<string>} The OTP code provided by user
 */
export async function requestOtp({ accountId, bank, prompt, timeoutMs = 185000 }) {
  if (!isWithinOtpHours()) {
    const msg = `OTP request blocked: Current time is outside allowed hours (08:00-22:00)`;
    logger.warn({ accountId, bank }, msg);
    throw new Error(msg);
  }

  const notifierUrl = process.env.NOTIFIER_URL || 'http://172.28.0.200:3001';
  const endpoint = `${notifierUrl.replace(/\/$/, '')}/api/otp-request`;

  logger.info({ accountId, bank, endpoint, timeoutMs }, 'Sending OTP request to Notifier service (direct internal connection)...');

  const payload = {
    accountId,
    bank,
    prompt: prompt || `Please enter the OTP verification code received for ${bank}`,
    timeoutSeconds: Math.floor(timeoutMs / 1000)
  };

  try {
    const { statusCode, body } = await request(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload),
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs
    });

    const responseText = await body.text();

    if (statusCode < 200 || statusCode >= 300) {
      throw new Error(`Notifier service responded with status ${statusCode}: ${responseText}`);
    }

    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      result = { code: responseText.trim() };
    }

    const otpCode = result.code || result.otp || result.otpCode;
    if (!otpCode) {
      throw new Error(`Invalid response from Notifier: missing OTP code in ${responseText}`);
    }

    logger.info({ accountId, bank }, 'Successfully received OTP code from Notifier');
    return String(otpCode).trim();
  } catch (err) {
    logger.error({ err: err.message, accountId, bank }, 'Failed to obtain OTP from Notifier');
    throw err;
  }
}

export default {
  isWithinOtpHours,
  requestOtp
};
