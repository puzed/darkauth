#!/usr/bin/env node

import uploadToBunny from 'upload-to-bunny';

const accessKey = process.env.BROCHUREWARE_DEPLOY_ACCESS_KEY;
const storageZoneName = process.env.BROCHUREWARE_DEPLOY_STORAGE_ZONE;
const source = './dist';
const destination = '/';

if (!accessKey || !storageZoneName) {
  console.error('Missing required environment variables:');
  console.error('- BROCHUREWARE_DEPLOY_ACCESS_KEY');
  console.error('- BROCHUREWARE_DEPLOY_STORAGE_ZONE');
  process.exit(1);
}

console.log('Uploading brochureware to Bunny CDN...');
console.log(`Storage Zone: ${storageZoneName}`);
console.log(`Source: ${source}`);

try {
  await uploadToBunny(source, destination, {
    storageZoneName,
    accessKey,
    cleanDestination: true,
    maxConcurrentUploads: 10,
  });
  console.log('Deployment successful');
} catch (error) {
  console.error('Deployment failed:', error);
  process.exit(1);
}

