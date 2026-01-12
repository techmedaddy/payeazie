require('dotenv').config();
const Redis = require('ioredis');

console.log('Testing Redis connection to Upstash...');
console.log('URL:', process.env.REDIS_URL.replace(/:[^:]*@/, ':***@'));

const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  retryStrategy: (times) => Math.min(times * 50, 2000),
  tls: {
    rejectUnauthorized: false
  }
});

redis.on('connect', () => {
  console.log('✅ Redis connected!');
});

redis.on('ready', async () => {
  console.log('✅ Redis ready!');
  
  // Test a simple operation
  try {
    await redis.set('test', 'hello');
    const value = await redis.get('test');
    console.log('✅ Test operation successful:', value);
    
    await redis.del('test');
    console.log('✅ Cleanup successful');
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Test operation failed:', err.message);
    process.exit(1);
  }
});

redis.on('error', (err) => {
  console.error('❌ Redis error:', err.message);
  process.exit(1);
});

setTimeout(() => {
  console.error('❌ Connection timeout');
  process.exit(1);
}, 10000);
