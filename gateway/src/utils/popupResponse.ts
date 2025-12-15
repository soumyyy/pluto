import { config } from '../config';

interface PopupResponseOptions {
  success: boolean;
  message: string;
  error?: string;
  redirectUrl?: string;
  delay?: number;
}

export function generatePopupResponse({
  success,
  message,
  error,
  redirectUrl = config.frontendOrigin,
  delay = success ? 1000 : 2000
}: PopupResponseOptions): string {
  const icon = success ? '✅' : '❌';
  const title = success ? 'Authentication Successful' : 'Authentication Failed';
  const messageType = success ? 'OAUTH_SUCCESS' : 'OAUTH_ERROR';
  const fallbackUrl = success ? `${config.frontendOrigin}/` : `${config.frontendOrigin}/login`;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title}</title>
      <style>
        body { 
          font-family: -apple-system, system-ui, sans-serif; 
          display: flex; 
          justify-content: center; 
          align-items: center; 
          height: 100vh; 
          margin: 0; 
          background: #f5f5f5; 
        }
        .message { 
          text-align: center; 
          padding: 2rem; 
          background: white; 
          border-radius: 8px; 
          box-shadow: 0 2px 8px rgba(0,0,0,0.1); 
        }
      </style>
    </head>
    <body>
      <div class="message">
        <h2>${icon} ${title}</h2>
        <p>${message}</p>
      </div>
      <script>
        // Check if we're in a popup window
        if (window.opener && window.opener !== window) {
          // Signal the parent window (always post to frontend origin)
          try {
            window.opener.postMessage({ 
              type: '${messageType}', 
              success: ${success}${error ? `, error: '${error}'` : ''} 
            }, '${config.frontendOrigin}');
          } catch (e) {
            console.error('Failed to signal parent:', e);
          }
          
          // Close popup after delay
          setTimeout(() => {
            window.close();
          }, ${delay});
        } else {
          // Not in popup - redirect
          setTimeout(() => {
            window.location.href = '${redirectUrl || fallbackUrl}';
          }, ${delay});
        }
      </script>
    </body>
    </html>
  `;
}