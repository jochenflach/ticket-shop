import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const sessionId = request.headers.get('x-session-id');
    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
    }

    const { action, seatIds } = await request.json();
    if (!action || !seatIds || !Array.isArray(seatIds) || seatIds.length === 0) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    if (action === 'lock') {
      // 1. Transaction to safely lock seats
      const result = await prisma.$transaction(async (tx) => {
        // A. Check if any seat is already booked (Paid order)
        const booked = await tx.ticket.findFirst({
          where: {
            seatId: { in: seatIds },
            order: {
              status: 'PAID',
            },
          },
        });
        if (booked) {
          throw new Error(`Sitzplatz ${booked.seatId} ist bereits fest gebucht.`);
        }

        // B. Check if any seat is already locked by someone else (not expired)
        const twelveMinutesAgo = new Date(Date.now() - 12 * 60 * 1000);
        const activeLocks = await tx.seatLock.findMany({
          where: {
            seatId: { in: seatIds },
            lockedAt: { gt: twelveMinutesAgo },
          },
        });

        const lockedByOthers = activeLocks.filter((l) => l.lockedBy !== sessionId);
        if (lockedByOthers.length > 0) {
          throw new Error(`Sitzplatz ${lockedByOthers[0].seatId} ist von einem anderen Käufer reserviert.`);
        }

        // C. Clean up any expired locks or existing locks of this session for these seats
        await tx.seatLock.deleteMany({
          where: {
            seatId: { in: seatIds },
          },
        });

        // D. Create new locks for these seats
        const locksData = seatIds.map((seatId) => ({
          seatId,
          lockedBy: sessionId,
          lockedAt: new Date(),
        }));

        // SQLite doesn't support createMany with relations or auto-generated keys in some versions,
        // so we can loop and create them. It's safe since it's inside the transaction.
        for (const lock of locksData) {
          await tx.seatLock.create({
            data: lock,
          });
        }

        return { success: true };
      });

      return NextResponse.json(result);
    } else if (action === 'unlock') {
      // Release locks for this session and these seats
      await prisma.seatLock.deleteMany({
        where: {
          seatId: { in: seatIds },
          lockedBy: sessionId,
        },
      });

      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('Error locking/unlocking seats:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 400 });
  }
}
