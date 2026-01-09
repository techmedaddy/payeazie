const nodemailer = require('nodemailer');
const logger = require('./logger');

/**
 * Email Service
 * Handles sending emails via SMTP (Gmail)
 */
class EmailService {
  constructor() {
    this.transporter = null;
    this.from = null;
    this.initialized = false;
  }

  /**
   * Initialize the email transporter with SMTP configuration
   */
  initialize() {
    if (this.initialized) {
      return;
    }

    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
    const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
    const smtpSecure = process.env.SMTP_SECURE === 'true'; // true for 465, false for other ports

    if (!smtpUser || !smtpPass) {
      logger.warn('SMTP credentials not configured. Email functionality will be disabled.');
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });

      this.from = `"Payeazie" <${smtpUser}>`;
      this.initialized = true;

      logger.info({ host: smtpHost, port: smtpPort, user: smtpUser }, 'Email service initialized');
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to initialize email service');
      throw error;
    }
  }

  /**
   * Check if email service is configured and ready
   * @returns {boolean}
   */
  isConfigured() {
    return this.initialized && this.transporter !== null;
  }

  /**
   * Verify SMTP connection
   * @returns {Promise<boolean>}
   */
  async verifyConnection() {
    if (!this.isConfigured()) {
      logger.warn('Email service not configured');
      return false;
    }

    try {
      await this.transporter.verify();
      logger.info('Email service connection verified');
      return true;
    } catch (error) {
      logger.error({ error: error.message }, 'Email service connection failed');
      return false;
    }
  }

  /**
   * Send a password reset email
   * @param {string} toEmail - Recipient email address
   * @param {string} token - Password reset token
   * @param {string} userName - User's name (optional)
   * @returns {Promise<Object>} Email send result
   */
  async sendPasswordResetEmail(toEmail, token, userName = null) {
    if (!this.isConfigured()) {
      const error = new Error('Email service not configured. Cannot send password reset email.');
      logger.error({ toEmail }, error.message);
      throw error;
    }

    // In a real application, you would have a frontend URL
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${token}`;
    
    const greeting = userName ? `Hi ${userName}` : 'Hello';

    const mailOptions = {
      from: this.from,
      to: toEmail,
      subject: 'Password Reset Request - Payeazie',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background-color: #4F46E5;
              color: white;
              padding: 20px;
              text-align: center;
              border-radius: 8px 8px 0 0;
            }
            .content {
              background-color: #f9fafb;
              padding: 30px;
              border: 1px solid #e5e7eb;
              border-top: none;
            }
            .button {
              display: inline-block;
              background-color: #4F46E5;
              color: white;
              padding: 12px 30px;
              text-decoration: none;
              border-radius: 6px;
              margin: 20px 0;
              font-weight: bold;
            }
            .token-box {
              background-color: #fff;
              border: 2px dashed #d1d5db;
              padding: 15px;
              margin: 20px 0;
              border-radius: 6px;
              font-family: monospace;
              font-size: 14px;
              word-break: break-all;
            }
            .footer {
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #e5e7eb;
              font-size: 12px;
              color: #6b7280;
            }
            .warning {
              background-color: #fef3c7;
              border-left: 4px solid #f59e0b;
              padding: 12px;
              margin: 20px 0;
              border-radius: 4px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Password Reset Request</h1>
          </div>
          <div class="content">
            <p>${greeting},</p>
            
            <p>We received a request to reset your password for your Payeazie account.</p>
            
            <p>Click the button below to reset your password:</p>
            
            <center>
              <a href="${resetUrl}" class="button">Reset Password</a>
            </center>
            
            <p>Or copy and paste this link into your browser:</p>
            <div class="token-box">${resetUrl}</div>
            
            <div class="warning">
              <strong>⚠️ Security Notice:</strong>
              <ul style="margin: 10px 0;">
                <li>This link will expire in <strong>15 minutes</strong></li>
                <li>This link can only be used once</li>
                <li>If you didn't request this reset, please ignore this email</li>
              </ul>
            </div>
            
            <p>For your security, never share this link with anyone.</p>
            
            <div class="footer">
              <p><strong>Payeazie Payment System</strong></p>
              <p>This is an automated email. Please do not reply to this message.</p>
              <p>If you're having trouble with the button above, copy and paste the URL into your web browser.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
${greeting},

We received a request to reset your password for your Payeazie account.

To reset your password, visit this link:
${resetUrl}

This link will expire in 15 minutes and can only be used once.

If you didn't request this password reset, please ignore this email.

For your security, never share this link with anyone.

---
Payeazie Payment System
This is an automated email. Please do not reply to this message.
      `.trim(),
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      logger.info({ 
        to: toEmail, 
        messageId: info.messageId,
        accepted: info.accepted 
      }, 'Password reset email sent');
      
      return {
        success: true,
        messageId: info.messageId,
        accepted: info.accepted,
      };
    } catch (error) {
      logger.error({ 
        error: error.message, 
        to: toEmail 
      }, 'Failed to send password reset email');
      throw error;
    }
  }

  /**
   * Send a password reset confirmation email
   * @param {string} toEmail - Recipient email address
   * @param {string} userName - User's name (optional)
   * @returns {Promise<Object>} Email send result
   */
  async sendPasswordResetConfirmation(toEmail, userName = null) {
    if (!this.isConfigured()) {
      logger.warn({ toEmail }, 'Email service not configured. Skipping confirmation email.');
      return { success: false, message: 'Email service not configured' };
    }

    const greeting = userName ? `Hi ${userName}` : 'Hello';

    const mailOptions = {
      from: this.from,
      to: toEmail,
      subject: 'Password Successfully Reset - Payeazie',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background-color: #10b981;
              color: white;
              padding: 20px;
              text-align: center;
              border-radius: 8px 8px 0 0;
            }
            .content {
              background-color: #f9fafb;
              padding: 30px;
              border: 1px solid #e5e7eb;
              border-top: none;
            }
            .success {
              background-color: #d1fae5;
              border-left: 4px solid #10b981;
              padding: 12px;
              margin: 20px 0;
              border-radius: 4px;
            }
            .footer {
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #e5e7eb;
              font-size: 12px;
              color: #6b7280;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>✓ Password Reset Successful</h1>
          </div>
          <div class="content">
            <p>${greeting},</p>
            
            <div class="success">
              <strong>Your password has been successfully reset.</strong>
            </div>
            
            <p>Your Payeazie account password has been changed. You can now log in with your new password.</p>
            
            <p>If you did not make this change, please contact our support team immediately.</p>
            
            <div class="footer">
              <p><strong>Payeazie Payment System</strong></p>
              <p>This is an automated email. Please do not reply to this message.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
${greeting},

Your password has been successfully reset.

Your Payeazie account password has been changed. You can now log in with your new password.

If you did not make this change, please contact our support team immediately.

---
Payeazie Payment System
This is an automated email. Please do not reply to this message.
      `.trim(),
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      logger.info({ 
        to: toEmail, 
        messageId: info.messageId 
      }, 'Password reset confirmation email sent');
      
      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (error) {
      logger.error({ 
        error: error.message, 
        to: toEmail 
      }, 'Failed to send confirmation email');
      // Don't throw error for confirmation emails
      return { success: false, error: error.message };
    }
  }
}

// Create singleton instance
const emailService = new EmailService();

// Initialize on module load if credentials are available
try {
  emailService.initialize();
} catch (error) {
  logger.warn('Email service initialization deferred');
}

module.exports = emailService;
