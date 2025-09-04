# DarkAuth Custom Branding Specification

**Status:** Ready for Implementation  
**Version:** 1.0  
**Created:** 2025-09-04

## Executive Summary

This specification defines a comprehensive custom branding system for DarkAuth that enables administrators to fully customize the appearance and text of the user-facing authentication interface through the admin portal. The system supports logo customization, color theming, text localization, and advanced CSS customization while maintaining security and performance.

---

## 1. Architecture Overview

### Core Principles
- **Zero Configuration Required**: Default DarkAuth branding works out of the box
- **Database-Driven**: All branding stored in PostgreSQL `settings` table
- **Runtime Delivery**: Branding served dynamically via `/config.js`
- **Security First**: All custom content sanitized and validated
- **Performance Optimized**: Cached branding assets with efficient delivery

### Component Architecture
```
Admin UI (Port 9081)          API Layer              User UI (Port 9080)
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│ Settings Page   │─────▶│ Settings API    │      │ Login/Register  │
│ - Branding Tab  │      │ - Store/Retrieve│      │ - Apply Branding│
│ - Live Preview  │      │ - Serve Assets  │◀─────│ - Custom CSS    │
└─────────────────┘      └─────────────────┘      └─────────────────┘
                              │
                              ▼
                         ┌─────────────────┐
                         │   PostgreSQL    │
                         │ settings table  │
                         │ branding.*      │
                         └─────────────────┘
```

---

## 2. Database Schema

### Settings Table Structure
All branding configuration stored in the existing `settings` table with keys prefixed by `branding.`

```sql
-- Branding settings stored as JSON values
INSERT INTO settings (key, value, secure, category, name) VALUES
  ('branding.identity', '{"title":"DarkAuth","tagline":"Secure Zero-Knowledge Authentication"}', false, 'Branding/Identity', 'Brand Identity'),
  ('branding.logo', '{"data":null,"mimeType":null}', false, 'Branding/Identity', 'Logo Image'),
  ('branding.favicon', '{"data":null,"mimeType":null}', false, 'Branding/Identity', 'Favicon'),
  ('branding.colors', '{...}', false, 'Branding/Appearance', 'Color Scheme'),
  ('branding.wording', '{...}', false, 'Branding/Text', 'UI Text'),
  ('branding.custom_css', '""', false, 'Branding/Advanced', 'Custom CSS'),
  ('branding.font', '{"family":"system-ui","size":"16px"}', false, 'Branding/Appearance', 'Typography');
```

### Branding Data Model

```typescript
interface BrandingConfig {
  identity: {
    title: string;              // Default: "DarkAuth"
    tagline: string;           // Default: "Secure Zero-Knowledge Authentication"
  };
  
  logo: {
    data: string | null;       // Base64 encoded image
    mimeType: string | null;   // image/png, image/svg+xml, etc.
  };
  
  favicon: {
    data: string | null;       // Base64 encoded favicon
    mimeType: string | null;
  };
  
  colors: {
    // Background colors
    backgroundGradientStart: string;  // Default: "#f3f4f6"
    backgroundGradientEnd: string;    // Default: "#eff6ff"
    backgroundAngle: string;          // Default: "135deg"
    
    // Primary palette
    primary: string;           // Default: "#3b82f6"
    primaryHover: string;      // Default: "#2563eb"
    primaryLight: string;      // Default: "#dbeafe"
    primaryDark: string;       // Default: "#1d4ed8"
    
    // Secondary palette
    secondary: string;         // Default: "#6b7280"
    secondaryHover: string;    // Default: "#4b5563"
    
    // Semantic colors
    success: string;           // Default: "#10b981"
    error: string;             // Default: "#ef4444"
    warning: string;           // Default: "#f59e0b"
    info: string;              // Default: "#3b82f6"
    
    // UI colors
    text: string;              // Default: "#111827"
    textSecondary: string;     // Default: "#6b7280"
    textMuted: string;         // Default: "#9ca3af"
    border: string;            // Default: "#e5e7eb"
    cardBackground: string;    // Default: "#ffffff"
    cardShadow: string;        // Default: "rgba(0,0,0,0.1)"
    inputBackground: string;   // Default: "#ffffff"
    inputBorder: string;       // Default: "#d1d5db"
    inputFocus: string;        // Default: "#3b82f6"
  };
  
  wording: {
    // Page titles
    welcomeBack: string;       // Default: "Welcome back"
    createAccount: string;     // Default: "Create your account"
    
    // Form labels
    email: string;            // Default: "Email"
    emailPlaceholder: string; // Default: "Enter your email"
    password: string;         // Default: "Password"
    passwordPlaceholder: string; // Default: "Enter your password"
    confirmPassword: string;  // Default: "Confirm Password"
    confirmPasswordPlaceholder: string; // Default: "Confirm your password"
    
    // Buttons
    signin: string;           // Default: "Continue"
    signingIn: string;        // Default: "Signing in..."
    signup: string;           // Default: "Sign up"
    signingUp: string;        // Default: "Creating account..."
    signout: string;          // Default: "Sign Out"
    changePassword: string;   // Default: "Change Password"
    cancel: string;           // Default: "Cancel"
    authorize: string;        // Default: "Authorize"
    deny: string;             // Default: "Deny"
    
    // Links and messages
    noAccount: string;        // Default: "Don't have an account?"
    hasAccount: string;       // Default: "Already have an account?"
    forgotPassword: string;   // Default: "Forgot your password?"
    signedInAs: string;       // Default: "Signed in as"
    
    // Success/Error messages
    successAuth: string;      // Default: "Successfully authenticated"
    errorGeneral: string;     // Default: "An error occurred. Please try again."
    errorNetwork: string;     // Default: "Network error. Please check your connection."
    errorInvalidCreds: string; // Default: "Invalid email or password."
    
    // Authorization page
    authorizeTitle: string;   // Default: "Authorize Application"
    authorizeDescription: string; // Default: "{app} would like to:"
    scopeProfile: string;     // Default: "Access your profile information"
    scopeEmail: string;       // Default: "Access your email address"
    scopeOpenid: string;      // Default: "Authenticate you"
  };
  
  font: {
    family: string;           // Default: "system-ui, -apple-system, sans-serif"
    size: string;             // Default: "16px"
    weight: {
      normal: string;         // Default: "400"
      medium: string;         // Default: "500"
      bold: string;           // Default: "700"
    };
  };
  
  customCSS: string;          // Custom CSS to inject
}
```

---

## 3. Admin UI Implementation

### A. Settings Page Integration

The existing Settings page will automatically display branding settings under the "Branding" category with specialized components:

```typescript
// Special component mapping for branding settings
const brandingComponents = {
  'branding.logo': ImageUploadField,
  'branding.favicon': ImageUploadField,
  'branding.colors': ColorSchemeEditor,
  'branding.wording': TextMappingEditor,
  'branding.custom_css': CSSEditor,
};
```

### B. Specialized Components

#### ImageUploadField Component
```typescript
interface ImageUploadFieldProps {
  value: { data: string | null; mimeType: string | null };
  onChange: (value: { data: string; mimeType: string }) => void;
  accept?: string;  // "image/png,image/jpeg,image/svg+xml"
  maxSize?: number; // 2MB default
}

// Features:
// - Drag & drop upload
// - Preview current image
// - Clear/reset to default
// - Image optimization (resize if needed)
// - Format validation
```

#### ColorSchemeEditor Component
```typescript
interface ColorSchemeEditorProps {
  value: BrandingConfig['colors'];
  onChange: (colors: BrandingConfig['colors']) => void;
}

// Features:
// - Color picker for each color
// - Preset color schemes
// - Import/export palette
// - Live preview
// - Reset to defaults
```

#### CSSEditor Component
```typescript
interface CSSEditorProps {
  value: string;
  onChange: (css: string) => void;
}

// Features:
// - Syntax highlighting (CodeMirror/Monaco)
// - CSS validation
// - Auto-complete for .da-* classes
// - Live preview
// - CSS minification on save
```

### C. Live Preview Feature

```typescript
interface BrandingPreviewProps {
  branding: BrandingConfig;
}

// Iframe showing user-ui with:
// - Real-time updates
// - Device size simulation
// - Dark/light mode toggle
// - Sample data (mock login form)
```

---

## 4. API Layer Implementation

### A. Configuration Delivery

Update `/config.js` endpoint to include branding:

```typescript
// packages/api/src/http/createServer.ts
if (request.method === "GET" && pathname === "/config.js") {
  const branding = await getBrandingConfig(context);
  
  const payload = {
    issuer,
    clientId,
    redirectUri,
    branding: {
      identity: branding.identity,
      colors: branding.colors,
      wording: branding.wording,
      font: branding.font,
      customCSS: sanitizeCSS(branding.customCSS),
      logoUrl: branding.logo.data ? '/api/branding/logo' : null,
      faviconUrl: branding.favicon.data ? '/api/branding/favicon' : null,
    }
  };
  
  const js = `window.__APP_CONFIG__=${JSON.stringify(payload)};`;
  response.setHeader("Content-Type", "application/javascript");
  response.setHeader("Cache-Control", "public, max-age=300"); // 5 min cache
  response.end(js);
}
```

### B. Asset Serving Endpoints

```typescript
// GET /api/branding/logo
router.get('/api/branding/logo', async (req, res) => {
  const logo = await getSetting(context, 'branding.logo');
  if (!logo?.data) {
    return res.status(404).end();
  }
  
  const buffer = Buffer.from(logo.data, 'base64');
  res.setHeader('Content-Type', logo.mimeType);
  res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 hour cache
  res.end(buffer);
});

// GET /api/branding/favicon
router.get('/api/branding/favicon', async (req, res) => {
  const favicon = await getSetting(context, 'branding.favicon');
  if (!favicon?.data) {
    // Serve default favicon
    return res.redirect('/favicon.svg');
  }
  
  const buffer = Buffer.from(favicon.data, 'base64');
  res.setHeader('Content-Type', favicon.mimeType);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.end(buffer);
});
```

### C. Security & Validation

```typescript
// CSS Sanitization
function sanitizeCSS(css: string): string {
  // Remove dangerous properties
  const dangerous = [
    'javascript:',
    'expression(',
    '@import',
    '@charset',
    'behavior:',
    '-moz-binding',
  ];
  
  let sanitized = css;
  for (const pattern of dangerous) {
    sanitized = sanitized.replace(new RegExp(pattern, 'gi'), '');
  }
  
  // Validate CSS syntax
  try {
    // Use a CSS parser to validate
    validateCSS(sanitized);
  } catch (e) {
    throw new Error('Invalid CSS syntax');
  }
  
  return sanitized;
}

// Image validation
function validateImage(data: string, mimeType: string): void {
  const buffer = Buffer.from(data, 'base64');
  
  // Check file size (max 2MB)
  if (buffer.length > 2 * 1024 * 1024) {
    throw new Error('Image too large (max 2MB)');
  }
  
  // Validate mime type
  const allowedTypes = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/x-icon'];
  if (!allowedTypes.includes(mimeType)) {
    throw new Error('Invalid image type');
  }
  
  // Additional validation for SVG
  if (mimeType === 'image/svg+xml') {
    sanitizeSVG(buffer.toString());
  }
}
```

---

## 5. User UI Implementation

### A. Semantic Class Names

All components must have semantic class names for CSS targeting:

```css
/* Root elements */
.da-app                     /* Root application container */
.da-container               /* Main content container */

/* Header */
.da-header                  /* Header wrapper */
.da-brand                   /* Brand container */
.da-brand-icon             /* Logo/icon element */
.da-brand-title            /* Brand title text */
.da-tagline                /* Tagline text */

/* Authentication */
.da-auth-container         /* Auth form container */
.da-auth-header           /* Auth form header */
.da-auth-title            /* Form title (Welcome back, etc) */

/* Forms */
.da-form                   /* Form element */
.da-form-group            /* Form field wrapper */
.da-form-label            /* Field label */
.da-form-input            /* Input field */
.da-form-input-error      /* Input with error state */
.da-form-error            /* Error message */
.da-form-helper           /* Helper text */
.da-form-submit           /* Submit button */
.da-form-submit-loading   /* Submit button loading state */

/* Buttons */
.da-button                 /* Generic button */
.da-button-primary        /* Primary button */
.da-button-secondary      /* Secondary button */
.da-button-link           /* Link-style button */
.da-button-danger         /* Danger/destructive button */

/* Links & Footer */
.da-form-footer           /* Form footer container */
.da-form-link            /* Link in form footer */
.da-link                 /* Generic link */

/* User session */
.da-user-info            /* User info display */
.da-user-name            /* User name display */
.da-logout-button        /* Logout button */

/* Success state */
.da-success-container    /* Success page container */
.da-success-icon        /* Success checkmark icon */
.da-success-title       /* Success message title */
.da-success-details     /* Success details */

/* Authorization */
.da-authorize-container  /* OAuth authorize container */
.da-authorize-app       /* App requesting auth */
.da-authorize-scopes    /* Scope list */
.da-authorize-scope     /* Individual scope */
.da-authorize-actions   /* Approve/deny buttons */

/* Utilities */
.da-loading             /* Loading state */
.da-loading-spinner     /* Loading spinner */
.da-error-message       /* Error message display */
.da-info-message        /* Info message display */
```

### B. Branding Application Hook

```typescript
// packages/user-ui/src/hooks/useBranding.ts
import { useEffect } from 'react';

interface BrandingConfig {
  identity: { title: string; tagline: string };
  colors: Record<string, string>;
  wording: Record<string, string>;
  font: { family: string; size: string; weight: Record<string, string> };
  customCSS: string;
  logoUrl: string | null;
  faviconUrl: string | null;
}

export function useBranding() {
  useEffect(() => {
    const config = window.__APP_CONFIG__;
    if (!config?.branding) return;
    
    const branding = config.branding as BrandingConfig;
    
    // 1. Update document title
    document.title = branding.identity.title;
    
    // 2. Update favicon
    if (branding.faviconUrl) {
      updateFavicon(branding.faviconUrl);
    }
    
    // 3. Apply color scheme as CSS variables
    applyColorScheme(branding.colors);
    
    // 4. Apply typography
    applyTypography(branding.font);
    
    // 5. Inject custom CSS
    if (branding.customCSS) {
      injectCustomCSS(branding.customCSS);
    }
    
    // 6. Store wording for use in components
    window.__BRANDING_WORDING__ = branding.wording;
    
    // 7. Store logo URL
    window.__BRANDING_LOGO__ = branding.logoUrl;
    
  }, []);
  
  return {
    getText: (key: string, defaultValue: string) => {
      return window.__BRANDING_WORDING__?.[key] || defaultValue;
    },
    getLogoUrl: () => window.__BRANDING_LOGO__ || '/favicon.svg',
    getTitle: () => window.__APP_CONFIG__?.branding?.identity?.title || 'DarkAuth',
    getTagline: () => window.__APP_CONFIG__?.branding?.identity?.tagline || 'Secure Zero-Knowledge Authentication',
  };
}

function updateFavicon(url: string) {
  // Remove existing favicons
  const existingLinks = document.querySelectorAll("link[rel*='icon']");
  existingLinks.forEach(link => link.remove());
  
  // Add new favicon
  const link = document.createElement('link');
  link.rel = 'icon';
  link.href = url;
  document.head.appendChild(link);
}

function applyColorScheme(colors: Record<string, string>) {
  const root = document.documentElement;
  
  // Map branding colors to CSS variables
  const colorMap = {
    backgroundGradientStart: '--da-bg-gradient-start',
    backgroundGradientEnd: '--da-bg-gradient-end',
    backgroundAngle: '--da-bg-angle',
    primary: '--da-primary',
    primaryHover: '--da-primary-hover',
    primaryLight: '--da-primary-light',
    primaryDark: '--da-primary-dark',
    secondary: '--da-secondary',
    secondaryHover: '--da-secondary-hover',
    success: '--da-success',
    error: '--da-error',
    warning: '--da-warning',
    info: '--da-info',
    text: '--da-text',
    textSecondary: '--da-text-secondary',
    textMuted: '--da-text-muted',
    border: '--da-border',
    cardBackground: '--da-card-bg',
    cardShadow: '--da-card-shadow',
    inputBackground: '--da-input-bg',
    inputBorder: '--da-input-border',
    inputFocus: '--da-input-focus',
  };
  
  Object.entries(colorMap).forEach(([brandingKey, cssVar]) => {
    if (colors[brandingKey]) {
      root.style.setProperty(cssVar, colors[brandingKey]);
    }
  });
}

function applyTypography(font: BrandingConfig['font']) {
  const root = document.documentElement;
  root.style.setProperty('--da-font-family', font.family);
  root.style.setProperty('--da-font-size', font.size);
  root.style.setProperty('--da-font-weight-normal', font.weight.normal);
  root.style.setProperty('--da-font-weight-medium', font.weight.medium);
  root.style.setProperty('--da-font-weight-bold', font.weight.bold);
}

function injectCustomCSS(css: string) {
  // Remove any existing custom branding CSS
  const existing = document.getElementById('da-custom-branding');
  if (existing) {
    existing.remove();
  }
  
  // Create and inject new style element
  const style = document.createElement('style');
  style.id = 'da-custom-branding';
  style.textContent = css;
  document.head.appendChild(style);
}
```

### C. Component Updates

Example of updated Login component with branding support:

```typescript
// packages/user-ui/src/components/Login.tsx
import { useBranding } from '../hooks/useBranding';

export default function Login({ onLogin, onSwitchToRegister }: LoginProps) {
  const branding = useBranding();
  
  return (
    <div className="da-auth-container">
      <h2 className="da-auth-title">
        {branding.getText('welcomeBack', 'Welcome back')}
      </h2>
      
      <form className="da-form" onSubmit={handleSubmit}>
        <div className="da-form-group">
          <label className="da-form-label">
            {branding.getText('email', 'Email')}
          </label>
          <input
            className="da-form-input"
            placeholder={branding.getText('emailPlaceholder', 'Enter your email')}
            // ...
          />
        </div>
        
        <div className="da-form-group">
          <label className="da-form-label">
            {branding.getText('password', 'Password')}
          </label>
          <input
            className="da-form-input"
            placeholder={branding.getText('passwordPlaceholder', 'Enter your password')}
            // ...
          />
        </div>
        
        <button type="submit" className="da-button da-button-primary da-form-submit">
          {loading 
            ? branding.getText('signingIn', 'Signing in...') 
            : branding.getText('signin', 'Continue')
          }
        </button>
      </form>
      
      <div className="da-form-footer">
        <p>
          {branding.getText('noAccount', "Don't have an account?")}{" "}
          <button className="da-button-link" onClick={onSwitchToRegister}>
            {branding.getText('signup', 'Sign up')}
          </button>
        </p>
      </div>
    </div>
  );
}
```

### D. Updated CSS Structure

```css
/* packages/user-ui/src/App.css */
:root {
  /* Branding color variables */
  --da-bg-gradient-start: #f3f4f6;
  --da-bg-gradient-end: #eff6ff;
  --da-bg-angle: 135deg;
  --da-primary: #3b82f6;
  --da-primary-hover: #2563eb;
  --da-primary-light: #dbeafe;
  --da-primary-dark: #1d4ed8;
  --da-secondary: #6b7280;
  --da-secondary-hover: #4b5563;
  --da-success: #10b981;
  --da-error: #ef4444;
  --da-warning: #f59e0b;
  --da-info: #3b82f6;
  --da-text: #111827;
  --da-text-secondary: #6b7280;
  --da-text-muted: #9ca3af;
  --da-border: #e5e7eb;
  --da-card-bg: #ffffff;
  --da-card-shadow: rgba(0, 0, 0, 0.1);
  --da-input-bg: #ffffff;
  --da-input-border: #d1d5db;
  --da-input-focus: #3b82f6;
  
  /* Typography variables */
  --da-font-family: system-ui, -apple-system, sans-serif;
  --da-font-size: 16px;
  --da-font-weight-normal: 400;
  --da-font-weight-medium: 500;
  --da-font-weight-bold: 700;
}

/* Use CSS variables throughout */
body {
  background: linear-gradient(
    var(--da-bg-angle),
    var(--da-bg-gradient-start) 0%,
    var(--da-bg-gradient-end) 100%
  );
  color: var(--da-text);
  font-family: var(--da-font-family);
  font-size: var(--da-font-size);
}

.da-button-primary {
  background-color: var(--da-primary);
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 0.5rem;
  font-weight: var(--da-font-weight-medium);
  cursor: pointer;
  transition: background-color 0.2s;
}

.da-button-primary:hover {
  background-color: var(--da-primary-hover);
}

.da-form-input {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid var(--da-input-border);
  border-radius: 0.375rem;
  background: var(--da-input-bg);
  color: var(--da-text);
  transition: border-color 0.2s;
}

.da-form-input:focus {
  outline: none;
  border-color: var(--da-input-focus);
  box-shadow: 0 0 0 3px var(--da-primary-light);
}

/* ... rest of styles using CSS variables ... */
```

---

## 6. Migration & Installation

### A. Database Migration

```sql
-- Migration: Add default branding settings
INSERT INTO settings (key, value, secure, category, name) VALUES
('branding.identity', '{"title":"DarkAuth","tagline":"Secure Zero-Knowledge Authentication"}', false, 'Branding/Identity', 'Brand Identity'),
('branding.colors', '{"primary":"#3b82f6","primaryHover":"#2563eb","primaryLight":"#dbeafe","primaryDark":"#1d4ed8","secondary":"#6b7280","secondaryHover":"#4b5563","success":"#10b981","error":"#ef4444","warning":"#f59e0b","info":"#3b82f6","text":"#111827","textSecondary":"#6b7280","textMuted":"#9ca3af","border":"#e5e7eb","cardBackground":"#ffffff","cardShadow":"rgba(0,0,0,0.1)","inputBackground":"#ffffff","inputBorder":"#d1d5db","inputFocus":"#3b82f6","backgroundGradientStart":"#f3f4f6","backgroundGradientEnd":"#eff6ff","backgroundAngle":"135deg"}', false, 'Branding/Appearance', 'Color Scheme'),
('branding.wording', '{"welcomeBack":"Welcome back","createAccount":"Create your account","email":"Email","emailPlaceholder":"Enter your email","password":"Password","passwordPlaceholder":"Enter your password","confirmPassword":"Confirm Password","confirmPasswordPlaceholder":"Confirm your password","signin":"Continue","signingIn":"Signing in...","signup":"Sign up","signingUp":"Creating account...","signout":"Sign Out","changePassword":"Change Password","cancel":"Cancel","authorize":"Authorize","deny":"Deny","noAccount":"Don''t have an account?","hasAccount":"Already have an account?","forgotPassword":"Forgot your password?","signedInAs":"Signed in as","successAuth":"Successfully authenticated","errorGeneral":"An error occurred. Please try again.","errorNetwork":"Network error. Please check your connection.","errorInvalidCreds":"Invalid email or password.","authorizeTitle":"Authorize Application","authorizeDescription":"{app} would like to:","scopeProfile":"Access your profile information","scopeEmail":"Access your email address","scopeOpenid":"Authenticate you"}', false, 'Branding/Text', 'UI Text'),
('branding.font', '{"family":"system-ui, -apple-system, sans-serif","size":"16px","weight":{"normal":"400","medium":"500","bold":"700"}}', false, 'Branding/Appearance', 'Typography'),
('branding.logo', '{"data":null,"mimeType":null}', false, 'Branding/Identity', 'Logo Image'),
('branding.favicon', '{"data":null,"mimeType":null}', false, 'Branding/Identity', 'Favicon'),
('branding.custom_css', '""', false, 'Branding/Advanced', 'Custom CSS')
ON CONFLICT (key) DO NOTHING;
```

### B. Installation Flow

During the installation process, add a "Branding" step:
1. Basic branding (title, tagline, colors)
2. Logo upload (optional)
3. Advanced customization (optional)
4. Preview before saving

---

## 7. Security Considerations

### A. Content Security Policy

```typescript
// Update CSP headers when custom CSS is enabled
if (hasCustomCSS) {
  response.setHeader('Content-Security-Policy', 
    "default-src 'self'; " +
    "style-src 'self' 'unsafe-inline'; " +  // Allow inline styles for custom CSS
    "img-src 'self' data:; " +               // Allow data URIs for images
    "script-src 'self';"
  );
}
```

### B. Input Validation

- **Images**: Max 2MB, validate format, sanitize SVGs
- **CSS**: Remove dangerous properties, validate syntax
- **Text**: HTML escape all user-provided text
- **Colors**: Validate hex/rgb/rgba format

### C. Rate Limiting

- Limit branding updates to 10 per minute
- Cache branding assets for 24 hours
- Use ETag for efficient caching

---

## 8. Performance Optimization

### A. Caching Strategy

```typescript
// Branding cache with 5-minute TTL
const brandingCache = new Map<string, { data: any; expires: number }>();

async function getBrandingConfig(context: Context): Promise<BrandingConfig> {
  const cached = brandingCache.get('config');
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }
  
  const config = await loadBrandingFromDB(context);
  brandingCache.set('config', {
    data: config,
    expires: Date.now() + 5 * 60 * 1000 // 5 minutes
  });
  
  return config;
}
```

### B. Asset Optimization

- Automatically optimize uploaded images
- Minify custom CSS before serving
- Use gzip compression for config.js
- Implement lazy loading for logo in UI

---

## 9. Testing Requirements

### A. Unit Tests
- Branding configuration validation
- CSS sanitization
- Image processing
- Color format validation

### B. Integration Tests
- Branding application in user-ui
- Asset serving endpoints
- Settings persistence
- Cache invalidation

### C. E2E Tests
- Complete branding customization flow
- Live preview functionality
- Cross-browser compatibility
- Mobile responsiveness

### D. Security Tests
- XSS prevention in custom CSS
- SVG sanitization
- File upload validation
- CSP header verification

---

## 10. Implementation Checklist

### Phase 1: Foundation (Week 1)
- [ ] Add branding settings to database migration
- [ ] Update settings API to handle branding
- [ ] Add semantic class names to all user-ui components
- [ ] Create CSS variable system

### Phase 2: Admin UI (Week 2)
- [ ] Create ImageUploadField component
- [ ] Create ColorSchemeEditor component
- [ ] Create CSSEditor component
- [ ] Integrate with Settings page
- [ ] Add live preview feature

### Phase 3: API Layer (Week 3)
- [ ] Update config.js generation
- [ ] Add asset serving endpoints
- [ ] Implement caching strategy
- [ ] Add validation and sanitization

### Phase 4: User UI (Week 4)
- [ ] Create useBranding hook
- [ ] Update all components with branding support
- [ ] Implement dynamic CSS injection
- [ ] Test cross-browser compatibility

### Phase 5: Polish & Testing (Week 5)
- [ ] Write comprehensive tests
- [ ] Performance optimization
- [ ] Documentation
- [ ] Security audit
- [ ] User acceptance testing

---

## 11. Future Enhancements

### Version 2.0
- Multiple theme presets
- Dark mode support
- Theme marketplace
- Per-client branding (multi-tenant)
- A/B testing support

### Version 3.0
- Component-level customization
- Animation settings
- Layout variations
- Email template branding
- Export/import branding configs

---

## Appendix A: Default Branding JSON

```json
{
  "identity": {
    "title": "DarkAuth",
    "tagline": "Secure Zero-Knowledge Authentication"
  },
  "logo": {
    "data": null,
    "mimeType": null
  },
  "favicon": {
    "data": null,
    "mimeType": null
  },
  "colors": {
    "backgroundGradientStart": "#f3f4f6",
    "backgroundGradientEnd": "#eff6ff",
    "backgroundAngle": "135deg",
    "primary": "#3b82f6",
    "primaryHover": "#2563eb",
    "primaryLight": "#dbeafe",
    "primaryDark": "#1d4ed8",
    "secondary": "#6b7280",
    "secondaryHover": "#4b5563",
    "success": "#10b981",
    "error": "#ef4444",
    "warning": "#f59e0b",
    "info": "#3b82f6",
    "text": "#111827",
    "textSecondary": "#6b7280",
    "textMuted": "#9ca3af",
    "border": "#e5e7eb",
    "cardBackground": "#ffffff",
    "cardShadow": "rgba(0, 0, 0, 0.1)",
    "inputBackground": "#ffffff",
    "inputBorder": "#d1d5db",
    "inputFocus": "#3b82f6"
  },
  "wording": {
    "welcomeBack": "Welcome back",
    "createAccount": "Create your account",
    "email": "Email",
    "emailPlaceholder": "Enter your email",
    "password": "Password",
    "passwordPlaceholder": "Enter your password",
    "confirmPassword": "Confirm Password",
    "confirmPasswordPlaceholder": "Confirm your password",
    "signin": "Continue",
    "signingIn": "Signing in...",
    "signup": "Sign up",
    "signingUp": "Creating account...",
    "signout": "Sign Out",
    "changePassword": "Change Password",
    "cancel": "Cancel",
    "authorize": "Authorize",
    "deny": "Deny",
    "noAccount": "Don't have an account?",
    "hasAccount": "Already have an account?",
    "forgotPassword": "Forgot your password?",
    "signedInAs": "Signed in as",
    "successAuth": "Successfully authenticated",
    "errorGeneral": "An error occurred. Please try again.",
    "errorNetwork": "Network error. Please check your connection.",
    "errorInvalidCreds": "Invalid email or password.",
    "authorizeTitle": "Authorize Application",
    "authorizeDescription": "{app} would like to:",
    "scopeProfile": "Access your profile information",
    "scopeEmail": "Access your email address",
    "scopeOpenid": "Authenticate you"
  },
  "font": {
    "family": "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    "size": "16px",
    "weight": {
      "normal": "400",
      "medium": "500",
      "bold": "700"
    }
  },
  "customCSS": ""
}
```

---

## Appendix B: Example Custom CSS

```css
/* Example: Corporate Blue Theme */
.da-app {
  font-family: 'Inter', sans-serif;
}

.da-container {
  max-width: 480px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
}

.da-brand-title {
  font-weight: 800;
  letter-spacing: -0.02em;
}

.da-button-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 14px;
  padding: 1rem 2rem;
}

.da-button-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5);
}

.da-form-input {
  border: 2px solid transparent;
  background: #f7f8fc;
}

.da-form-input:focus {
  background: white;
  border-color: #667eea;
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .da-container {
    background: #1a1a2e;
    color: #eee;
  }
  
  .da-form-input {
    background: #0f0f23;
    color: white;
    border-color: #333;
  }
}
```

---

This specification provides a complete blueprint for implementing custom branding in DarkAuth, ensuring flexibility for administrators while maintaining security and performance standards.