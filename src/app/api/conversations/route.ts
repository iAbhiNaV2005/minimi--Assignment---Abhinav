import { NextRequest, NextResponse } from 'next/server';
import { getAllConversations } from '@/db';
import { seedDatabase } from '@/db/seed';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const list = await getAllConversations();
    return NextResponse.json({ conversations: list });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    if (body.action === 'reseed') {
      await seedDatabase(true);
      const list = await getAllConversations();
      return NextResponse.json({ success: true, message: 'Database reseeded successfully', conversations: list });
    }
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
