import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

const sharedConfig = {
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'react-native': 'react-native-web',
    },
  },
};

export default defineConfig({
  ...sharedConfig,
  test: {
    projects: [
      {
        ...sharedConfig,
        test: {
          name: 'unit',
          include: ['tests/**/*.test.ts'],
          environment: 'node',
          globals: true,
          setupFiles: ['./tests/setup.ts'],
        },
      },
      {
        ...sharedConfig,
        test: {
          name: 'dom',
          include: ['tests/**/*.test.tsx'],
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./tests/setup.ts'],
        },
      },
    ],
  },
});
