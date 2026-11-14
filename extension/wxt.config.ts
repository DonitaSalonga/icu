import { defineConfig } from 'wxt';

// SDD.md § Security (permissions) and R27 (Chrome ≥ 120 for 30 s alarms).
// Permissions are added milestone by milestone as features need them (BUILD.md).
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  // Read WXT_* variables from the repository-root .env (see .env.example).
  vite: () => ({ envDir: '..' }),
  manifest: {
    name: 'ICU: I Caught You',
    short_name: 'ICU',
    description: 'Records browser activity during an online exam you joined, for your examiner to review.',
    minimum_chrome_version: '120',
    permissions: ['tabs', 'alarms', 'storage', 'notifications', 'scripting', 'desktopCapture'],
    icons: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' },
    // <all_urls>: the content script runs on any exam site, and M3 screenshots need it (RESEARCH F6).
    host_permissions: ['<all_urls>'],
  },
});
