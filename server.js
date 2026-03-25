const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Blooket = require('blooketjs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

io.on('connection', (socket) => {
    console.log('Client connected');
    let client = null;
    let gameJoined = false;

    socket.on('join', async (data) => {
        const { gameCode, playerName, answerMode = 'first' } = data;
        if (gameJoined) return;

        try {
            client = new Blooket.Client();
            const player = await client.joinGame(gameCode, playerName || 'Bot');
            gameJoined = true;

            socket.emit('status', { message: `✅ Joined game ${gameCode} as ${player.name}` });

            client.on('question', async (question) => {
                let answer;
                if (answerMode === 'first') {
                    answer = question.answers[0];
                } else if (answerMode === 'correct') {
                    // Attempt to find the correct answer (if the question object contains it)
                    answer = question.answers.find(a => a.isCorrect) || question.answers[0];
                } else {
                    answer = question.answers[0];
                }

                if (answer) {
                    await client.answerQuestion(question.id, answer);
                    socket.emit('status', { message: `🤖 Answered: ${answer}` });
                } else {
                    socket.emit('status', { message: '⚠️ No answer found for this question' });
                }
            });

            client.on('end', () => {
                socket.emit('status', { message: '🏁 Game ended' });
                gameJoined = false;
            });

            client.on('error', (err) => {
                socket.emit('status', { message: `❌ Error: ${err.message}` });
                gameJoined = false;
            });
        } catch (err) {
            socket.emit('status', { message: `❌ Failed to join: ${err.message}` });
        }
    });

    socket.on('disconnect', () => {
        if (client) client.disconnect();
        console.log('Client disconnected');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
