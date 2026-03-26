import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  outDir: 'dist',
  manifest: {
    name: 'SideFlow',
    description: 'Connects your AI chats to SideFlow',
    permissions: ['activeTab', 'storage', 'scripting'],
    host_permissions: [
      '*://chat.openai.com/*',
      '*://chatgpt.com/*',
      '*://gemini.google.com/*',
      '*://claude.ai/*',
      'ws://127.0.0.1:9847/*'
    ],
    action: {
      default_title: 'SideFlow - Disconnected',
      default_icon: {
        16: 'icon/icon-16.png',
        32: 'icon/icon-32.png',
        48: 'icon/icon-48.png',
        128: 'icon/icon-128.png'
      }
    }
  }
});
