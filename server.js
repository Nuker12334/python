const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const puppeteer = require('puppeteer');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

io.on('connection', (socket) => {
    console.log('Client connected');
    let browser = null;
    let page = null;

    socket.on('join', async (data) => {
        const { gameCode, playerName, answerMode } = data;
        if (!gameCode) {
            socket.emit('status', { message: 'Please enter a game code.' });
            return;
        }

        socket.emit('status', { message: `🚀 Launching browser…` });

        try {
            // Launch Puppeteer (headless = true for server)
            browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            page = await browser.newPage();

            // Go to Blooket and join game
            socket.emit('status', { message: '🌐 Navigating to Blooket…' });
            await page.goto('https://www.blooket.com/play', { waitUntil: 'networkidle2' });

            // Enter game code
            await page.waitForSelector('input[placeholder="Game ID"]', { timeout: 10000 });
            await page.type('input[placeholder="Game ID"]', gameCode);
            await page.click('button[type="submit"]');
            socket.emit('status', { message: '🎮 Entered game code, waiting for game…' });

            // Wait for the "Enter Name" screen
            await page.waitForSelector('input[placeholder="Enter your name"]', { timeout: 15000 });
            await page.type('input[placeholder="Enter your name"]', playerName || 'Bot');
            await page.click('button[type="submit"]');
            socket.emit('status', { message: `👤 Joined as ${playerName || 'Bot'}` });

            // Game loop: watch for questions and answer
            let answerLock = false;
            while (true) {
                // Wait for a question to appear
                await page.waitForSelector('.question-text', { timeout: 60000 }).catch(() => {
                    socket.emit('status', { message: '⏳ Game may have ended or no questions.' });
                    throw new Error('No question');
                });

                if (answerLock) continue;
                answerLock = true;

                // Find answer buttons
                const answerButtons = await page.$$('.answer-button');
                if (answerButtons.length === 0) {
                    socket.emit('status', { message: '❓ No answer buttons found.' });
                    answerLock = false;
                    continue;
                }

                let chosenButton = answerButtons[0]; // always pick first answer
                // If you want to pick correct answer, you'd need external answer data.

                // Click the chosen answer
                const answerText = await page.evaluate(el => el.innerText, chosenButton);
                await chosenButton.click();
                socket.emit('status', { message: `🤖 Answered: ${answerText}` });

                // Wait for next question (or until page updates)
                await page.waitForFunction(() => {
                    const q = document.querySelector('.question-text');
                    return q && q.innerText !== '';
                }, { timeout: 30000 });
                answerLock = false;
            }

        } catch (err) {
            socket.emit('status', { message: `❌ Error: ${err.message}` });
            if (browser) await browser.close();
        }
    });

    socket.on('disconnect', async () => {
        if (browser) await browser.close();
        console.log('Client disconnected');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
