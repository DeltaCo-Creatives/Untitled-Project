const { google } = require('googleapis');
require('dotenv').config({ path: '.env.local' });

async function setupWatchChannel() {
  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
  const FOLDER_ID = process.env.GOOGLE_DRIVE_RAW_FOLDER_ID;
  const WEBHOOK_URL = process.env.WEBHOOK_URL; // e.g., https://your-netlify-app.netlify.app/api/webhook/drive

  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN || !FOLDER_ID || !WEBHOOK_URL) {
    console.error('Missing required environment variables in .env.local');
    return;
  }

  const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
  oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  // A unique ID for this channel
  const channelId = `drivetag-webhook-${Date.now()}`;

  try {
    const res = await drive.files.watch({
      fileId: FOLDER_ID,
      requestBody: {
        id: channelId,
        type: 'web_hook',
        address: WEBHOOK_URL,
      },
    });

    console.log('✅ Successfully set up push notification channel!');
    console.log('Channel ID:', res.data.id);
    console.log('Resource ID:', res.data.resourceId);
    console.log('Expiration:', new Date(parseInt(res.data.expiration)).toLocaleString());
    
    console.log('\nKeep a note of these details if you need to stop the channel later.');
  } catch (error) {
    console.error('❌ Failed to set up watch channel:', error.message);
    if (error.response?.data) {
      console.error(error.response.data);
    }
  }
}

setupWatchChannel();
