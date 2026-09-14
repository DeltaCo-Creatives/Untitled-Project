import { Handler } from '@netlify/functions';
import { google } from 'googleapis';

export const handler: Handler = async (event, context) => {
  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  // Netlify automatically provides URL, or fallback to localhost
  const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:8888/.netlify/functions/auth-callback';

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Google OAuth credentials not configured.' }),
    };
  }

  const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

  const SCOPES = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/drive.metadata.readonly',
  ];

  const authorizationUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state: 'auth_init',
  });

  return {
    statusCode: 302,
    headers: {
      Location: authorizationUrl,
    },
  };
};
