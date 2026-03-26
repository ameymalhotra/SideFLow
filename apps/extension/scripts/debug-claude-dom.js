/**
 * Run this in the browser console on https://claude.ai (while viewing a chat with responses)
 * to diagnose the DOM structure for assistant messages.
 * Copy the output and share it to help fix the scraper.
 */
(function () {
  console.log('=== Claude DOM Diagnostic ===\n');

  // 1. Check data-is-human-message
  const byAttr = document.querySelectorAll('[data-is-human-message]');
  console.log('1. [data-is-human-message] count:', byAttr.length);
  byAttr.forEach((el, i) => {
    const attr = el.getAttribute('data-is-human-message');
    const preview = el.textContent?.trim().slice(0, 80) || '(empty)';
    console.log(`   [${i}] ${attr} | ${preview}${preview.length >= 80 ? '...' : ''}`);
  });

  // 2. Look for common message/assistant patterns
  const patterns = [
    '[data-role="assistant"]',
    '[data-message-role="assistant"]',
    '[class*="assistant"]',
    '[class*="model-message"]',
    '[class*="claude-message"]',
    'article',
  ];
  console.log('\n2. Other potential selectors:');
  patterns.forEach((sel) => {
    try {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) {
        const sample = els[0];
        const preview = sample.textContent?.trim().slice(0, 60) || '(empty)';
        console.log(`   ${sel}: ${els.length} found | sample: ${preview}...`);
      }
    } catch (e) {
      console.log(`   ${sel}: error`);
    }
  });

  // 3. Inspect structure of first few message-like blocks (by common class patterns)
  const blocks = document.querySelectorAll('[class*="message"], [class*="Message"], [class*="turn"]');
  console.log('\n3. Message-like blocks (first 5):');
  [...blocks].slice(0, 5).forEach((el, i) => {
    const cls = el.className?.slice(0, 80) || '(none)';
    const text = el.textContent?.trim().slice(0, 50) || '(empty)';
    const attrs = [...el.attributes].map((a) => `${a.name}=${a.value.slice(0, 30)}`).join(' ');
    console.log(`   [${i}] classes: ${cls}`);
    console.log(`       attrs: ${attrs}`);
    console.log(`       text: ${text}...`);
  });

  console.log('\n=== End diagnostic ===');
})();
