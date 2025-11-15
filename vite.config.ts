import { defineConfig } from 'vite'
import { mockDevServerPlugin } from 'vite-plugin-mock-dev-server'
import eslint from 'vite-plugin-eslint';

export default defineConfig({
  plugins: [
    mockDevServerPlugin(/* plugin options */),
    eslint(),
  ],
  // The fields defined here can also be used in mock.
  define: {},
  server: {
    // plugin will read `server.proxy`
    proxy: {
      '^/deleteHome.php': { target: 'http://example.com' },
      '^/listHomes.php': { target: 'http://example.com' },
      '^/writeData.php': { target: 'http://example.com' },
      '^/data': { target: 'http://example.com' },
    }
  }
})