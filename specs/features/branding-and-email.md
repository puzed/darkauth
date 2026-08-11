# Branding and email

## Branding

Branding is stored in settings and managed from the admin UI at `/branding`.

- Identity: product title and tagline.
- Assets: separate light and dark logos and favicons. Uploads accept PNG, JPEG, and ICO data up to 2 MiB; SVG uploads are rejected.
- Colors: light and dark semantic palettes normalized by `@DarkAuth/branding`.
- Typography: font family, base size, and normal, medium, and bold weights.
- Wording: authentication, registration, authorization, navigation, and error labels.
- Custom CSS: stored CSS is filtered before it is served. The filter removes known dangerous constructs but is not a general-purpose CSS isolation boundary.

The user server exposes the resolved branding through generated UI configuration and asset/CSS routes. The admin branding editor uses the same user UI components for its preview so preview and hosted surfaces share rendering behavior.

## Email transport

Email delivery is optional. The install UI collects SMTP values and can prefill them from `EMAIL_TRANSPORT`, `EMAIL_FROM`, `EMAIL_SMTP_HOST`, `EMAIL_SMTP_PORT`, `EMAIL_SMTP_USER`, and `EMAIL_SMTP_PASSWORD`. Sending fails with `EMAIL_TRANSPORT_DISABLED` when transport is disabled.

## Templates

Templates are stored under `email.templates.*` settings and edited from the admin UI. Each template has a subject, plain-text body, and HTML body. Supported templates are:

- signup verification;
- existing-account signup notice;
- verification resend confirmation;
- email-change verification;
- password recovery;
- admin SMTP test.

Rendering replaces `{{variable}}` placeholders with values supplied by the calling workflow. Missing variables render as an empty string. Defaults are installed when a template has no stored object.
