// Mounted only on Connection's owner-only authenticated exact-route channel (DSH rc.5+).
export async function protectionResponse(core, agents, request) {
  const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  if (request.method !== 'GET') return json(405, { error: 'method-not-allowed' });
  const url = new URL(request.url), to = url.searchParams.get('session'), from = url.searchParams.get('from');
  if (!to || !from || to.length > 256 || from.length > 256) return json(400, { error: 'bad-request' });
  if (!core.has(to) || !agents.get(to)) return json(404, { error: 'not-live' });
  const state = (await core.protectionStatus(to)).find(s => s.from === from);
  return json(200, { paused: state?.paused === true, count: state?.count || 0 });
}
