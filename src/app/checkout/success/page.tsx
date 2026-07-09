'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle2, Ticket, Printer, ArrowLeft, Loader2, Calendar, MapPin } from 'lucide-react';
import confetti from 'canvas-confetti';
import styles from './success.module.css';
import { getBlockNameFromSeatId } from '@/lib/utils';

interface Seat {
  id: string;
  row: number;
  number: number;
  category: string;
  price: number;
}

interface TicketData {
  id: string;
  ticketCode: string;
  seat: Seat;
}

interface Order {
  id: string;
  customerName: string;
  customerEmail: string;
  totalAmount: number;
  status: string;
  source: string;
  tickets: TicketData[];
}

function CheckoutSuccessContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const orderId = searchParams.get('orderId');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<Order | null>(null);

  useEffect(() => {
    if (!orderId) {
      setError('Keine Bestell-ID gefunden.');
      setLoading(false);
      return;
    }

    const fetchOrder = async () => {
      try {
        const response = await fetch(`/api/orders/${orderId}`);
        const data = await response.json();

        if (response.ok && data.order) {
          setOrder(data.order);
          // Trigger confetti on successful fetch
          confetti({
            particleCount: 150,
            spread: 80,
            origin: { y: 0.6 },
            colors: ['#a78bfa', '#fbbf24', '#34d399', '#3b82f6'],
          });
        } else {
          setError(data.error || 'Bestellung konnte nicht geladen werden.');
        }
      } catch (err) {
        console.error(err);
        setError('Fehler beim Laden der Bestelldaten.');
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [orderId]);

  return (
    <main className={styles.main}>
      <div className={`${styles.container} glass`}>
        {loading ? (
          <div className={styles.loading}>
            <Loader2 size={40} className={styles.spinner} />
            <p>Lade Buchungsbestätigung...</p>
          </div>
        ) : error ? (
          <div className={styles.errorBox}>
            <h2 className={styles.errorTitle}>Fehler</h2>
            <p>{error}</p>
            <button onClick={() => router.push('/')} className={styles.backButton}>
              <ArrowLeft size={16} className={styles.mr2} />
              <span>Zurück zum Shop</span>
            </button>
          </div>
        ) : order ? (
          <div className={styles.successContent}>
            {/* Header Success Check */}
            <div className={styles.successHeader}>
              <div className={styles.checkIconWrapper}>
                <CheckCircle2 size={56} className={styles.checkIcon} />
              </div>
              <h1>Vielen Dank für Ihre Buchung!</h1>
              <p className={styles.leadText}>
                Ihre Tickets für <strong>"Das Wilde Weib"</strong> wurden erfolgreich reserviert und stehen unten zum Ausdruck bereit.
              </p>
              <p className={styles.emailNotice}>
                Eine Bestätigung wurde an <strong>{order.customerEmail}</strong> gesendet.
              </p>
            </div>

            {/* Event Info Card */}
            <div className={styles.eventInfoCard}>
              <div className={styles.eventRow}>
                <Calendar size={16} className={styles.purpleText} />
                <span>Samstag, 24. Oktober & Sonntag, 25. Oktober 2026</span>
              </div>
              <div className={styles.eventRow}>
                <MapPin size={16} className={styles.purpleText} />
                <span>Stadthalle Wildeshausen (Einlass ab 19:00 Uhr)</span>
              </div>
            </div>

            {/* Tickets List */}
            <div className={styles.ticketsSection}>
              <h3>Ihre Tickets ({order.tickets.length})</h3>
              
              <div className={styles.ticketsGrid}>
                {order.tickets.map((t) => (
                  <div key={t.id} className={styles.ticketCard}>
                    <div className={styles.ticketCardHeader}>
                      <Ticket size={24} className={styles.goldText} />
                      <div className={styles.ticketSeatInfo}>
                        <span className={styles.seatNum}>{getBlockNameFromSeatId(t.seat.id)} — Reihe {t.seat.row}, Platz {t.seat.number}</span>
                        <span className={styles.seatCat}>{t.seat.category}</span>
                      </div>
                    </div>
                    
                    <div className={styles.ticketCardFooter}>
                      <span className={styles.ticketCode}>{t.ticketCode}</span>
                      <a 
                        href={`/ticket/${t.id}`} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className={styles.printLinkButton}
                      >
                        <Printer size={14} className={styles.mr2} />
                        <span>Ticket anzeigen</span>
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Back to Shop Button */}
            <div className={styles.actions}>
              <button onClick={() => router.push('/')} className={styles.doneButton}>
                <ArrowLeft size={16} className={styles.mr2} />
                <span>Zurück zum Ticketshop</span>
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}

export default function CheckoutSuccess() {
  return (
    <Suspense fallback={
      <main className={styles.main}>
        <div className={`${styles.container} glass`}>
          <div className={styles.loading}>
            <Loader2 size={40} className={styles.spinner} />
            <p>Lade Buchungsbestätigung...</p>
          </div>
        </div>
      </main>
    }>
      <CheckoutSuccessContent />
    </Suspense>
  );
}
