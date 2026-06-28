const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = 3000;

// --- 🎮 የጨዋታ ሁኔታ (Game State) ---
let calledNums = [];
let gameState = "LOBBY"; 
let lobbyTimeLeft = 15; 
let gameInterval = null;
let lobbyInterval = null;

// 🔑 በአጠቃላይ በተጫዋቾች የተመረጡ ካርቴላዎችን ብዛት ለመቆጣጠር
let totalSelectedCardsCount = 0; 
// የትኛው ተጫዋች የትኞቹን ካርቴላዎች እንደመረጠ መመዝገቢያ (ለሪሴት ይረዳል)
let playerSelections = {}; // 🔑 አወቃቀሩ፦ { userId: [cardId1, cardId2, ...] }

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'nb3.html'));
});

// የሎቢ ታይመር በሰርቨር ላይ ማስተዳደሪያ
function startLobbyTimer() {
    if (lobbyInterval) clearInterval(lobbyInterval);
    gameState = "LOBBY";
    lobbyTimeLeft = 15;
    calledNums = [];

    console.log(`⏱️ የሎቢ ታይመር ተጀመረ... (እስካሁን የተመረጡ ካርቴላዎች ብዛት፦ ${totalSelectedCardsCount})`);
    
    broadcast({ type: 'LOBBY_TICK', timeLeft: lobbyTimeLeft });

    lobbyInterval = setInterval(() => {
        lobbyTimeLeft--;
        
        broadcast({ type: 'LOBBY_TICK', timeLeft: lobbyTimeLeft });

        if (lobbyTimeLeft <= 0) {
            // ⚠️ 🔑 ዋናው ማሻሻያ፦ ታይመሩ 0 ሲደርስ ቢያንስ 1 ካርቴላ መመረጡን ማረጋገጥ
            if (totalSelectedCardsCount > 0) {
                clearInterval(lobbyInterval);
                lobbyInterval = null;
                // ቢያንስ አንድ ካርቴላ ከተመረጠ ጨዋታው በይፋ ይጀምራል!
                startBingoCalling();
            } else {
                // ምንም ካርቴላ ካልተመረጠ ጨዋታው አይጀምርም! ታይመሩን በራሱ መልሶ ከ15 ያስጀምረዋል
                console.log("⚠️ ምንም ካርቴላ አልተመረጠም! ታይመሩ በራስ-ሰር ታድሷል...");
                lobbyTimeLeft = 15;
                broadcast({ type: 'LOBBY_TICK', timeLeft: lobbyTimeLeft });
            }
        }
    }, 1000);
}

wss.on('connection', (ws) => {
    console.log('📱 አዲስ ተጫዋች ተገናኝቷል!');

    // 🔑 ማሳሰቢያ፦ የዩዘሩን አይዲ ከዌብሶኬት ዩአርኤል ወይም ከደንበኛው መለየት ካልተቻለ 
    // መጀመሪያ ባዶ ይላካል፣ ነገር ግን ደንበኛው ከገባ በኋላ በየሴኮንዱ ሲገናኝ ሙሉ በሙሉ ሲንክ ይደረጋል
    ws.send(JSON.stringify({
        type: 'SYNC_GAME',
        calledNums: calledNums,
        gameState: gameState,
        lobbyTimeLeft: lobbyTimeLeft,
        playerSelections: playerSelections // 🔑 ሁሉንም ምርጫዎች መላክ
    }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            // 🔑 የሬንደርን ሰርቨር ለማንቃት ከብሮውዘር የሚመጣውን PING እዚህ ጋር እንይዛለን
            if (data.type === 'PING') {
                // ዝም ብሎ ሰርቨሩን ነቅቶ እንዲቆይ ያደርገዋል፣ ምንም ሌላ ስራ አይሰራም
                return; 
            }
            
        
            
            // 🔑 አዲስ ተጫዋች ካርቴላ ሲመርጥ ወይም ሲሰርዝ የካርቴላዎቹን ዝርዝር በሰርቨር ላይ ማስቀመጥ
            if (data.type === 'SAVE_MY_CARDS') {
                playerSelections[data.userId] = data.cardIds; // አሬይ ማስቀመጥ [12, 45, 600]
                
                // አጠቃላይ የተመረጡትን ካርቴላዎች ድምር ማዘመን
                totalSelectedCardsCount = 0;
                for (const ids of Object.values(playerSelections)) {
                    totalSelectedCardsCount += ids.length;
                }
                console.log(`🎟️ የተጫዋች ${data.userId} ካርቴላዎች በሰርቨር ተቀመጡ፦ [${data.cardIds}]። ጠቅላላ ካርቴላዎች፦ ${totalSelectedCardsCount}`);
            }

            if (data.type === 'I_WON') {
                console.log(`🏆 ተጫዋች ${data.userId} በካርቴላ #${data.cardId} አሸንፏል!`);
                broadcast({
                    type: 'GAME_OVER',
                    winnerCardId: data.cardId,
                    winnerData: data.winnerData,
                    userId: data.userId
                });
                stopBingoCalling();
                setTimeout(() => { startNewBingoRound(); }, 5000);
            }
        } catch (e) {
            console.error(e);
        }
    });

    ws.on('close', () => { console.log('❌ አንድ ተጫዋች ወጥቷል'); });
});

function broadcast(data) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

function startBingoCalling() {
    if (gameInterval) clearInterval(gameInterval);
    calledNums = [];
    gameState = "PLAYING"; 
    console.log(`🎲 ጨዋታው ተጀመረ! በጠቅላላው ${totalSelectedCardsCount} ካርቴላዎች በውድድር ላይ ናቸው።`);
    
    broadcast({ type: 'START_GAME_PAGE' });gameInterval = setInterval(() => {
        if (calledNums.length >= 75) {
            clearInterval(gameInterval);
            broadcast({ type: 'GAME_OVER_NO_WINNER' });
            setTimeout(() => { startNewBingoRound(); }, 5000);
            return;
        }

        let n;
        do { n = Math.floor(Math.random() * 75) + 1; } while (calledNums.includes(n));
        calledNums.push(n);
        let L = n <= 15 ? 'B' : n <= 30 ? 'I' : n <= 45 ? 'N' : n <= 60 ? 'G' : 'O';

        console.log(`📞 የተጠራ ቁጥር፦ ${L}-${n} (${calledNums.length}/75)`);
        broadcast({ type: 'NEW_NUMBER', number: n, letter: L });
    }, 2500);
}

function stopBingoCalling() {
    if (gameInterval) { clearInterval(gameInterval); gameInterval = null; }
}

function startNewBingoRound() {
    stopBingoCalling();
    calledNums = [];
    totalSelectedCardsCount = 0; // 🔑 አዲስ ዙር ሲጀምር የተመረጡትን ካርቴላዎች ወደ 0 መመለስ
    playerSelections = {}; 
    console.log("🔄 ሰርቨሩ ለአዲስ ዙር ዝግጁ እየሆነ ነው...");
    broadcast({ type: 'RESET_ROUND' });
    startLobbyTimer();
}

server.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`🚀 የካሽ ቢንጎ ሰርቨር በስኬት ተነስቷል!`);
    console.log(`🌐 በብሮውዘርህ http://localhost:${PORT} ብለህ ግባ!`);
    console.log(`==================================================`);
    startLobbyTimer();
});
