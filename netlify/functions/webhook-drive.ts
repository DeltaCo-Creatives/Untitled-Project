import { Handler } from '@netlify/functions';
import { google } from 'googleapis';

export const handler: Handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const resourceState = event.headers['x-goog-resource-state'];

  if (resourceState === 'sync') {
    return { statusCode: 200, body: JSON.stringify({ message: 'Channel synced.' }) };
  }

  if (resourceState !== 'add' && resourceState !== 'update') {
    return { statusCode: 200, body: JSON.stringify({ message: 'Ignored state.' }) };
  }

  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  const rawFolderId = process.env.GOOGLE_DRIVE_RAW_FOLDER_ID;
  const sortedFolderId = process.env.GOOGLE_DRIVE_SORTED_FOLDER_ID;

  if (!CLIENT_ID || !CLIENT_SECRET || !refreshToken || !rawFolderId || !sortedFolderId) {
    console.error('Missing necessary environment variables for webhook.');
    return { statusCode: 500, body: 'Configuration missing' };
  }

  try {
    const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Find the newest file in the Raw folder
    const res = await drive.files.list({
      q: `'${rawFolderId}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType, parents)',
      pageSize: 1,
      orderBy: 'createdTime desc',
    });

    const files = res.data.files;
    if (!files || files.length === 0) {
      return { statusCode: 200, body: JSON.stringify({ message: 'No files to process.' }) };
    }

    const file = files[0];
    console.log(`Processing file: ${file.name} (${file.id})`);

    // Dummy Processor: Rename and move
    const newName = `Processed_${Date.now()}_${file.name}`;
    const previousParents = file.parents?.join(',') || rawFolderId;

    await drive.files.update({
      fileId: file.id as string,
      addParents: sortedFolderId,
      removeParents: previousParents,
      requestBody: { name: newName },
      fields: 'id, parents',
    });

    console.log(`✅ Successfully renamed to ${newName} and moved to Sorted folder!`);
    return { statusCode: 200, body: JSON.stringify({ success: true, processed_file: newName }) };

  } catch (error: any) {
    console.error('Error processing webhook:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Webhook processing failed', details: error.message }) };
  }
};
