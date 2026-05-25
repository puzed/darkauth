#!/usr/bin/env node

async function purgeCache(domain) {
  if (!domain) {
    console.error('Missing required domain argument');
    process.exit(1);
  }

  if (!process.env.DOCS_PURGE_BUNNY_SECRET) {
    console.error('Missing required environment variable:');
    console.error('- DOCS_PURGE_BUNNY_SECRET');
    process.exit(1);
  }

  const response = await fetch(
    `https://europe-west2-personal-projects-341716.cloudfunctions.net/purge-bunny?domain=${domain}`,
    {
      method: 'POST',
      headers: {
        authentication: process.env.DOCS_PURGE_BUNNY_SECRET,
      },
    }
  );

  const json = await response.json();

  if (json.responseOk) {
    console.log('Successfully purged cache of ' + domain);
  } else {
    throw Object.assign(new Error('Could not purge cache of ' + domain), json);
  }
}

purgeCache(process.argv[2]);
