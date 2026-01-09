const db = require('../index');
const crypto = require('crypto');
const logger = require('../../utils/logger');

/**
 * Password Reset Model
 * Manages password reset tokens and operations
 */
class PasswordResetModel {
  /**
   * Generate a secure random token
   * @returns {string} Secure random token (32 bytes as hex = 64 characters)
   */
  static generateToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Create a password reset token for a user
   * @param {string} userId - User UUID
   * @param {number} expirationMinutes - Token expiration time (default: 15 minutes)
   * @returns {Promise<Object>} Created password reset record with token
   */
  static async create(userId, expirationMinutes = 15) {
    const token = this.generateToken();
    const expiresAt = new Date(Date.now() + expirationMinutes * 60 * 1000);

    const query = `
      INSERT INTO password_resets (user_id, token, expires_at)
      VALUES ($1, $2, $3)
      RETURNING id, user_id, token, expires_at, used, created_at
    `;

    try {
      const result = await db.one(query, [userId, token, expiresAt]);
      logger.info({ userId, expiresAt }, 'Password reset token created');
      return result;
    } catch (error) {
      logger.error({ error: error.message, userId }, 'Failed to create password reset token');
      throw error;
    }
  }

  /**
   * Find a password reset record by token
   * @param {string} token - Reset token
   * @returns {Promise<Object|null>} Password reset record or null
   */
  static async findByToken(token) {
    const query = `
      SELECT id, user_id, token, expires_at, used, created_at, used_at
      FROM password_resets
      WHERE token = $1
    `;

    try {
      return await db.oneOrNone(query, [token]);
    } catch (error) {
      logger.error({ error: error.message }, 'Error finding password reset by token');
      throw error;
    }
  }

  /**
   * Validate a password reset token
   * Checks if token exists, not expired, and not used
   * @param {string} token - Reset token
   * @returns {Promise<Object>} Validation result with user_id if valid
   */
  static async validateToken(token) {
    const reset = await this.findByToken(token);

    if (!reset) {
      return { valid: false, error: 'Invalid token' };
    }

    if (reset.used) {
      return { valid: false, error: 'Token has already been used' };
    }

    const now = new Date();
    const expiresAt = new Date(reset.expires_at);

    if (now > expiresAt) {
      return { valid: false, error: 'Token has expired' };
    }

    return { valid: true, userId: reset.user_id, resetId: reset.id };
  }

  /**
   * Mark a password reset token as used
   * @param {string} token - Reset token
   * @returns {Promise<boolean>} True if marked successfully
   */
  static async markAsUsed(token) {
    const query = `
      UPDATE password_resets
      SET used = TRUE, used_at = CURRENT_TIMESTAMP
      WHERE token = $1 AND used = FALSE
      RETURNING id
    `;

    try {
      const result = await db.oneOrNone(query, [token]);
      if (result) {
        logger.info({ resetId: result.id }, 'Password reset token marked as used');
        return true;
      }
      return false;
    } catch (error) {
      logger.error({ error: error.message }, 'Error marking password reset as used');
      throw error;
    }
  }

  /**
   * Delete expired password reset tokens (cleanup job)
   * @returns {Promise<number>} Number of deleted records
   */
  static async deleteExpired() {
    const query = `
      DELETE FROM password_resets
      WHERE expires_at < CURRENT_TIMESTAMP
      RETURNING id
    `;

    try {
      const result = await db.manyOrNone(query);
      const count = result ? result.length : 0;
      if (count > 0) {
        logger.info({ count }, 'Deleted expired password reset tokens');
      }
      return count;
    } catch (error) {
      logger.error({ error: error.message }, 'Error deleting expired tokens');
      throw error;
    }
  }

  /**
   * Delete all unused tokens for a user (security measure)
   * Call this after successful password reset
   * @param {string} userId - User UUID
   * @returns {Promise<number>} Number of deleted records
   */
  static async deleteByUserId(userId) {
    const query = `
      DELETE FROM password_resets
      WHERE user_id = $1 AND used = FALSE
      RETURNING id
    `;

    try {
      const result = await db.manyOrNone(query, [userId]);
      const count = result ? result.length : 0;
      if (count > 0) {
        logger.info({ userId, count }, 'Deleted unused password reset tokens for user');
      }
      return count;
    } catch (error) {
      logger.error({ error: error.message, userId }, 'Error deleting user password reset tokens');
      throw error;
    }
  }

  /**
   * Get all active (not used, not expired) reset tokens for a user
   * @param {string} userId - User UUID
   * @returns {Promise<Array>} Array of active reset tokens
   */
  static async getActiveByUserId(userId) {
    const query = `
      SELECT id, user_id, token, expires_at, created_at
      FROM password_resets
      WHERE user_id = $1 
        AND used = FALSE 
        AND expires_at > CURRENT_TIMESTAMP
      ORDER BY created_at DESC
    `;

    try {
      return await db.manyOrNone(query, [userId]);
    } catch (error) {
      logger.error({ error: error.message, userId }, 'Error getting active reset tokens');
      throw error;
    }
  }
}

module.exports = PasswordResetModel;
