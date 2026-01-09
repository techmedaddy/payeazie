const db = require('../index');
const logger = require('../../utils/logger');

class UserModel {
  /**
   * Create a new user
   * @param {Object} userData - User data
   * @param {string} userData.email - User email
   * @param {string} [userData.passwordHash] - Bcrypt hashed password (optional for OAuth)
   * @param {string} [userData.name] - User name (optional)
   * @param {string} [userData.role] - User role (default: 'user')
   * @param {string} [userData.googleId] - Google OAuth ID (optional)
   * @returns {Promise<Object>} Created user (without password_hash)
   */
  static async create({ email, passwordHash = null, name = null, role = 'user', googleId = null }) {
    try {
      const result = await db.one(
        `INSERT INTO users (email, password_hash, name, role, google_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, email, name, role, google_id, created_at, updated_at`,
        [email, passwordHash, name, role, googleId]
      );
      
      logger.info({ userId: result.id, email, role, googleId: !!googleId }, 'User created');
      return result;
    } catch (error) {
      if (error.code === '23505') { // Unique violation
        const err = new Error('Email already exists');
        err.statusCode = 409;
        throw err;
      }
      logger.error({ error, email }, 'Error creating user');
      throw error;
    }
  }

  /**
   * Find user by email
   * @param {string} email - User email
   * @returns {Promise<Object|null>} User object or null
   */
  static async findByEmail(email) {
    try {
      const user = await db.oneOrNone(
        'SELECT id, email, password_hash, name, role, google_id, created_at, updated_at FROM users WHERE email = $1',
        [email]
      );
      return user;
    } catch (error) {
      logger.error({ error, email }, 'Error finding user by email');
      throw error;
    }
  }

  /**
   * Find user by Google ID
   * @param {string} googleId - Google OAuth ID
   * @returns {Promise<Object|null>} User object or null
   */
  static async findByGoogleId(googleId) {
    try {
      const user = await db.oneOrNone(
        'SELECT id, email, password_hash, name, role, google_id, created_at, updated_at FROM users WHERE google_id = $1',
        [googleId]
      );
      return user;
    } catch (error) {
      logger.error({ error, googleId }, 'Error finding user by Google ID');
      throw error;
    }
  }

  /**
   * Find user by ID
   * @param {string} id - User ID (UUID)
   * @returns {Promise<Object|null>} User object (without password_hash) or null
   */
  static async findById(id) {
    try {
      const user = await db.oneOrNone(
        'SELECT id, email, name, role, google_id, created_at, updated_at FROM users WHERE id = $1',
        [id]
      );
      return user;
    } catch (error) {
      logger.error({ error, userId: id }, 'Error finding user by ID');
      throw error;
    }
  }

  /**
   * Update user
   * @param {string} id - User ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated user (without password_hash)
   */
  static async update(id, updates) {
    try {
      const fields = [];
      const values = [];
      let paramIndex = 1;

      if (updates.name !== undefined) {
        fields.push(`name = $${paramIndex++}`);
        values.push(updates.name);
      }

      if (updates.email !== undefined) {
        fields.push(`email = $${paramIndex++}`);
        values.push(updates.email);
      }

      if (updates.passwordHash !== undefined) {
        fields.push(`password_hash = $${paramIndex++}`);
        values.push(updates.passwordHash);
      }

      if (updates.googleId !== undefined) {
        fields.push(`google_id = $${paramIndex++}`);
        values.push(updates.googleId);
      }

      if (fields.length === 0) {
        throw new Error('No fields to update');
      }

      values.push(id);
      const result = await db.one(
        `UPDATE users 
         SET ${fields.join(', ')}
         WHERE id = $${paramIndex}
         RETURNING id, email, name, google_id, created_at, updated_at`,
        values
      );

      logger.info({ userId: id }, 'User updated');
      return result;
    } catch (error) {
      if (error.code === '23505') { // Unique violation
        const err = new Error('Email already exists');
        err.statusCode = 409;
        throw err;
      }
      logger.error({ error, userId: id }, 'Error updating user');
      throw error;
    }
  }

  /**
   * Delete user
   * @param {string} id - User ID
   * @returns {Promise<boolean>} True if deleted
   */
  static async delete(id) {
    try {
      await db.none('DELETE FROM users WHERE id = $1', [id]);
      logger.info({ userId: id }, 'User deleted');
      return true;
    } catch (error) {
      logger.error({ error, userId: id }, 'Error deleting user');
      throw error;
    }
  }
}

module.exports = UserModel;
