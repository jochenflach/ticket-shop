import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const ADMIN_PIN = process.env.ADMIN_PIN || '4321';

function verifyAdminAccess(request: Request) {
  const pin = request.headers.get('x-admin-pin');
  return pin === ADMIN_PIN;
}

export async function POST(request: Request) {
  try {
    if (!verifyAdminAccess(request)) {
      return NextResponse.json({ error: 'Nicht autorisiert. Ungültige Admin-PIN.' }, { status: 401 });
    }

    const { eventId } = await request.json();

    if (!eventId) {
      return NextResponse.json({ error: 'Event ID ist erforderlich.' }, { status: 400 });
    }

    // 1. Find all order IDs for tickets of this event
    const tickets = await prisma.ticket.findMany({
      where: { eventId },
      select: { orderId: true }
    });

    const orderIds = Array.from(new Set(tickets.map(t => t.orderId)));

    // 2. Delete all orders (this cascades and deletes tickets)
    if (orderIds.length > 0) {
      await prisma.order.deleteMany({
        where: {
          id: { in: orderIds }
        }
      });
    }

    // 3. Delete all locks for this event
    await prisma.seatLock.deleteMany({
      where: { eventId }
    });

    return NextResponse.json({ success: true, message: 'Veranstaltung erfolgreich zurückgesetzt.' });
  } catch (error: any) {
    console.error('Error resetting event:', error);
    return NextResponse.json({ error: 'Fehler beim Zurücksetzen der Veranstaltung: ' + error.message }, { status: 500 });
  }
}
