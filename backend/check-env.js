require('dotenv').config();

const { isGoogleOAuthConfigured } = require('./src/utils/passport.config');

console.log('Environment Check:');
console.log('=================');
console.log('GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID || 'NOT SET');
console.log('GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET || 'NOT SET');
console.log('GOOGLE_CALLBACK_URL:', process.env.GOOGLE_CALLBACK_URL || 'NOT SET');
console.log('');
console.log('Is Placeholder:', process.env.GOOGLE_CLIENT_SECRET === 'YOUR_GOOGLE_CLIENT_SECRET_HERE');
console.log('Is Configured (with validation):', isGoogleOAuthConfigured());
