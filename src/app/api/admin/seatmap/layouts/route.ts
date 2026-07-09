import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const ADMIN_PIN = process.env.ADMIN_PIN || '4321';

function verifyAdminAccess(request: Request) {
  const pin = request.headers.get('x-admin-pin');
  return pin === ADMIN_PIN;
}

// GET: Fetch all layouts
export async function GET(request: Request) {
  try {
    if (!verifyAdminAccess(request)) {
      return NextResponse.json({ error: 'Nicht autorisiert. Ungültige Admin-PIN.' }, { status: 401 });
    }

    const layouts = await prisma.seatmapLayout.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ layouts });
  } catch (error: any) {
    console.error('Error fetching layouts:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST: Save or Update a layout (and generate its seats)
export async function POST(request: Request) {
  try {
    if (!verifyAdminAccess(request)) {
      return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
    }

    const { id, name, blocks, seats } = await request.json();

    if (!name || !blocks || !Array.isArray(seats)) {
      return NextResponse.json({ error: 'Ungültige Parameter. Name, Blöcke und Sitze sind erforderlich.' }, { status: 400 });
    }

    // Convert blocks to string for storage
    const blocksStr = typeof blocks === 'string' ? blocks : JSON.stringify(blocks);

    const result = await prisma.$transaction(async (tx) => {
      let layoutId = id;

      if (id) {
        // 1. Check if tickets are already sold for events using this layout
        const ticketCount = await tx.ticket.count({
          where: {
            event: {
              layoutId: id,
            },
          },
        });

        if (ticketCount > 0) {
          throw new Error('Der Saalplan kann nicht geändert werden, da bereits Tickets für verknüpfte Veranstaltungen verkauft wurden.');
        }

        // 2. Update Layout record
        await tx.seatmapLayout.update({
          where: { id },
          data: {
            name,
            blocks: blocksStr,
          },
        });

        // 3. Clear old seats
        await tx.seat.deleteMany({
          where: { layoutId: id },
        });
      } else {
        // Create new layout
        const newLayout = await tx.seatmapLayout.create({
          data: {
            name,
            blocks: blocksStr,
          },
        });
        layoutId = newLayout.id;
      }

      // 4. Bulk insert new seats with the proper layoutId prefix
      const seatsData = seats.map((seat: any) => ({
        // Ensure seat ID is prefixed with layout ID
        id: seat.id.startsWith(layoutId + '-') ? seat.id : `${layoutId}-${seat.id}`,
        layoutId: layoutId,
        row: parseInt(seat.row),
        number: parseInt(seat.number),
        category: seat.category,
        price: parseFloat(seat.price),
        x: parseFloat(seat.x),
        y: parseFloat(seat.y),
      }));

      await tx.seat.createMany({
        data: seatsData,
      });

      return { layoutId, count: seatsData.length };
    });

    return NextResponse.json({
      success: true,
      layoutId: result.layoutId,
      message: `Saalplan "${name}" erfolgreich gespeichert (${result.count} Sitzplätze).`,
    });
  } catch (error: any) {
    console.error('Error saving layout:', error);
    return NextResponse.json({ error: error.message || 'Fehler beim Speichern des Saalplans.' }, { status: 400 });
  }
}

// DELETE: Delete a layout template
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

    if (id === 'default-layout') {
      return NextResponse.json({ error: 'Das Standard-Layout kann nicht gelöscht werden.' }, { status: 400 });
    }

    // Check if layout is used by any events
    const eventCount = await prisma.event.count({
      where: { layoutId: id },
    });

    if (eventCount > 0) {
      return NextResponse.json({
        error: 'Der Saalplan kann nicht gelöscht werden, da er noch von Veranstaltungen verwendet wird.'
      }, { status: 400 });
    }

    // Delete layout (associated seats will be deleted cascade)
    await prisma.seatmapLayout.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: 'Saalplan erfolgreich gelöscht.' });
  } catch (error: any) {
    console.error('Error deleting layout:', error);
    return NextResponse.json({ error: 'Fehler beim Löschen des Saalplans: ' + error.message }, { status: 500 });
  }
}
