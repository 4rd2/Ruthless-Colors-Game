import { chromium } from 'playwright';

(async () => {
    console.log("Starting Playwright test with Player 1 and Player 2");
    const browser = await chromium.launch({ headless: true });
    const page1 = await browser.newPage();
    const page2 = await browser.newPage();

    // Start Player 1
    console.log("Navigating to app P1...");
    await page1.goto('http://localhost:5173');
    await page1.fill('input[placeholder="Your name"]', 'Player1');
    await page1.click('button:has-text("Create Game")');
    await page1.waitForTimeout(1000);

    // Get Room Code
    const roomCodeElement = await page1.locator('.font-mono.font-bold').first();
    const roomCode = await roomCodeElement.innerText();
    console.log("Room Created:", roomCode);

    // Start Player 2
    console.log("Navigating to app P2...");
    await page2.goto('http://localhost:5173');
    await page2.fill('input[placeholder="Your name"]', 'Player2');
    await page2.fill('input[placeholder="Enter room code"]', roomCode);
    await page2.click('button:has-text("Join Game")');
    await page2.waitForTimeout(1000);

    // Host starts game
    console.log("Starting game...");
    await page1.click('button:has-text("Start Game")');
    await page1.waitForTimeout(2000);

    // Try to find playable card in P1 hand
    let activePage = page1;
    let playableCards = await activePage.$$('.rc-card.playable');
    
    if (playableCards.length === 0) {
        // Assume P2 turn
        activePage = page2;
        playableCards = await activePage.$$('.rc-card.playable');
    }
    
    console.log("Playable cards found on active turn:", playableCards.length);

    if (playableCards.length > 0) {
        const discard = await activePage.$('#discard-pile');
        const dBox = await discard.boundingBox();
        const cardBox = await playableCards[0].boundingBox();
        
        console.log("Dragging from", cardBox.x, cardBox.y, "to", dBox.x, dBox.y);
        
        // Use Framer Motion friendly drag
        await activePage.mouse.move(cardBox.x + cardBox.width/2, cardBox.y + cardBox.height/2);
        await activePage.mouse.down();
        await activePage.mouse.move(cardBox.x + cardBox.width/2, cardBox.y + cardBox.height/2 - 20, { steps: 2 });
        await activePage.waitForTimeout(200); // give framer motion time to start drag
        await activePage.mouse.move(dBox.x + dBox.width/2, dBox.y + dBox.height/2, { steps: 20 });
        await activePage.mouse.up();
        
        await activePage.waitForTimeout(1000); // Wait for transition
        
        const remainingPlayable = await activePage.$$('.rc-card.playable');
        console.log("Remaining playable cards for player:", remainingPlayable.length);
        if (remainingPlayable.length < playableCards.length || remainingPlayable.length === 0) {
            console.log("SUCCESS: A card was successfully played via drag and drop!");
        } else {
            console.log("FAILURE: The card count did not decrease. Drag might have failed.");
            await activePage.screenshot({ path: 'drag-fail.png' });
        }
    } else {
        console.log("No playable cards automatically available. Test cannot proceed.");
    }

    await browser.close();
})();
