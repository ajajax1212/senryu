const puppeteer = require('puppeteer');
const path = require('path');

const artifactDir = 'C:\\Users\\Owner\\.gemini\\antigravity\\brain\\c2900ec8-398b-4e60-b2d7-058d175f4ea8';

async function clickButtonByText(page, textNeedle) {
  const btns = await page.$$('button');
  for (const btn of btns) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text && text.includes(textNeedle)) {
      await btn.click();
      return true;
    }
  }
  return false;
}

async function capture() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 950, deviceScaleFactor: 2 });

  console.log('1. Navigating to http://localhost:5173 ...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 500));

  // タイトル画面で「ローカル対戦」ボタンを押す
  console.log('Clicking ローカル対戦 / はじめる on title screen...');
  const clickedTitle = await clickButtonByText(page, 'ローカル') || await clickButtonByText(page, '対戦') || await clickButtonByText(page, 'ひとりで');
  if (!clickedTitle) {
    // 最初のプライマリボタンを押してみる
    const pBtn = await page.$('button.primary');
    if (pBtn) await pBtn.click();
  }
  await new Promise(r => setTimeout(r, 800));

  // 2. 設定画面 (Setup) の撮影
  const lobbyPath = path.join(artifactDir, 'real_rounds_setting.png');
  await page.screenshot({ path: lobbyPath, fullPage: false });
  console.log('Captured rounds setting lobby to', lobbyPath);

  // モード: コンテストモード を選択
  console.log('Selecting コンテストモード...');
  await clickButtonByText(page, 'コンテスト');
  await new Promise(r => setTimeout(r, 400));

  // ラウンド数: 1回 を選択
  console.log('Selecting 1回...');
  const ghostBtns = await page.$$('button.ghost');
  for (const btn of ghostBtns) {
    const txt = await page.evaluate(el => el.textContent, btn);
    if (txt && txt.trim() === '1回') {
      await btn.click();
      break;
    }
  }
  await new Promise(r => setTimeout(r, 400));

  // 対戦を開始する
  console.log('Clicking 対戦を開始する...');
  await clickButtonByText(page, '対戦を開始');
  await new Promise(r => setTimeout(r, 800));

  // --- ゲーム進行 ---
  // Handoff 1
  console.log('Passing Handoff 1 / Announce...');
  const pass1 = await page.$('.announce') || await page.$('button.primary');
  if (pass1) await page.click('body');
  await new Promise(r => setTimeout(r, 500));
  await clickButtonByText(page, '準備');
  await new Promise(r => setTimeout(r, 800));

  // カードを選択して完成を押す
  console.log('Submitting haiku...');
  const cards = await page.$$('.hand .card');
  for (let i = 0; i < Math.min(4, cards.length); i++) {
    await cards[i].click();
    await new Promise(r => setTimeout(r, 150));
  }
  await clickButtonByText(page, '完成');
  await new Promise(r => setTimeout(r, 800));

  // Handoff 2 -> Rate 1
  console.log('Rate 1...');
  if (await page.$('.announce')) await page.click('body');
  await clickButtonByText(page, '準備');
  await new Promise(r => setTimeout(r, 800));

  // 採点スライダーを 95点に設定
  const slider1 = await page.$("input[type='range']");
  if (slider1) {
    await page.evaluate(el => {
      el.value = 95;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, slider1);
  }
  await new Promise(r => setTimeout(r, 300));
  await clickButtonByText(page, '確定');
  await new Promise(r => setTimeout(r, 800));

  // Handoff 3 -> Rate 2
  console.log('Rate 2...');
  if (await page.$('.announce')) await page.click('body');
  await clickButtonByText(page, '準備');
  await new Promise(r => setTimeout(r, 800));

  // 採点スライダーを 94点に設定
  const slider2 = await page.$("input[type='range']");
  if (slider2) {
    await page.evaluate(el => {
      el.value = 94;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, slider2);
  }
  await new Promise(r => setTimeout(r, 300));
  await clickButtonByText(page, '確定');
  await new Promise(r => setTimeout(r, 1000));

  // ラウンド結果画面
  console.log('Round Result screen...');
  if (await page.$('.reveal')) {
    await page.click('.reveal');
    await new Promise(r => setTimeout(r, 500));
  }
  
  // 「総合結果へ」を押す
  console.log('Clicking 総合結果へ...');
  await clickButtonByText(page, '総合結果');
  await new Promise(r => setTimeout(r, 1200));

  // 3. 総合結果画面 (GameOver) の撮影
  const gameoverPath = path.join(artifactDir, 'real_gameover_grid_fixed.png');
  await page.screenshot({ path: gameoverPath, fullPage: false });
  console.log('Captured gameover screen with grid & fixed hanko to', gameoverPath);

  await browser.close();
  console.log('Capture completed successfully!');
}

capture().catch(err => {
  console.error('Error during capture:', err);
  process.exit(1);
});
