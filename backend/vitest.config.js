import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test environment
    environment: 'node',
    
    // Global test setup
    globals: true,
    
    // Test file patterns
    include: ['**/__tests__/**/*.test.js', '**/*.spec.js'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/coverage/**'],
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.js'],
      exclude: [
        'src/**/__tests__/**',
        'src/**/*.test.js',
        'src/**/*.spec.js',
        'scripts/**',
        'migrations/**'
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80
      }
    },
    
    // Test timeout
    testTimeout: 10000,
    hookTimeout: 10000,
    
    // Reporter
    reporter: ['verbose', 'html'],
    
    // Mock reset
    clearMocks: true,
    mockReset: true,
    restoreMocks: true,
    
    // Pool options for parallel execution
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false
      }
    }
  }
});
