// Fix user roles - set default role for users without one
require('dotenv').config();
const db = require('./src/db/index');

async function fixUserRoles() {
  try {
    console.log('🔧 Fixing user roles...');
    
    // Update all users without a role to have 'user' role
    const result = await db.query(`
      UPDATE users 
      SET role = 'user' 
      WHERE role IS NULL OR role = ''
      RETURNING id, email, role
    `);
    
    console.log(`✅ Updated ${result.length} user(s):`);
    result.forEach(user => {
      console.log(`   - ${user.email}: role set to '${user.role}'`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error fixing user roles:', error);
    process.exit(1);
  }
}

fixUserRoles();
