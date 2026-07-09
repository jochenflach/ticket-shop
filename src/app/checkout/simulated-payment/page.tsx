'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CreditCard, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import styles from './payment.module.css';

interface Seat {
  id: string;
  row: number;
  number: number;
  category: string;
  price: number;
}

interface Order {
  id: string;
  customerName: string;
  customerEmail: string;
  totalAmount: number;
  status: string;
}

function SimulatedPaymentContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const orderId = searchParams.get('orderId');
  const sessionId = searchParams.get('sessionId');
  const ticketTypesRaw = searchParams.get('ticketTypes');

  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [seats, setSeats] = useState<Seat[]>([]);

  const ticketTypes = ticketTypesRaw 
    ? JSON.parse(decodeURIComponent(ticketTypesRaw)) 
    : {};

  // Fetch order details
  useEffect(() => {
    if (!orderId) {
      setError('Keine Bestell-ID übergeben.');
      setLoading(false);
      return;
    }

    const fetchOrderDetails = async () => {
      try {
        // 1. Fetch exact order from the DB
        const orderResponse = await fetch(`/api/orders/${orderId}`);
        const orderData = await orderResponse.json();

        if (orderResponse.ok && orderData.order) {
          setOrder(orderData.order);
        } else {
          setError(orderData.error || 'Bestellung konnte nicht geladen werden.');
          setLoading(false);
          return;
        }

        // 2. Fetch seats locked by this session
        const seatsResponse = await fetch('/api/seats', {
          headers: {
            'x-session-id': sessionId || '',
          },
        });
        const seatsData = await seatsResponse.json();

        if (seatsResponse.ok) {
          const myLockedSeats = seatsData.seats.filter((s: any) => s.status === 'locked' && s.isMine);
          setSeats(myLockedSeats);
        } else {
          setError('Sitzplatzdaten konnten nicht geladen werden.');
        }
      } catch (err) {
        console.error(err);
        setError('Verbindung zum Server fehlgeschlagen.');
      } finally {
        setLoading(false);
      }
    };

    fetchOrderDetails();
  }, [orderId, sessionId]);

  const handleSimulatePayment = async () => {
    if (!orderId || paying) return;
    setPaying(true);
    setError(null);

    const seatIds = seats.map((s) => s.id);

    try {
      const response = await fetch('/api/webhook/stripe-simulator', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId,
          seatIds,
          ticketTypes,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Redirect to success page
        router.push(`/checkout/success?orderId=${orderId}`);
      } else {
        setError(data.error || 'Zahlungssimulation fehlgeschlagen.');
        setPaying(false);
      }
    } catch (err) {
      console.error(err);
      setError('Verbindungsfehler beim Simulieren der Zahlung.');
      setPaying(false);
    }
  };

  return (
    <main className={styles.main}>
      <div className={`${styles.container} glass`}>
        <div className={styles.header}>
          <div className={styles.warningBadge}>
            <AlertTriangle size={16} />
            <span>Test-Umgebung (Stripe nicht aktiv)</span>
          </div>
          <h1>Zahlungs-Simulator</h1>
          <p>Diese Seite simuliert den Stripe-Checkout-Prozess für die lokale Entwicklung.</p>
        </div>

        {loading ? (
          <div className={styles.loading}>
            <Loader2 size={32} className={styles.spinner} />
            <p>Lade Bestelldaten...</p>
          </div>
        ) : error ? (
          <div className={styles.errorBox}>
            <h2>Fehler</h2>
            <p>{error}</p>
            <button onClick={() => router.push('/')} className={styles.backButton}>
              Zurück zum Shop
            </button>
          </div>
        ) : (
          <div className={styles.content}>
            <div className={styles.orderSummary}>
              <h3>Bestellübersicht</h3>
              <div className={styles.summaryRow}>
                <span>Bestell-ID:</span>
                <span className={styles.bold}>{orderId}</span>
              </div>
              <div className={styles.summaryRow}>
                <span>Ausgewählte Plätze:</span>
                <span className={styles.bold}>
                  {seats.map((s) => `R${s.row}-S${s.number}`).join(', ')}
                </span>
              </div>
              <div className={styles.summaryRow}>
                <span>Gesamtsumme (inkl. Rabatte):</span>
                <span className={styles.totalAmount}>{order?.totalAmount.toFixed(2)} €</span>
              </div>
            </div>

            <div className={styles.terminal}>
              <div className={styles.terminalHeader}>
                <CreditCard size={18} />
                <span>Simuliertes Terminal</span>
              </div>
              
              <div className={styles.terminalBody}>
                <p>Klicken Sie unten, um eine erfolgreiche Kreditkartenzahlung oder Lastschrift über Stripe zu simulieren. Die Plätze werden fest gebucht und die Tickets generiert.</p>
                
                <button 
                  onClick={handleSimulatePayment} 
                  className={styles.payButton}
                  disabled={paying}
                >
                  {paying ? (
                    <>
                      <Loader2 size={18} className={styles.spinner} />
                      <span>Verarbeite Zahlung...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={18} />
                      <span>Zahlung simulieren (Erfolgreich)</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <button onClick={() => router.push(`/?sessionId=${sessionId}`)} className={styles.cancelButton}>
              Zahlung abbrechen
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

export default function SimulatedPayment() {
  return (
    <Suspense fallback={
      <main className={styles.main}>
        <div className={`${styles.container} glass`}>
          <div className={styles.loading}>
            <Loader2 size={32} className={styles.spinner} />
            <p>Lade Zahlungs-Simulator...</p>
          </div>
        </div>
      </main>
    }>
      <SimulatedPaymentContent />
    </Suspense>
  );
}
