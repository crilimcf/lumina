export default function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');

  const decode = (value) => {
    if (!value) return '';
    try { return decodeURIComponent(String(value)); }
    catch { return String(value); }
  };

  const city = decode(request.headers['x-vercel-ip-city']).trim().slice(0, 80);
  const region = decode(request.headers['x-vercel-ip-country-region']).trim().slice(0, 80);
  const country = decode(request.headers['x-vercel-ip-country']).trim().slice(0, 8);

  if (!city) {
    response.status(204).end();
    return;
  }

  response.status(200).json({
    city,
    region,
    country,
    accuracy: 'approximate',
    source: 'vercel-ip',
  });
}
