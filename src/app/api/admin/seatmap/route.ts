import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const ADMIN_PIN = process.env.ADMIN_PIN || '4321';

function verifyAdminAccess(request: Request) {
  const pin = request.headers.get('x-admin-pin');
  return pin === ADMIN_PIN;
}

// POST: Overwrite the seatmap layout
export async function POST(request: Request) {
  try {
    if (!verifyAdminAccess(request)) {
      return NextResponse.json({ error: 'Nicht autorisiert. Ungültige Admin-PIN.' }, { status: 401 });
    }

    const { seats } = await request.json();

    if (!Array.isArray(seats)) {
      return NextResponse.json({ error: 'Ungültige Parameter. "seats" muss ein Array sein.' }, { status: 400 });
    }

    // 1. Check if tickets are already sold.
    // If tickets exist, changing the seatmap will violate foreign keys and corrupt ticket links.
    const ticketCount = await prisma.ticket.count();
    if (ticketCount > 0) {
      return NextResponse.json({
        error: 'Der Saalplan kann nicht mehr geändert werden, da bereits Tickets verkauft wurden.'
      }, { status: 400 });
    }

    // 2. Perform updates in a transaction
    await prisma.$transaction(async (tx) => {
      // Clear current seat locks
      await tx.seatLock.deleteMany({});
      
      // Clear current seats
      await tx.seat.deleteMany({});
      
      // Bulk insert new seats
      await tx.seat.createMany({
        data: seats.map((s: any) => ({
          id: s.id,
          row: s.row,
          number: s.number,
          category: s.category,
          price: parseFloat(s.price),
          x: parseFloat(s.x),
          y: parseFloat(s.y),
        }))
      });
    });

    return NextResponse.json({ success: true, message: `${seats.length} Sitzplätze erfolgreich gespeichert.` });
  } catch (error: any) {
    console.error('Error saving seatmap:', error);
    return NextResponse.json({ error: 'Fehler beim Speichern des Saalplans: ' + error.message }, { status: 500 });
  }
}
