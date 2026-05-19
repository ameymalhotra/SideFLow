import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  outDir: 'dist',
  manifest: {
    name: 'SideFlow',
    description: 'Connects your AI chats to SideFlow',
    permissions: ['activeTab', 'alarms', 'nativeMessaging', 'scripting', 'tabs'],
    /** Stable extension ID for Native Messaging host allowlists (see desktop-overlay/electron/native-host/allowed-origins.json). */
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEApsissVy4vD+A0l22eqWB1ns/MJMg3yWoB06+7mgl7pnQ18O6i2dVBpEg++KJJgaLY7rTdJwMubktZ2g5hWjXWcqyNV+1NIp/3SxAC4VCKC8lFVBWfNrzFTBH1LGZMQUCHqUjxg5VWZyXUuSv9ATUXJEjKHEkKge3ADvYgm4TbgHtLBYLbM2lE3FmwkBclRogN1JbEBpzOZdK70wPq+YGKJ901zl987C4PqjoUbFQxK/HcBefVCieMdAwPh1az+yOGDspW1WW6RIeMocqvMCin7nCwi1PUVe5aDm9MDG27Wk5Bv8h+K6n91MBD3qmG7mfA3kWeXQCbruEId82w1EKNQIDAQAB',
    /**
     * Keep in sync with `src/lib/sites.ts` (CHAT_URL_PATTERNS) and
     * `src/entrypoints/content.ts` (defineContentScript.matches). WXT bakes
     * these patterns into the generated manifest at build time, so they have
     * to stay as static literals here.
     */
    host_permissions: [
      '*://chat.openai.com/*',
      '*://chatgpt.com/*',
      '*://gemini.google.com/*',
      '*://claude.ai/*',
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
