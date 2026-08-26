export async function GET() {
  return Response.json({ ok: true, service: "driveline-web" }, { status: 200 });
}

