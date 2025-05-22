const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const path = require('path');

// Path for storing session data - using existing auth folder   
const SESSION_PATH = 'auth';

async function connectToWhatsApp() {
    // Ensure the session directory exists
    if (!fs.existsSync(SESSION_PATH)) {
        fs.mkdirSync(SESSION_PATH, { recursive: true });
    }

    // *no cap* Loading those spicy authentication credentials
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);

    // Initialize WhatsApp connection (manifesting good vibes only ✨)
    const sock = makeWASocket({
        printQRInTerminal: true,
        auth: state,
        browser: ['List WhatsApp Groups', 'Chrome', '1.0.0']
    });

    // Save credentials on update (secure the bag 💰)
    sock.ev.on('creds.update', saveCreds);

    // Handle connection events (it's giving connection management energy)
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom)? 
                lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut : true;
            
            console.log('Connection closed due to:', lastDisconnect?.error?.message || 'unknown reason');
            
            if (shouldReconnect) {
                console.log('Reconnecting... (stay toxic bestie)');
                connectToWhatsApp();
            } else {
                console.log('Logged out, not reconnecting. (this is my villain origin story fr fr)');
            }
        } else if (connection === 'open') {
            console.log('Connection established! sybau(we crashed the server ✌️)');
            await listAllGroups(sock);
            // Optional: Uncomment to disconnect after listing groups
            // console.log('Disconnecting... (thanks for the trauma)');
            // sock.end();
        }
    });

    return sock;
}

async function listAllGroups(sock) {
    try {
        // Get the list of all chats (not me exposing all the tea ☕)
        const chats = await sock.groupFetchAllParticipating();
        
        console.log('\n===== WHATSAPP GROUPS =====\n');
        
        // Check if there are any groups (POV: you have no friends)
        if (Object.keys(chats).length === 0) {
            console.log('No groups found. (big yikes, touch grass maybe?)');
            return;
        }
        
        // Print all groups with their IDs and names (doxxing the squad, respectfully)
        Object.entries(chats).forEach(([id, group]) => {
            console.log(`Group ID: ${id}`);
            console.log(`Group Name: ${group.subject}`);
            console.log(`Member Count: ${group.participants.length}`);
            console.log('------------------------');
        });
        
        console.log(`\nTotal Groups: ${Object.keys(chats).length} (weird flex but ok)`);
    } catch (error) {
        console.error('Error fetching groups:', error);
        console.log('It\'s giving error vibes... I\'m literally sobbing rn 😭');
    }
}

// Start the connection (let's gooooo, no cap frfr)
connectToWhatsApp()
    .catch(err => console.error('Error in main function:', err, '(living my best error life, slay)')); 