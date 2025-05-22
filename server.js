const express = require('express');
const multer = require('multer');
const fs = require('fs');
const fsExtra = require('fs-extra');
const path = require('path');
const xlsx = require('xlsx');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');

// Create Express app
const app = express();
const port = 3000;

// Add rate limiting middleware
const requestLimits = {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 120,      // Max 120 requests per minute (increased from 30)
    requestCounts: new Map(),
    timeout: null
};

// Rate limiting middleware
function rateLimitMiddleware(req, res, next) {
    const ip = req.ip;
    const now = Date.now();
    
    // Clean up old request counts
    if (!requestLimits.timeout) {
        requestLimits.timeout = setTimeout(() => {
            const windowStart = now - requestLimits.windowMs;
            requestLimits.requestCounts.forEach((timestamps, clientIp) => {
                const validTimestamps = timestamps.filter(timestamp => timestamp > windowStart);
                if (validTimestamps.length === 0) {
                    requestLimits.requestCounts.delete(clientIp);
                } else {
                    requestLimits.requestCounts.set(clientIp, validTimestamps);
                }
            });
            requestLimits.timeout = null;
        }, 60000); // Clean up every minute
    }
    
    // Get request count for this IP
    const requestTimestamps = requestLimits.requestCounts.get(ip) || [];
    const windowStart = now - requestLimits.windowMs;
    const recentRequests = requestTimestamps.filter(timestamp => timestamp > windowStart);
    
    // Check if rate limit exceeded
    if (recentRequests.length >= requestLimits.maxRequests) {
        return res.status(429).json({
            success: false,
            message: 'Rate limit exceeded. Please try again later.'
        });
    }
    
    // Update request count
    recentRequests.push(now);
    requestLimits.requestCounts.set(ip, recentRequests);
    
    next();
}

// Apply rate limiting to all routes
app.use(rateLimitMiddleware);

// In-memory store for tracking sending processes
const processStore = new Map();

// Process retention time (24 hours in milliseconds)
const PROCESS_RETENTION_TIME = 24 * 60 * 60 * 1000;

// WhatsApp connection details
let whatsappSocket = null;
let isConnected = false;
let connectionTimeout = null;
const CONNECTION_IDLE_TIMEOUT = 10 * 60 * 1000; // 10 minutes idle timeout

// Add a variable to store the latest QR code
let latestQrCode = '';

// Add a flag to prevent reconnection attempts during cooldown
let reconnectingInProgress = false;
let reconnectCooldown = false;
let reconnectTimer = null;

// Function to automatically disconnect WhatsApp after idle timeout
function scheduleDisconnection() {
    // Clear any existing timeout
    if (connectionTimeout) {
        clearTimeout(connectionTimeout);
    }
    
    // Set new timeout
    connectionTimeout = setTimeout(() => {
        if (isConnected && whatsappSocket) {
            console.log('Pausing WhatsApp connection due to inactivity');
            // Just set the connection state to false without logging out
            isConnected = false;
            whatsappSocket = null;
            connectionTimeout = null;
        }
    }, CONNECTION_IDLE_TIMEOUT);
}

// Function to clean up old processes
function cleanupOldProcesses() {
    const now = Date.now();
    for (const [processId, process] of processStore.entries()) {
        // If process is completed and older than retention time, remove it
        if (process.completed && process.endTime && (now - process.endTime > PROCESS_RETENTION_TIME)) {
            console.log(`Cleaning up old process: ${processId}`);
            processStore.delete(processId);
        }
    }
}

// Run cleanup every hour
setInterval(cleanupOldProcesses, 60 * 60 * 1000);

// Set up a storage engine for multer
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        let uploadDir;
        
        // Check if this is an Excel file upload
        if (file.fieldname === 'excelFile') {
            uploadDir = path.join(__dirname, 'uploads', 'excel');
        } else {
            uploadDir = path.join(__dirname, 'uploads', 'media');
        }
        
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // Use a unique filename to avoid overwriting
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({ storage: storage });

// Add json and urlencoded middleware for handling post data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve index.html, script.js, and groups_lists.json from the root directory
app.use(express.static(path.join(__dirname)));

// Path for auth files - make sure this is the correct path to your auth folder
const AUTH_PATH = path.join(__dirname, 'auth');
console.log(`Using WhatsApp auth folder: ${AUTH_PATH}`);

// Path for storing contact lists
const LISTS_PATH = path.join(__dirname, 'groups_lists.json');

// Function to read contact lists
function readContactLists() {
    try {
        if (fs.existsSync(LISTS_PATH)) {
            const data = fs.readFileSync(LISTS_PATH, 'utf8');
            return JSON.parse(data);
        }
        return {};
    } catch (error) {
        console.error('Error reading contact lists:', error);
        return {};
    }
}

// Function to write contact lists
function writeContactLists(lists) {
    try {
        fs.writeFileSync(LISTS_PATH, JSON.stringify(lists, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('Error writing contact lists:', error);
        return false;
    }
}

// Function to ensure WhatsApp connection is active when needed
async function ensureWhatsAppConnection() {
    if (isConnected && whatsappSocket) {
        // Reset the idle timer if connection exists
        scheduleDisconnection();
        return whatsappSocket;
    }
    
    // If not connected, initialize a connection
    console.log('Initializing WhatsApp connection on demand...');
    const socket = await initializeWhatsAppConnection();
    
    if (socket) {
        whatsappSocket = socket;
        isConnected = true;
        scheduleDisconnection();
        return socket;
    }
    
    throw new Error('Failed to establish WhatsApp connection');
}

// Initialize WhatsApp connection on server start
async function initializeWhatsAppConnection() {
    try {
        // Ensure auth directory exists
        if (!fs.existsSync(AUTH_PATH)) {
            fs.mkdirSync(AUTH_PATH, { recursive: true });
            console.log(`Created auth directory: ${AUTH_PATH}`);
        } else {
            console.log(`Found existing auth directory: ${AUTH_PATH}`);
        }

        // Load WhatsApp credentials
        console.log('Loading WhatsApp credentials...');
        const { state, saveCreds } = await useMultiFileAuthState(AUTH_PATH);
        
        // Create a WhatsApp socket connection
        console.log('Creating WhatsApp connection...');
        const sock = makeWASocket({
            auth: state,
            // Removed printQRInTerminal as it's deprecated
            browser: ['WhatsApp Bulk Sender', 'Chrome', '1.0.0'],
            syncFullHistory: false
        });
        
        // Handle credentials update
        sock.ev.on('creds.update', saveCreds);
        
        // Handle connection updates
        sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
            if (qr) {
                // Store the QR code for API endpoint access
                latestQrCode = qr;
                // Print QR code to console for scanning
                console.log('\n==== SCAN QR CODE WITH YOUR WHATSAPP APP ====\n');
                console.log(qr);
                console.log('\n==============================================\n');
            }
            
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                console.log('Connection closed due to:', lastDisconnect?.error?.message || 'unknown reason');
                console.log('Status code:', statusCode || 'unknown');
                console.log('Full error:', JSON.stringify(lastDisconnect?.error || 'No error object', null, 2));
                
                isConnected = false;
                whatsappSocket = null;
                
                // Handle 401 unauthorized errors with a cooldown to prevent loops
                if (statusCode === 401) {
                    console.log('Authentication failed with 401 Unauthorized');
                    
                    // Only attempt to reconnect if we're not in cooldown
                    if (!reconnectCooldown && !reconnectingInProgress) {
                        console.log('Setting reconnect cooldown for 5 seconds');
                        reconnectCooldown = true;
                        
                        // Clear auth folder to force fresh authentication
                        if (fs.existsSync(AUTH_PATH)) {
                            try {
                                const files = fs.readdirSync(AUTH_PATH);
                                for (const file of files) {
                                    fs.unlinkSync(path.join(AUTH_PATH, file));
                                }
                                console.log('Auth folder cleared to force re-authentication');
                            } catch (error) {
                                console.error('Error clearing auth folder:', error);
                            }
                        }
                        
                        // After cooldown period, allow reconnection again
                        setTimeout(() => {
                            reconnectCooldown = false;
                            console.log('Reconnect cooldown ended, now allowing reconnection');
                        }, 5000);
                        
                        // Only start one reconnection attempt
                        if (!reconnectingInProgress) {
                            reconnectingInProgress = true;
                            
                            // Attempt reconnection after a delay to avoid connection storms
                            console.log('Scheduling reconnect attempt in 8 seconds');
                            if (reconnectTimer) {
                                clearTimeout(reconnectTimer);
                            }
                            
                            reconnectTimer = setTimeout(() => {
                                console.log('Trying to reconnect after cooldown...');
                                reconnectingInProgress = false;
                                initializeWhatsAppConnection();
                            }, 8000);
                        }
                    } else {
                        console.log('Skipping reconnect attempt due to cooldown or already in progress');
                    }
                }
                // Check for other disconnect reasons that should not trigger reconnect
                else if (statusCode === DisconnectReason.loggedOut) {
                    console.log('Logged out, not reconnecting immediately');
                    
                    // Similar cooldown for loggedOut condition
                    if (!reconnectCooldown && !reconnectingInProgress) {
                        reconnectCooldown = true;
                        
                        setTimeout(() => {
                            reconnectCooldown = false;
                            console.log('LoggedOut cooldown ended');
                        }, 5000);
                        
                        if (!reconnectingInProgress) {
                            reconnectingInProgress = true;
                            
                            if (reconnectTimer) {
                                clearTimeout(reconnectTimer);
                            }
                            
                            reconnectTimer = setTimeout(() => {
                                console.log('Trying to reconnect after logout cooldown...');
                                reconnectingInProgress = false;
                                initializeWhatsAppConnection();
                            }, 8000);
                        }
                    }
                } 
                else {
                    // For other errors, try to reconnect with less aggressive timing
                    if (!reconnectingInProgress) {
                        reconnectingInProgress = true;
                        
                        console.log('Attempting to reconnect after error...');
                        
                        if (reconnectTimer) {
                            clearTimeout(reconnectTimer);
                        }
                        
                        reconnectTimer = setTimeout(() => {
                            reconnectingInProgress = false;
                            initializeWhatsAppConnection();
                        }, 5000);
                    }
                }
            } else if (connection === 'open') {
                console.log('WhatsApp connection established successfully!');
                whatsappSocket = sock;
                isConnected = true;
                latestQrCode = ''; // Clear QR code when connected
                reconnectingInProgress = false; // Reset reconnection flag
            }
        });
        
        // Add more event handlers for debugging
        sock.ev.on('messages.upsert', m => {
            console.log('New message:', m.type);
        });
        
        sock.ev.on('message-receipt.update', m => {
            console.log('Message receipt update');
        });
        
        sock.ev.on('presence.update', m => {
            console.log('Presence update');
        });
        
        sock.ev.on('chats.upsert', m => {
            console.log('Chat upsert event');
        });
        
        sock.ev.on('contacts.upsert', m => {
            console.log('Contact upsert event');
        });
        
        return sock;
    } catch (error) {
        console.error('Error initializing WhatsApp connection:', error);
        return null;
    }
}

// Endpoint to handle uploads and send WhatsApp messages
app.post('/send-media', upload.single('media'), async (req, res) => {
    try {
        // Check if this is a text-only message - convert string to boolean properly
        const isTextOnly = req.body.isTextOnly === 'true';
        console.log('Is text only?', isTextOnly, 'Value:', req.body.isTextOnly);
        
        const caption = req.body.caption || '';
        let groups;
        
        try {
            groups = JSON.parse(req.body.groups || '[]');
        } catch (e) {
            return res.status(400).json({ success: false, message: 'Invalid groups format' });
        }
        
        if (!groups.length) {
            return res.status(400).json({ success: false, message: 'No recipients specified' });
        }

        // For text-only messages, we need a caption
        if (isTextOnly && !caption.trim()) {
            return res.status(400).json({ success: false, message: 'Text message cannot be empty' });
        }

        // For media messages, we need a file
        if (!isTextOnly && !req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded for media message' });
        }

        // Try to establish WhatsApp connection before starting the process
        try {
            await ensureWhatsAppConnection();
        } catch (connError) {
            return res.status(503).json({ 
                success: false, 
                message: 'Could not establish WhatsApp connection: ' + connError.message
            });
        }

        // Start the sending process asynchronously
        const processId = Date.now().toString();
        const mediaPath = req.file ? req.file.path : null;
        const mimeType = req.file ? req.file.mimetype : null;
        
        if (isTextOnly) {
            sendTextToGroups(caption, groups, processId);
        } else {
            sendMediaToGroups(mediaPath, caption, groups, mimeType, processId);
        }
        
        // Return immediately with a success response and ID
        return res.json({ 
            success: true, 
            message: `${isTextOnly ? 'Text' : 'Media'} send process started`, 
            processId: processId 
        });
        
    } catch (error) {
        console.error('Error in upload handler:', error);
        return res.status(500).json({ success: false, message: 'Server error: ' + error.message });
    }
});

// Endpoint to process Excel file and import contacts
app.post('/import-excel', upload.single('excelFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No Excel file uploaded' });
        }

        const excelPath = req.file.path;
        const listName = req.body.listName || '';
        const sheetName = req.body.sheetName || 'Data sheet';
        const createNewList = req.body.createNewList === 'true';
        
        // Validate inputs
        if (!listName) {
            return res.status(400).json({ success: false, message: 'List name is required' });
        }

        // Read Excel file
        const workbook = xlsx.readFile(excelPath);
        
        // Check if the specified sheet exists
        if (!workbook.SheetNames.includes(sheetName)) {
            return res.status(400).json({ 
                success: false, 
                message: `Sheet "${sheetName}" not found. Available sheets: ${workbook.SheetNames.join(', ')}` 
            });
        }

        // Get the worksheet
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert sheet to JSON
        const jsonData = xlsx.utils.sheet_to_json(worksheet);
        
        if (jsonData.length === 0) {
            return res.status(400).json({ success: false, message: 'No data found in the Excel sheet' });
        }
        
        // Process the data - Map Excel columns to our format with improved column name detection
        const contacts = jsonData.map(row => {
            // Determine the column names by checking various possible formats
            const idColumn = findColumnValue(row, ['GROUP ID/ PHONE NUMBER', 'GROUP ID/PHONE NUMBER', 'PHONE NUMBER', 'Phone Number', 'Group ID']);
            const nameColumn = findColumnValue(row, ['PARTY GROUP NAME', 'PARTY NAME', 'Name', 'Group Name', 'PARTY']);
            const codeColumn = findColumnValue(row, ['PARTY CODE', 'Code', 'Party Code']);
            const typeColumn = findColumnValue(row, ['TYPE', 'Type']);
            const tierColumn = findColumnValue(row, ['TIER', 'Tier']);
            
            // Normalize the contact type
            let type = (typeColumn || '').toUpperCase();
            if (!type || (type !== 'GROUP' && type !== 'PERSONAL')) {
                // Default to GROUP if type is not specified or invalid
                type = 'GROUP';
            }
            
            // Normalize tier
            let tier = (tierColumn || '').toUpperCase();
            
            // Validate the tier is one of the expected values
            const validTiers = ['AAGNA', 'TRIONE', 'OEM', 'MANAGEMENT'];
            if (!validTiers.includes(tier)) {
                // If tier is not valid, try to infer from other data
                if (nameColumn && nameColumn.toUpperCase().includes('AAGNA')) {
                    tier = 'AAGNA';
                } else if (nameColumn && nameColumn.toUpperCase().includes('TRIONE')) {
                    tier = 'TRIONE';
                } else {
                    // Default tier
                    tier = '';
                }
            }
            
            // Format the ID properly based on type
            let formattedId = idColumn || '';
            
            // Convert to string to ensure we can use string methods
            formattedId = String(formattedId);
            
            if (type === 'GROUP' && formattedId && !formattedId.endsWith('@g.us')) {
                formattedId = `${formattedId}@g.us`;
            } else if (type === 'PERSONAL' && formattedId) {
                // For personal contacts, make sure the ID is formatted as a phone number
                // Remove any @s.whatsapp.net suffix if present
                formattedId = formattedId.replace(/@s\.whatsapp\.net$/, '');
                // Add the @s.whatsapp.net suffix if not already present
                if (!formattedId.includes('@')) {
                    formattedId = `${formattedId}@s.whatsapp.net`;
                }
            }
            
            return {
                id: formattedId,
                name: nameColumn || '',
                code: codeColumn || '',
                type: type,
                tier: tier
            };
        }).filter(contact => contact.id && contact.name); // Filter out rows without ID or name
        
        // Read existing contact lists
        const contactLists = readContactLists();
        
        // Check if we're creating a new list or replacing an existing one
        if (createNewList) {
            if (contactLists[listName] && !req.body.overwrite) {
                return res.status(400).json({ 
                    success: false, 
                    message: `List "${listName}" already exists. Set overwrite=true to replace it.` 
                });
            }
        }
        
        // Add/update the list
        contactLists[listName] = contacts;
        
        // Save back to file
        const saved = writeContactLists(contactLists);
        
        if (!saved) {
            return res.status(500).json({ success: false, message: 'Failed to save contact list' });
        }
        
        // Clean up the uploaded Excel file
        fs.unlink(excelPath, (err) => {
            if (err) console.error('Error deleting Excel file:', err);
        });
        
        return res.json({ 
            success: true, 
            message: `Successfully imported ${contacts.length} contacts to list "${listName}"`,
            contacts: contacts 
        });
        
    } catch (error) {
        console.error('Error processing Excel import:', error);
        return res.status(500).json({ success: false, message: 'Error processing Excel file: ' + error.message });
    }
});

// Helper function to find a value from multiple possible column names
function findColumnValue(row, possibleNames) {
    for (const name of possibleNames) {
        if (row[name] !== undefined) {
            return row[name];
        }
    }
    return null;
}

// Endpoint to get all contact lists
app.get('/contact-lists', (req, res) => {
    try {
        const contactLists = readContactLists();
        
        // Return just the list names and counts
        const listSummary = {};
        for (const [name, contacts] of Object.entries(contactLists)) {
            listSummary[name] = contacts.length;
        }
        
        res.json({
            success: true,
            lists: listSummary
        });
    } catch (error) {
        console.error('Error getting contact lists:', error);
        res.status(500).json({ success: false, message: 'Error fetching contact lists: ' + error.message });
    }
});

// Endpoint to get a specific contact list
app.get('/contact-lists/:listName', (req, res) => {
    try {
        const { listName } = req.params;
        const contactLists = readContactLists();
        
        if (!contactLists[listName]) {
            return res.status(404).json({ success: false, message: `List "${listName}" not found` });
        }
        
        res.json({
            success: true,
            name: listName,
            contacts: contactLists[listName]
        });
    } catch (error) {
        console.error('Error getting contact list:', error);
        res.status(500).json({ success: false, message: 'Error fetching contact list: ' + error.message });
    }
});

// Endpoint to delete a contact list
app.delete('/contact-lists/:listName', (req, res) => {
    try {
        const { listName } = req.params;
        const contactLists = readContactLists();
        
        if (!contactLists[listName]) {
            return res.status(404).json({ success: false, message: `List "${listName}" not found` });
        }
        
        // Delete the list
        delete contactLists[listName];
        
        // Save back to file
        const saved = writeContactLists(contactLists);
        
        if (!saved) {
            return res.status(500).json({ success: false, message: 'Failed to save changes' });
        }
        
        res.json({
            success: true,
            message: `List "${listName}" deleted successfully`
        });
    } catch (error) {
        console.error('Error deleting contact list:', error);
        res.status(500).json({ success: false, message: 'Error deleting contact list: ' + error.message });
    }
});

// Helper function for safely fetching profile pictures
async function safeProfilePictureUrl(jid, type = 'image') {
    if (!whatsappSocket) return null;
    
    try {
        // Use Promise.race to implement a timeout
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Profile picture fetch timed out')), 5000)
        );
        
        const fetchPromise = whatsappSocket.profilePictureUrl(jid, type);
        
        // Race between fetch and timeout
        const url = await Promise.race([fetchPromise, timeoutPromise])
            .catch(error => {
                // Provide more detailed logging
                console.log(`Profile picture fetch failed for ${jid}: ${error.message || 'Unknown error'}`);
                return null;
            });
            
        return url;
    } catch (error) {
        console.log(`Exception in profile picture fetch for ${jid}: ${error.message || 'Unknown error'}`);
        return null;
    }
}

// Endpoint to get WhatsApp group details
app.get('/group-details/:groupId', async (req, res) => {
    try {
        const { groupId } = req.params;
        
        try {
            await ensureWhatsAppConnection();
        } catch (connError) {
            return res.status(503).json({
                success: false,
                message: 'Could not establish WhatsApp connection: ' + connError.message
            });
        }
        
        // Try to fetch group metadata
        try {
            const groupMetadata = await whatsappSocket.groupMetadata(groupId);
            
            // Format the response
            const formattedResponse = {
                id: groupMetadata.id,
                subject: groupMetadata.subject,
                creation: groupMetadata.creation,
                owner: groupMetadata.owner,
                description: groupMetadata.desc?.text || '',
                participants: groupMetadata.participants.map(p => ({
                    id: p.id,
                    isAdmin: p.admin ? true : false,
                    isSuperAdmin: p.admin === 'superadmin'
                })),
                // These might not be available in all cases
                profilePictureUrl: null,
                size: groupMetadata.size || groupMetadata.participants.length
            };
            
            // Get the group profile picture using the helper function
            formattedResponse.profilePictureUrl = await safeProfilePictureUrl(groupId);
            
            res.json({
                success: true,
                group: formattedResponse
            });
            
        } catch (groupError) {
            console.error(`Error fetching metadata for group ${groupId}:`, groupError);
            return res.status(404).json({ 
                success: false, 
                message: `Could not fetch group details. Make sure the group ID is correct and you are a member of the group.` 
            });
        }
        
    } catch (error) {
        console.error('Error getting group details:', error);
        res.status(500).json({ success: false, message: 'Error fetching group details: ' + error.message });
    }
});

// Endpoint to download Excel template
app.get('/download-excel-template', (req, res) => {
    // Create a workbook with a template sheet
    const workbook = xlsx.utils.book_new();
    const templateData = [
        {
            'PARTY CODE': 'AA-XXX',
            'PARTY GROUP NAME': 'Group Name Example',
            'GROUP ID/ PHONE NUMBER': '1234567890@g.us', 
            'TYPE': 'GROUP',
            'TIER': 'TIER-NAME'
        }
    ];
    
    const worksheet = xlsx.utils.json_to_sheet(templateData);
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Data sheet');
    
    // Create temp file path
    const tempFilePath = path.join(__dirname, 'template.xlsx');
    
    // Write to a temp file
    xlsx.writeFile(workbook, tempFilePath);
    
    // Send the file
    res.download(tempFilePath, 'whatsapp-contacts-template.xlsx', (err) => {
        // Delete the temp file after sending
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }
        
        if (err) {
            console.error('Error sending template:', err);
        }
    });
});

// Function to send text-only messages to groups
async function sendTextToGroups(message, groups, processId) {
    if (!isConnected || !whatsappSocket) {
        console.error('Cannot send messages: WhatsApp connection not ready');
        const errorResult = {
            processId,
            total: groups.length,
            successful: [],
            failed: groups.map(group => ({
                id: group.id,
                name: group.name,
                error: 'WhatsApp connection not ready'
            })),
            completed: true,
            inProgress: false,
            startTime: Date.now(),
            endTime: Date.now(),
            successCount: 0,
            failureCount: groups.length,
            error: 'WhatsApp connection not ready'
        };
        processStore.set(processId, errorResult);
        return errorResult;
    }
    
    const results = {
        processId,
        total: groups.length,
        successful: [],
        failed: [],
        completed: false,
        inProgress: true,
        startTime: Date.now(),
        errors: []
    };
    
    // Store initial status in the process store
    processStore.set(processId, results);
    
    console.log(`Starting to send text message to ${groups.length} recipients (ProcessID: ${processId})`);
    
    // Send to each group/contact
    for (const group of groups) {
        try {
            // Send the text message
            await whatsappSocket.sendMessage(group.id, { text: message });
            console.log(`✅ Sent to ${group.name || group.id}`);
            results.successful.push({
                id: group.id,
                name: group.name
            });
            
            // Update the process store with current progress
            processStore.set(processId, {
                ...results,
                successCount: results.successful.length,
                failureCount: results.failed.length
            });
        } catch (error) {
            console.error(`❌ Failed to send to ${group.name || group.id}:`, error);
            
            // Determine error type for better error messages
            let errorMessage = error.message;
            
            // Check for common WhatsApp errors from logs
            if (error.name === 'SessionError') {
                if (error.message.includes('Over 2000 messages into the future')) {
                    errorMessage = 'Session sync error: Message queue out of sync';
                } else if (error.message.includes('No matching sessions')) {
                    errorMessage = 'Session error: No matching session found for recipient';
                }
                
                // Add to general errors if not already present
                if (!results.errors.includes(errorMessage)) {
                    results.errors.push(errorMessage);
                }
            }
            
            results.failed.push({
                id: group.id,
                name: group.name,
                error: errorMessage
            });
            
            // Update the process store with current progress
            processStore.set(processId, {
                ...results,
                successCount: results.successful.length,
                failureCount: results.failed.length,
                errors: results.errors
            });
        }
    }
    
    // Mark as completed and update final stats
    results.completed = true;
    results.inProgress = false;
    results.endTime = Date.now();
    results.successCount = results.successful.length;
    results.failureCount = results.failed.length;
    
    // Update the process store with final status
    processStore.set(processId, results);
    
    console.log(`Completed sending process ${processId}: ${results.successful.length} successful, ${results.failed.length} failed`);
    if (results.errors.length > 0) {
        console.log(`Process ${processId} encountered these errors: ${results.errors.join(', ')}`);
    }
    
    return results;
}

// Function to send media to groups using the global WhatsApp connection
async function sendMediaToGroups(mediaPath, caption, groups, mimeType, processId) {
    if (!isConnected || !whatsappSocket) {
        console.error('Cannot send media: WhatsApp connection not ready');
        const errorResult = {
            processId,
            total: groups.length,
            successful: [],
            failed: groups.map(group => ({
                id: group.id,
                name: group.name,
                error: 'WhatsApp connection not ready'
            })),
            completed: true,
            inProgress: false,
            startTime: Date.now(),
            endTime: Date.now(),
            successCount: 0,
            failureCount: groups.length,
            error: 'WhatsApp connection not ready'
        };
        processStore.set(processId, errorResult);
        return errorResult;
    }
    
    const results = {
        processId,
        total: groups.length,
        successful: [],
        failed: [],
        completed: false,
        inProgress: true,
        startTime: Date.now(),
        errors: [] // Track general errors
    };
    
    // Store initial status in the process store
    processStore.set(processId, results);
    
    // Determine file type
    const isVideo = mimeType.startsWith('video/');
    
    console.log(`Starting to send ${isVideo ? 'video' : 'image'} to ${groups.length} recipients (ProcessID: ${processId})`);
    
    // Send to each group/contact
    for (const group of groups) {
        try {
            // Prepare the message based on media type
            let message;
            
            if (isVideo) {
                message = {
                    video: { url: mediaPath },
                    caption: caption,
                    mimetype: mimeType
                };
            } else {
                message = {
                    image: { url: mediaPath },
                    caption: caption,
                    mimetype: mimeType
                };
            }
            
            // Send the message
            await whatsappSocket.sendMessage(group.id, message);
            console.log(`✅ Sent to ${group.name || group.id}`);
            results.successful.push({
                id: group.id,
                name: group.name
            });
            
            // Update the process store with current progress
            processStore.set(processId, {
                ...results,
                successCount: results.successful.length,
                failureCount: results.failed.length
            });
        } catch (error) {
            console.error(`❌ Failed to send to ${group.name || group.id}:`, error);
            
            // Determine error type for better error messages
            let errorMessage = error.message;
            
            // Check for common WhatsApp errors from logs
            if (error.name === 'SessionError') {
                if (error.message.includes('Over 2000 messages into the future')) {
                    errorMessage = 'Session sync error: Message queue out of sync';
                } else if (error.message.includes('No matching sessions')) {
                    errorMessage = 'Session error: No matching session found for recipient';
                }
                
                // Add to general errors if not already present
                if (!results.errors.includes(errorMessage)) {
                    results.errors.push(errorMessage);
                }
            }
            
            results.failed.push({
                id: group.id,
                name: group.name,
                error: errorMessage
            });
            
            // Update the process store with current progress
            processStore.set(processId, {
                ...results,
                successCount: results.successful.length,
                failureCount: results.failed.length,
                errors: results.errors
            });
        }
    }
    
    // Mark as completed and update final stats
    results.completed = true;
    results.inProgress = false;
    results.endTime = Date.now();
    results.successCount = results.successful.length;
    results.failureCount = results.failed.length;
    
    // Update the process store with final status
    processStore.set(processId, results);
    
    console.log(`Completed sending process ${processId}: ${results.successful.length} successful, ${results.failed.length} failed`);
    if (results.errors.length > 0) {
        console.log(`Process ${processId} encountered these errors: ${results.errors.join(', ')}`);
    }
    
    return results;
}

// Endpoint to check status of a sending process
app.get('/status/:processId', (req, res) => {
    const processId = req.params.processId;
    
    // Check if the process exists in our store
    if (!processStore.has(processId)) {
        return res.status(404).json({
            success: false,
            message: `Process ID ${processId} not found`
        });
    }
    
    // Get the process status from the store
    const processStatus = processStore.get(processId);
    
    // Return the actual status
    res.json({
        processId: processId,
        completed: processStatus.completed,
        inProgress: processStatus.inProgress,
        successCount: processStatus.successful.length,
        failureCount: processStatus.failed.length,
        total: processStatus.total,
        startTime: processStatus.startTime,
        endTime: processStatus.endTime || null,
        successful: processStatus.successful,
        failed: processStatus.failed,
        errors: processStatus.errors || [],
        error: processStatus.error || null
    });
});

// Update the connection status endpoint
app.get('/connection-status', (req, res) => {
    res.json({
        connected: isConnected,
        status: isConnected ? 'connected' : 'disconnected',
        idleTimeoutMinutes: CONNECTION_IDLE_TIMEOUT / 60000
    });
});

// Update the reset-connection endpoint
app.post('/reset-connection', (req, res) => {
    try {
        // Close the current connection if it exists
        if (whatsappSocket) {
            console.log('Closing existing WhatsApp connection');
            whatsappSocket = null;
            isConnected = false;
        }
        
        // Clear idle timeout
        if (connectionTimeout) {
            clearTimeout(connectionTimeout);
            connectionTimeout = null;
        }
        
        // Prevent auto-reconnection temporarily
        reconnectCooldown = true;
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
        }
        
        // Clear auth folder
        if (fs.existsSync(AUTH_PATH)) {
            try {
                const files = fs.readdirSync(AUTH_PATH);
                files.forEach(file => {
                    const filePath = path.join(AUTH_PATH, file);
                    fs.unlinkSync(filePath);
                });
                console.log('Auth folder cleared successfully');
            } catch (err) {
                console.error('Error clearing auth folder:', err);
                return res.status(500).json({
                    success: false,
                    message: `Error clearing auth files: ${err.message}`
                });
            }
        }
        
        // Reset cooldown after a delay
        setTimeout(() => {
            reconnectCooldown = false;
        }, 5000);
        
        res.json({
            success: true,
            message: 'WhatsApp connection reset successfully. The next operation will establish a new connection.'
        });
    } catch (error) {
        console.error('Error resetting connection:', error);
        res.status(500).json({
            success: false,
            message: `Error resetting connection: ${error.message}`
        });
    }
});

// Add an explicit connect endpoint
app.post('/connect-whatsapp', async (req, res) => {
    try {
        await ensureWhatsAppConnection();
        res.json({
            success: true,
            message: 'WhatsApp connection established successfully',
            connected: true
        });
    } catch (error) {
        console.error('Error connecting to WhatsApp:', error);
        res.status(500).json({
            success: false,
            message: `Error connecting to WhatsApp: ${error.message}`,
            connected: false
        });
    }
});

// Add an explicit disconnect endpoint
app.post('/disconnect-whatsapp', (req, res) => {
    try {
        if (whatsappSocket) {
            // Just set the connection state to false without logging out
            console.log('Pausing WhatsApp connection at user request');
            isConnected = false;
            whatsappSocket = null;
            
            // Clear idle timeout
            if (connectionTimeout) {
                clearTimeout(connectionTimeout);
                connectionTimeout = null;
            }
            
            res.json({
                success: true,
                message: 'WhatsApp connection paused successfully',
                connected: false
            });
        } else {
            res.json({
                success: true,
                message: 'WhatsApp was not connected',
                connected: false
            });
        }
    } catch (error) {
        console.error('Error pausing WhatsApp connection:', error);
        res.status(500).json({
            success: false,
            message: `Error pausing WhatsApp connection: ${error.message}`
        });
    }
});

// Endpoint to get WhatsApp contact details (for personal contacts)
app.get('/contact-details/:contactId', async (req, res) => {
    try {
        const { contactId } = req.params;
        
        try {
            await ensureWhatsAppConnection();
        } catch (connError) {
            return res.status(503).json({
                success: false,
                message: 'Could not establish WhatsApp connection: ' + connError.message
            });
        }
        
        // Try to fetch contact information
        try {
            // Get the contact's profile picture using the helper function
            const ppUrl = await safeProfilePictureUrl(contactId);
            
            // Get contact status if available
            const status = await whatsappSocket.fetchStatus(contactId).catch(() => null);
            
            // Format the response
            const formattedResponse = {
                id: contactId,
                name: contactId.split('@')[0], // Basic name from ID
                profilePictureUrl: ppUrl,
                status: status ? status.status : null,
                lastSeen: null, // WhatsApp generally doesn't provide this easily
                isContact: true,
                isPersonal: true
            };
            
            res.json({
                success: true,
                contact: formattedResponse
            });
        } catch (error) {
            console.error('Error fetching contact details:', error);
            return res.status(404).json({ 
                success: false, 
                message: `Could not fetch details for contact: ${error.message}` 
            });
        }
    } catch (error) {
        console.error('Error in contact details endpoint:', error);
        res.status(500).json({ success: false, message: 'Server error: ' + error.message });
    }
});

// Add an endpoint to get the current QR code if available
app.get('/get-qr-code', (req, res) => {
    try {
        if (latestQrCode) {
            res.json({
                success: true,
                qrCode: latestQrCode
            });
        } else {
            // If we don't have a QR code and we're not connected, try to get one
            if (!isConnected && !whatsappSocket) {
                // Trigger connection initialization to get a QR code
                initializeWhatsAppConnection();
            }
            
            res.json({
                success: false,
                message: 'No QR code available at the moment, check again in a few seconds'
            });
        }
    } catch (error) {
        console.error('Error getting QR code:', error);
        res.status(500).json({
            success: false,
            message: `Error getting QR code: ${error.message}`
        });
    }
});

// Initialize WhatsApp connection when server starts - NO LONGER NECESSARY
if (require.main === module) {
    // Only start the server if this file is run directly
    // We no longer automatically connect to WhatsApp on server start
    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
        console.log(`Open http://localhost:${port} in your browser to use the WhatsApp bulk sender`);
        console.log(`WhatsApp connection will be established when needed`);
    });
}

// Export functions for testing/external use
module.exports = {
    findColumnValue,
    safeProfilePictureUrl,
    readContactLists,
    writeContactLists,
    initializeWhatsAppConnection,
    ensureWhatsAppConnection
}; 