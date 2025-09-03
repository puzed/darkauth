async function purgeCache(domain) {
  const response = await fetch(
    `https://europe-west2-personal-projects-341716.cloudfunctions.net/purge-bunny?domain=${domain}`,
    {
      method: 'POST',
      headers: {
        authentication: process.env.PURGE_BUNNY_SECRET,
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

