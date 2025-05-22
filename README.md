# WhatsApp Bulk Sender

A powerful web application for sending messages to multiple WhatsApp contacts and groups simultaneously. Built with the vibe of making group communication easier! ✨

## Features

- **Bulk Messaging**: Send messages to multiple contacts or groups at once
- **Group Management**: View and manage WhatsApp groups
- **File Attachments**: Send images, documents, and other media files
- **Authentication**: Secure access to the application
- **Web Interface**: User-friendly interface for easy operation
- **Excel Import/Export**: Easily manage contact lists with spreadsheet integration
- **QR Code Login**: Seamless connection to WhatsApp Web

## Technology Stack

This application is built using:
- **[Baileys](https://github.com/WhiskeySockets/Baileys)**: A powerful WhatsApp Web API library
- **Express.js**: Backend web framework
- **Bootstrap**: Frontend UI components
- **Node.js**: JavaScript runtime
- **Multer**: File upload handling
- **XLSX**: Excel file processing

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) (v14.0.0 or higher)
- A device with WhatsApp Web access
- Modern web browser (Chrome recommended)

### Setup

1. Clone this repository:
   ```
   git clone https://github.com/Ivorisnoob/Whatsapp-bullk-sender.git
   cd whatsapp-bulk-sender
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create the authentication configuration:
   - Create an `auth` directory
   - Configure your authentication settings (see Configuration section)

4. Start the application:
   ```
   node server.js
   ```

5. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

## Usage

### Sending Messages

1. Log in to the application by scanning the WhatsApp QR code
2. Select contacts or groups from your list
3. Compose your message
4. Attach files if needed (images, videos supported)
5. Click send and watch the magic happen

### Managing Groups

Use the groups management interface to:
- View all available groups
- Create new group lists
- Edit existing groups
- Import/export group data
- Fetch group details directly from WhatsApp

## Configuration

### Authentication

The application uses WhatsApp Web authentication via QR code scanning. The session data is stored in the `auth` directory to maintain your login session.

### Group Lists

Group data is stored in `groups_lists.json`. You can:
- Import contacts from Excel files
- Manually add contacts
- Create custom group lists
- Categorize contacts by tier and type

## Data Privacy & Security

This application runs locally on your machine. Your WhatsApp data and messages are not stored on external servers. All communication happens directly between your browser and WhatsApp's servers through your authenticated session.

## Free & Non-Commercial Use

This WhatsApp Bulk Sender is:
- **100% Free to use**: No hidden costs or premium features
- **Open Source**: Modify it to suit your needs
- **Non-profit**: Created for community benefit, not commercial gain
- **No tracking**: Your data stays on your device

## License

MIT License - Feel free to use, modify, and distribute as needed!

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Disclaimers

- This tool uses the unofficial WhatsApp Web API through the Baileys library
- WhatsApp may implement changes that could affect this application's functionality
- This software is not affiliated with, authorized by, endorsed by, or in any way connected with WhatsApp LLC
- Mass messaging may be subject to rate limits imposed by WhatsApp
- Misuse of this tool may result in your WhatsApp account being banned

## Responsible Usage

This tool is meant for legitimate bulk messaging purposes only, such as:
- Community announcements
- Business updates to customer groups
- Organization communications

Please use responsibly and in accordance with WhatsApp's terms of service. Do not use for spam, harassment, or any illegal activities. 