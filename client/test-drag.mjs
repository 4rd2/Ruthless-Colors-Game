import { chromium } from 'playwright';

(async () => {
    console.log("Starting Playwright test...");
    const browser = await chromium.launch({ headless: true });
    const page1 = await browser.newPage();
    const page2 = await browser.newPage();

    // Start Player 1
    await page1.goto('http://localhost:5173');
    await page1.fill('input[placeholder="Enter your name"]', 'Player1');
    await page1.click('button:has-text("Create Game")');
    await page1.waitForTimeout(1000);

    // Start Player 2
    await page2.goto('http://localhost:5173');
    await page2.fill('input[placeholder="Enter your name"]', 'Player2');
    await page2.click('button:has-text("Join Game")');
    await page2.waitForTimeout(1000);

    // Host starts game
    await page1.click('button:has-text("Start Game")');
    await page1.waitForTimeout(2000);

    const p1Hand = await page1.$$('.rc-card');
    console.log("P1 Hand has", p1Hand.length, "cards");
    
    // Find a playable card in P1 hand (exclude the top discard pile card)
    const playableCards = await page1.$$('.rc-card.playable');
    console.log("Playable cards found:", playableCards.length);

    if (playableCards.length > 0) {
        const discard = await page1.$('#discard-pile');
        const dBox = await discard.boundingBox();
        const cardBox = await playableCards[0].boundingBox();
        
        console.log("Dragging from", cardBox.x, cardBox.y, "to", dBox.x, dBox.y);
        
        await page1.mouse.move(cardBox.x + cardBox.width/2, cardBox.y + cardBox.height/2);
        await page1.mouse.down();
        // Move slowly to trigger drag physics
        await page1.mouse.move(dBox.x + dBox.width/2, dBox.y + dBox.height/2, { steps: 20 });
        await page1.mouse.up();
        
        await page1.waitForTimeout(1000);
        
        const remainingPlayable = await page1.$$('.rc-card.playable');
        console.log("Playable cards after drag:", remainingPlayable.length);
        if (remainingPlayable.length < playableCards.length) {
            console.log("SUCCESS: A card was successfully played via drag and drop!");
        } else {
            console.log("FAILURE: The card count did not decrease. Drag might have failed.");
        }
    } else {
        console.log("No playable cards automatically available for P1.");
    }

    await browser.close();
})();
