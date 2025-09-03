# DarkNotes - Zero-Knowledge Encrypted Notes Demo App

A beautiful, secure notes application that demonstrates DarkAuth's zero-knowledge authentication and encryption capabilities.

## Features

- 🔐 **Zero-Knowledge Authentication**: Passwords never leave your device
- 🔒 **End-to-End Encryption**: All note content is encrypted client-side
- 👥 **Secure Sharing**: Share notes with other users using public key cryptography
- ✨ **Rich Text Editor**: Full-featured editor with formatting options
- 🎨 **Beautiful UI**: Modern, responsive design with dark mode support
- 📁 **Collections**: Organize notes into encrypted collections
- 🏷️ **Tags**: Categorize notes with encrypted tags
- 🔄 **Real-time Sync**: Changes sync across devices securely

## Architecture

### Security Model

1. **Authentication**: Uses OPAQUE (RFC 9380) for password authentication
2. **Key Derivation**: 
   - Master Key (MK) derived from OPAQUE export_key
   - Data Root Key (DRK) generated once, wrapped with KW derived from MK
   - Per-note encryption keys derived from DRK using HKDF
3. **Sharing**: 
   - Each user has an ECDH keypair (P-256)
   - Note DEKs are wrapped with recipient's public key
   - Server never sees plaintext content or keys

### Tech Stack

- **Frontend**: React, TypeScript, TailwindCSS, TipTap editor
- **State Management**: Zustand (minimal, functional)
- **Encryption**: Web Crypto API, JOSE for JWE
- **Backend**: Node.js with minimal dependencies
- **Database**: PostgreSQL for encrypted data storage

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL database
- DarkAuth server running (see main project)

### Installation

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Initialize database
npm run demodb:push

# Start the API server
npm run server

# In another terminal, start the dev server
npm run dev
```

### Environment Variables

```env
# DarkAuth configuration
DARKAUTH_ISSUER=http://localhost:9080
VITE_DARKAUTH_ISSUER=http://localhost:9080
VITE_CLIENT_ID=app-web
VITE_REDIRECT_URI=http://localhost:9092/

# API server
DEMO_APP_PORT=9093
VITE_DEMO_API=http://localhost:9093

# Database
POSTGRES_URI=postgresql://DarkAuth:DarkAuth_password@localhost:5432/DarkAuth
```

## Usage

1. **First Login**: 
   - You'll be redirected to DarkAuth for authentication
   - On first login, a DRK is generated and encrypted with your password-derived key
   - A user keypair is generated for note sharing

2. **Creating Notes**:
   - Click "New Note" to create an encrypted note
   - Use the rich text editor to format your content
   - Notes are automatically saved and encrypted

3. **Sharing Notes**:
   - Click the share button on any note
   - Search for users by name or email
   - Grant read or write permissions
   - The note's DEK is encrypted with the recipient's public key

4. **Collections**:
   - Group related notes into collections
   - Share entire collections with team members
   - Each collection has its own encryption key

## Development

### Project Structure

```
packages/demo-app/
├── src/
│   ├── components/       # React components
│   │   ├── Dashboard/    # Notes grid and cards
│   │   ├── Editor/       # Rich text editor
│   │   ├── Layout/       # App layout components
│   │   └── Auth/         # Authentication flow
│   ├── services/         # API and crypto services
│   ├── stores/           # Zustand state stores
│   ├── styles/           # Global CSS with Tailwind
│   └── App.tsx           # Main app with routing
├── server.ts             # API server
└── package.json
```

### API Endpoints

- `GET /demo/health` - Health check
- `GET/PUT /demo/users/me` - User profile management
- `GET /demo/users/:sub` - Get user by ID
- `GET /demo/users/search?q=` - Search users
- `GET/POST /demo/notes` - List and create notes
- `GET/POST /demo/notes/:id/changes` - Note content CRDT
- `POST /demo/notes/:id/share` - Share note with user
- `GET /demo/notes/:id/access` - List note permissions
- `GET/POST /demo/collections` - Manage collections

### Security Considerations

- All cryptographic operations use Web Crypto API
- Keys are derived using HKDF-SHA256
- Encryption uses AES-GCM with 256-bit keys
- Public key operations use ECDH-ES with P-256
- No sensitive data in localStorage (only refresh tokens)
- Server validates all permissions on every request

## Contributing

See the main DarkAuth project for contribution guidelines.

## License

Part of the DarkAuth project - see main repository for license details.