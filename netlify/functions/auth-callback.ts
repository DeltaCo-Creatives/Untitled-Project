import { Handler } from '@netlify/functions';
import { google } from 'googleapis';

export const handler: Handler = async (event, context) => {
  const code = event.queryStringParameters?.code;
  const error = event.queryStringParameters?.error;

  if (error) {
    return {
      statusCode: 302,
      headers: { Location: `/?error=${error}` },
    };
  }

  if (!code) {
    return { statusCode: 400, body: JSON.stringify({ error: 'No authorization code provided.' }) };
  }

  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:8888/.netlify/functions/auth-callback';

  const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

  try {
    const { tokens } = await oauth2Client.getToken(code);
    
    console.log('✅ Successfully acquired tokens!');
    console.log('Refresh Token:', tokens.refresh_token ? 'Exists' : 'Missing');

    // For the MVP, we just display it so the user can copy it to .env.local
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        success: true, 
        message: 'OAuth Successful! Please save this refresh token to your .env file as GOOGLE_REFRESH_TOKEN to test the webhook.',
        refresh_token: tokens.refresh_token 
      }),
    };
  } catch (err: any) {
    console.error('Error exchanging token:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to exchange token.', details: err.message }),
    };
  }
};
