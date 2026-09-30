export default { async fetch(request) {
  const requestUrl = new URL(request.url);
  if (request.method !== 'GET') {
    return Response.json({ error: 'Método no permitido.' }, { status: 405, headers: { Allow: 'GET' } });
  }

  let videoUrl;
  try {
    videoUrl = new URL(requestUrl.searchParams.get('url') || '');
  } catch {
    return Response.json({ error: 'Enlace inválido.' }, { status: 400 });
  }

  const host = videoUrl.hostname.toLowerCase();
  if (videoUrl.protocol !== 'https:' || !(host === 'tiktok.com' || host.endsWith('.tiktok.com')) || !/\/video\/\d+/.test(videoUrl.pathname)) {
    return Response.json({ error: 'Se requiere un enlace público de un video de TikTok.' }, { status: 400 });
  }

  try {
    const endpoint = new URL('https://www.tiktok.com/oembed');
    endpoint.searchParams.set('url', videoUrl.toString());
    const upstream = await fetch(endpoint, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!upstream.ok) return Response.json({ error: 'TikTok no devolvió la miniatura.' }, { status: 502 });

    const metadata = await upstream.json();
    const thumbnail = new URL(metadata.thumbnail_url || '');
    const imageHost = thumbnail.hostname.toLowerCase();
    const allowedImageHost = ['tiktokcdn.com', 'muscdn.com', 'tiktokcdn-us.com'].some(domain => imageHost === domain || imageHost.endsWith('.' + domain));
    if (thumbnail.protocol !== 'https:' || !allowedImageHost) {
      return Response.json({ error: 'TikTok no devolvió una miniatura válida.' }, { status: 502 });
    }

    return Response.json(
      { thumbnail_url: thumbnail.toString(), title: metadata.title || '' },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } },
    );
  } catch {
    return Response.json({ error: 'No se pudo obtener la miniatura de TikTok.' }, { status: 502 });
  }
} };
