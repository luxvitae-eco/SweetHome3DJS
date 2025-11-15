declare module 'vite' {
  export function defineConfig(config: any): any;
}

declare module 'vite-plugin-mock-dev-server' {
  export function mockDevServerPlugin(options?: any): any;
}

declare module 'vite-plugin-eslint' {
  export default function eslint(options?: any): any;
}