import { gatewayFetch } from './gatewayFetch';

export async function post(path: string, body: unknown) {
  const response = await gatewayFetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gateway error: ${response.status} ${errorText}`);
  }

  return response.json();
}
