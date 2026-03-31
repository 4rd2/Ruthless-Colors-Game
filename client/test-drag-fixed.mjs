import { chromium } from 'playwright';

(async () => {
    console.log("Starting Playwright test...");
    const browser = await chromium.launch({ headless: true });
    const page1 = await browser.newPage();

    // Start Player 1
    console.log("Navigating to app...");
    await page1.goto('http://localhost:5173');
    await page1.fill('input[placeholder="Your name"]', 'Player1');
    await page1.click('button:has-text("Create Game")');
    await page1.waitForTimeout(1000);

    console.log("Starting game...");
    await page1.click('button:has-text("Start Game")');
    await page1.waitForTimeout(2000);

    const p1Hand = await page1.$$('.rc-card');
    console.log("Hand has", p1Hand.length, "cards total on screen");
    
    // Find a playable card
    const playableCards = await page1.$$('.rc-card.playable');
    console.log("Playable cards found:", playableCards.length);

    if (playableCards.length > 0) {
        const discard = await page1.$('#discard-pile');
        const dBox = await discard.boundingBox();
        const cardBox = await playableCards[0].boundingBox();
        
        console.log("Dragging from", cardBox.x, cardBox.y, "to", dBox.x, dBox.y);
        
        // Use Framer Motion friendly drag
        await page1.mouse.move(cardBox.x + cardBox.width/2, cardBox.y + cardBox.height/2);
        await page1.mouse.down();
        await page1.mouse.move(cardBox.x + cardBox.width/2, cardBox.y + cardBox.height/2 - 20, { steps: 2 });
        await page1.waitForTimeout(200); // give framer motion time to start drag
        await page1.mouse.move(dBox.x + dBox.width/2, dBox.y + dBox.height/2, { steps: 20 });
        await page1.mouse.up();
        
        await page1.waitForTimeout(1000); // Wait for transition
        
        const remainingPlayable = await page1.$$('.rc-card.playable');
        console.log("Playable cards after drag:", remainingPlayable.length);
        if (remainingPlayable.length < playableCards.length) {
            console.log("SUCCESS: A card was successfully played via drag and drop!");
        } else {
            console.log("FAILURE: The card count did not decrease. Drag might have failed.");
        }
    } else {
        console.log("No playable cards automatically available for P1.");
        // Try drawing to get a playable card if needed, but not necessary for baseline test.
    }

    await browser.close();
})();
