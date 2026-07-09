import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const ADMIN_PIN = process.env.ADMIN_PIN || '4321';

// Helper to check admin access
function verifyAdminAccess(request: Request) {
  const pin = request.headers.get('x-admin-pin');
  return pin === ADMIN_PIN;
}

// GET: Fetch all promo codes
export async function GET(request: Request) {
  try {
    if (!verifyAdminAccess(request)) {
      return NextResponse.json({ error: 'Nicht autorisiert. Ungültige Admin-PIN.' }, { status: 401 });
    }

    const promoCodes = await prisma.promoCode.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ promoCodes });
  } catch (error: any) {
    console.error('Error fetching promo codes:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST: Create a new promo code
export async function POST(request: Request) {
  try {
    if (!verifyAdminAccess(request)) {
      return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
    }

    const { code, type, value, maxUses, isActive } = await request.json();

    if (!code || !type || typeof value !== 'number' || value <= 0) {
      return NextResponse.json({ error: 'Ungültige Parameter. Code, Typ und Wert sind erforderlich.' }, { status: 400 });
    }

    if (type !== 'PERCENT' && type !== 'FIXED') {
      return NextResponse.json({ error: 'Typ muss PERCENT oder FIXED sein.' }, { status: 400 });
    }

    if (type === 'PERCENT' && value > 100) {
      return NextResponse.json({ error: 'Prozentualer Rabatt darf maximal 100% betragen.' }, { status: 400 });
    }

    const formattedCode = code.toUpperCase().trim();

    // Check if code already exists
    const existing = await prisma.promoCode.findUnique({
      where: { code: formattedCode },
    });

    if (existing) {
      return NextResponse.json({ error: 'Dieser Rabattcode existiert bereits.' }, { status: 400 });
    }

    const newPromo = await prisma.promoCode.create({
      data: {
        code: formattedCode,
        type,
        value,
        maxUses: maxUses ? parseInt(maxUses) : null,
        isActive: isActive !== undefined ? isActive : true,
      },
    });

    return NextResponse.json({ success: true, promoCode: newPromo });
  } catch (error: any) {
    console.error('Error creating promo code:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

// DELETE: Delete a promo code
export async function DELETE(request: Request) {
  try {
    if (!verifyAdminAccess(request)) {
      return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID erforderlich.' }, { status: 400 });
    }

    await prisma.promoCode.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting promo code:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
