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

    // Load authentication credentials
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);

    // Initialize WhatsApp connection
    const sock = makeWASocket({
        printQRInTerminal: true,
        auth: state,
        browser: ['List WhatsApp Groups', 'Chrome', '1.0.0']
    });

    // Save credentials on update
    sock.ev.on('creds.update', saveCreds);

    // Handle connection events
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom)? 
                lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut : true;
            
            console.log('Connection closed due to:', lastDisconnect?.error?.message || 'unknown reason');
            
            if (shouldReconnect) {
                console.log('Reconnecting...');
                connectToWhatsApp();
            } else {
                console.log('Logged out, not reconnecting.');
            }
        } else if (connection === 'open') {
            console.log('Connection established!');
            await listAllGroups(sock);
            // Optional: Uncomment to disconnect after listing groups
            // console.log('Disconnecting...');
            // sock.end();
        }
    });

    return sock;
}

async function listAllGroups(sock) {
    try {
        // Get the list of all chats
        const chats = await sock.groupFetchAllParticipating();
        
        console.log('\n===== WHATSAPP GROUPS =====\n');
        
        // Check if there are any groups
        if (Object.keys(chats).length === 0) {
            console.log('No groups found.');
            return;
        }
        
        // Print all groups with their IDs and names
        Object.entries(chats).forEach(([id, group]) => {
            console.log(`Group ID: ${id}`);
            console.log(`Group Name: ${group.subject}`);
            console.log(`Member Count: ${group.participants.length}`);
            console.log('------------------------');
        });
        
        console.log(`\nTotal Groups: ${Object.keys(chats).length}`);
    } catch (error) {
        console.error('Error fetching groups:', error);
    }
}

// Start the connection
connectToWhatsApp()
    .catch(err => console.error('Error in main function:', err)); 