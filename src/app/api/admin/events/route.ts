import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const ADMIN_PIN = process.env.ADMIN_PIN || '4321';

function verifyAdminAccess(request: Request) {
  const pin = request.headers.get('x-admin-pin');
  return pin === ADMIN_PIN;
}

// GET: Fetch all events
export async function GET(request: Request) {
  try {
    if (!verifyAdminAccess(request)) {
      return NextResponse.json({ error: 'Nicht autorisiert. Ungültige Admin-PIN.' }, { status: 401 });
    }

    const events = await prisma.event.findMany({
      include: {
        layout: {
          select: { name: true }
        },
        tickets: {
          where: {
            order: {
              status: 'PAID'
            }
          },
          include: {
            seat: {
              select: {
                category: true,
                price: true
              }
            }
          }
        }
      },
      orderBy: { date: 'asc' },
    });

    return NextResponse.json({ events });
  } catch (error: any) {
    console.error('Error fetching events:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST: Create or update an event
export async function POST(request: Request) {
  try {
    if (!verifyAdminAccess(request)) {
      return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
    }

    const { id, title, date, description, layoutId } = await request.json();

    if (!title || !date || !layoutId) {
      return NextResponse.json({ error: 'Ungültige Parameter. Titel, Datum und Saalplan sind erforderlich.' }, { status: 400 });
    }

    // Verify layout exists
    const layout = await prisma.seatmapLayout.findUnique({
      where: { id: layoutId }
    });
    if (!layout) {
      return NextResponse.json({ error: 'Der ausgewählte Saalplan existiert nicht.' }, { status: 400 });
    }

    if (id) {
      // Update
      const event = await prisma.event.update({
        where: { id },
        data: {
          title,
          date: new Date(date),
          description,
          layoutId,
        },
      });
      return NextResponse.json({ success: true, event });
    } else {
      // Create
      const event = await prisma.event.create({
        data: {
          title,
          date: new Date(date),
          description,
          layoutId,
        },
      });
      return NextResponse.json({ success: true, event });
    }
  } catch (error: any) {
    console.error('Error saving event:', error);
    return NextResponse.json({ error: 'Fehler beim Speichern der Veranstaltung: ' + error.message }, { status: 500 });
  }
}

// DELETE: Delete an event
export async function DELETE(request: Request) {
  try {
    if (!verifyAdminAccess(request)) {
      return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID ist erforderlich.' }, { status: 400 });
    }

    // Check if tickets are sold for this event
    const ticketCount = await prisma.ticket.count({
      where: { eventId: id }
    });

    if (ticketCount > 0) {
      return NextResponse.json({
        error: 'Die Veranstaltung kann nicht gelöscht werden, da bereits Tickets verkauft wurden.'
      }, { status: 400 });
    }

    // Delete associated locks and the event itself
    await prisma.$transaction(async (tx) => {
      await tx.seatLock.deleteMany({ where: { eventId: id } });
      await tx.event.delete({ where: { id } });
    });

    return NextResponse.json({ success: true, message: 'Veranstaltung erfolgreich gelöscht.' });
  } catch (error: any) {
    console.error('Error deleting event:', error);
    return NextResponse.json({ error: 'Fehler beim Löschen der Veranstaltung: ' + error.message }, { status: 500 });
  }
}
