const playwright = require('playwright');

(async () => {
  const browser = await playwright.chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });

  // Screenshot initial state
  await page.screenshot({ path: '/tmp/05-initial.png' });
  
  // Find Sign Free Agents elements to understand the structure
  const signAgentsEls = await page.$$eval('*', els => 
    els.filter(el => el.textContent?.trim() === 'Sign Free Agents')
       .map(el => ({ tag: el.tagName, class: el.className.substring(0,60) }))
  );
  console.log('Sign Free Agents elements:', JSON.stringify(signAgentsEls));
  
  // Try clicking the whole Sign Free Agents header area
  const panelBtn = page.locator('[class*="sign-free"], button:has-text("Sign Free Agents"), [data-state] >> text=Sign Free Agents').first();
  try {
    await panelBtn.click({ timeout: 2000 });
    console.log('Clicked panel header');
  } catch(e) {
    // Try clicking parent
    await page.locator('text=Sign Free Agents').first().click();
    console.log('Clicked text');
  }
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/06-after-expand.png' });
  
  // Check for sign buttons now
  const signBtns = await page.$$('button[title*="Sign"]');
  console.log('Sign buttons after expand:', signBtns.length);
  
  // Look for any player cards in the sign panel
  const playerLinks = await page.$$('[class*="free-agent"], [class*="player-row"], button[title]');
  console.log('Player-like elements:', playerLinks.length);
  for (const el of playerLinks.slice(0, 5)) {
    const title = await el.getAttribute('title') || '';
    const text = await el.textContent() || '';
    console.log(' -', title || text.trim().substring(0, 40));
  }
  
  await browser.close();
})();
