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
    const pBtn = await page.$('button.primary');
    if (pBtn) await pBtn.click();
  }
  await new Promise(r => setTimeout(r, 800));

  // 2. 設定画面 (Setup) の撮影 (1〜5ラウンド選択カードの確認)
  const lobbyPath = path.join(artifactDir, 'real_rounds_setting_fixed.png');
  await page.screenshot({ path: lobbyPath, fullPage: false });
  console.log('Captured rounds setting lobby to', lobbyPath);

  // 5ラウンドを選択
  const roundBtns = await page.$$('.round-btn');
  if (roundBtns.length >= 5) {
    await roundBtns[4].click(); // 5ラウンド
    console.log('Selected 5 rounds button...');
  }
  await new Promise(r => setTimeout(r, 400));

  // 対戦を開始する
  console.log('Clicking 対戦を開始する...');
  await clickButtonByText(page, '対戦を開始');
  await new Promise(r => setTimeout(r, 800));

  // Handoff 1 -> 交換画面へ
  if (await page.$('.announce')) await page.click('body');
  await new Promise(r => setTimeout(r, 400));
  await clickButtonByText(page, '準備');
  await new Promise(r => setTimeout(r, 800));

  // 交換タブを選択
  console.log('Switching to 交換 tab...');
  const tabBtns = await page.$$('.tabs button');
  if (tabBtns.length >= 2) {
    await tabBtns[1].click(); // 交換タブ
  }
  await new Promise(r => setTimeout(r, 500));

  // 手札から2枚クリックして「捨」選択状態にする
  console.log('Selecting hand cards to toss...');
  const handCards = await page.$$('.hand .card');
  if (handCards.length >= 2) {
    await handCards[0].click();
    await new Promise(r => setTimeout(r, 200));
    await handCards[1].click();
    await new Promise(r => setTimeout(r, 200));
  }

  // 手札交換画面（カード選択の赤枠・「捨」バッジが浮き出る状態）の撮影
  const exchangePath = path.join(artifactDir, 'real_exchange_selection_fixed.png');
  await page.screenshot({ path: exchangePath, fullPage: false });
  console.log('Captured hand exchange card selection to', exchangePath);

  await browser.close();
  console.log('Capture completed successfully!');
}

capture().catch(err => {
  console.error('Error during capture:', err);
  process.exit(1);
});
