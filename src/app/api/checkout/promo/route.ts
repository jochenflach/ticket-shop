import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { code, seatIds } = await request.json();

    if (!code || !seatIds || !Array.isArray(seatIds) || seatIds.length === 0) {
      return NextResponse.json({ error: 'Rabattcode und ausgewählte Sitzplätze sind erforderlich.' }, { status: 400 });
    }

    const formattedCode = code.toUpperCase().trim();

    // 1. Fetch promo code
    const promo = await prisma.promoCode.findUnique({
      where: { code: formattedCode },
    });

    if (!promo || !promo.isActive) {
      return NextResponse.json({ error: 'Dieser Rabattcode ist ungültig oder abgelaufen.' }, { status: 400 });
    }

    // 2. Check usage limits
    if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) {
      return NextResponse.json({ error: 'Dieser Rabattcode wurde bereits maximal oft eingelöst.' }, { status: 400 });
    }

    // 3. Fetch seats to calculate total
    const seats = await prisma.seat.findMany({
      where: {
        id: { in: seatIds },
      },
    });

    if (seats.length !== seatIds.length) {
      return NextResponse.json({ error: 'Einige Sitzplätze sind ungültig.' }, { status: 400 });
    }

    const originalTotal = seats.reduce((sum, s) => sum + s.price, 0);

    // 4. Calculate discount
    let discountAmount = 0;
    if (promo.type === 'PERCENT') {
      discountAmount = (originalTotal * promo.value) / 100;
    } else if (promo.type === 'FIXED') {
      discountAmount = Math.min(originalTotal, promo.value);
    }

    // Round to 2 decimal places
    discountAmount = Math.round(discountAmount * 100) / 100;
    const newTotal = Math.max(0, originalTotal - discountAmount);

    return NextResponse.json({
      valid: true,
      promoCodeId: promo.id,
      code: promo.code,
      type: promo.type,
      value: promo.value,
      discountAmount,
      newTotal,
    });
  } catch (error: any) {
    console.error('Error validating promo code:', error);
    return NextResponse.json({ error: 'Fehler bei der Validierung des Rabattcodes.' }, { status: 500 });
  }
}
