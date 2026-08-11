# Test Coverage Gaps

Only verified missing coverage is tracked here.

## RP-initiated logout browser flow

- [ ] Add a Playwright scenario that signs in through an RP, calls RP-initiated logout, and proves the DarkAuth browser SSO session ended by requiring authentication on the next authorization request.
- [ ] Cover the browser redirects and RP-visible state, not only the existing API controller and SDK unit tests.

## Semantic branding visual coverage

- [ ] Add visual assertions for hosted authentication and authorization surfaces using non-default semantic branding values.
- [ ] Exercise light and dark color schemes at responsive phone, tablet, and desktop widths.
- [ ] Retain behavioral branding tests and responsive portal tests; the gap is combined semantic-theme visual regression coverage, not basic persistence or overflow coverage.

## Verification

- [ ] Run the focused Playwright scenarios locally.
- [ ] Run `pnpm tidy` and `pnpm build`.
