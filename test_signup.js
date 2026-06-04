import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  
  // Handle alerts
  page.on('dialog', async dialog => {
    console.log('DIALOG:', dialog.message());
    await dialog.accept();
  });

  await page.goto('http://localhost:3000/auth.html#signup', { waitUntil: 'networkidle0' });
  
  await page.type('input[x-model="firstName"]', 'Test');
  await page.type('input[x-model="lastName"]', 'User');
  await page.type('input[x-model="signupEmail"]', 'test@example.com');
  await page.type('input[x-model="password"]', 'Password123!');
  
  // Assuming TOS checkbox is required
  await page.click('input#tos');
  
  console.log('Clicking signup...');
  await page.click('form button[type="submit"]');
  
  // Wait a bit to catch async errors or alerts
  await new Promise(r => setTimeout(r, 2000));
  
  const currentUrl = page.url();
  console.log('Current URL:', currentUrl);
  
  await browser.close();
})();
