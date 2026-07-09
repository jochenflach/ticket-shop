'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Calendar, MapPin, Ticket, CreditCard, Loader2, Sparkles, ShieldCheck, Timer, Clock, ChevronRight, ArrowLeft } from 'lucide-react';
import styles from './page.module.css';
import { getBlockNameFromSeatId } from '@/lib/utils';

// Type definitions
interface Seat {
  id: string;
  row: number;
  number: number;
  category: string;
  price: number;
  status: 'free' | 'locked' | 'booked';
  lockedBy: string;
  isMine: boolean;
  x: number;
  y: number;
}

function TicketShopContent() {
  const searchParams = useSearchParams();
  const isEmbedded = searchParams.get('embed') === 'true';

  const [seats, setSeats] = useState<Seat[]>([]);
  const [selectedSeatIds, setSelectedSeatIds] = useState<string[]>([]);
  const [sessionId, setSessionId] = useState<string>('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  
  // Ticket types per seat (NORMAL, STUDENT, CHILD)
  const [ticketTypes, setTicketTypes] = useState<{ [key: string]: string }>({});

  // Promo Code States
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<any | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);

  // Multi-Event States
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [eventsLoading, setEventsLoading] = useState(true);

  const prevLengthRef = useRef(0);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize Session ID
  useEffect(() => {
    let storedSessionId = localStorage.getItem('musical_shop_session_id');
    if (!storedSessionId) {
      storedSessionId = 'sess_' + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('musical_shop_session_id', storedSessionId);
    }
    setSessionId(storedSessionId);
  }, []);

  // Fetch all events on load
  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const response = await fetch('/api/events');
        const data = await response.json();
        if (response.ok && data.events) {
          setEvents(data.events);
          
          // Check if URL has eventId
          const urlEventId = searchParams.get('eventId');
          if (urlEventId) {
            const matched = data.events.find((e: any) => e.id === urlEventId);
            if (matched) {
              setSelectedEventId(matched.id);
              setSelectedEvent(matched);
            }
          }
        }
      } catch (err) {
        console.error('Error loading events:', err);
      } finally {
        setEventsLoading(false);
      }
    };
    fetchEvents();
  }, [searchParams]);

  // Fetch seats data for the selected event
  const fetchSeats = async (showLoading = false) => {
    if (!sessionId || !selectedEventId) return;
    if (showLoading) setLoading(true);
    try {
      const response = await fetch(`/api/seats?eventId=${selectedEventId}`, {
        headers: {
          'x-session-id': sessionId,
        },
      });
      const data = await response.json();
      if (response.ok) {
        setSeats(data.seats);
        // Sync selected seats (only seats that are marked as 'locked' and 'isMine')
        const mine = data.seats
          .filter((s: Seat) => s.status === 'locked' && s.isMine)
          .map((s: Seat) => s.id);
        setSelectedSeatIds(mine);
        
        // Initialize ticket types for selected seats
        setTicketTypes(prev => {
          const next = { ...prev };
          mine.forEach((id: string) => {
            if (!next[id]) {
              next[id] = 'NORMAL';
            }
          });
          // Clean up old ones that are no longer selected
          const mineSet = new Set(mine);
          Object.keys(next).forEach(id => {
            if (!mineSet.has(id)) {
              delete next[id];
            }
          });
          return next;
        });

        setError(null);
      } else {
        setError(data.error || 'Fehler beim Laden des Saalplans.');
      }
    } catch (err) {
      console.error(err);
      setError('Verbindung zum Server fehlgeschlagen.');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  // Poll for seat status updates (re-binds when event changes)
  useEffect(() => {
    if (sessionId && selectedEventId) {
      fetchSeats(true);
      
      // Poll every 8 seconds for real-time multi-location updates
      pollingRef.current = setInterval(() => {
        fetchSeats(false);
      }, 8000);
    }

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [sessionId, selectedEventId]);

  // Handle timer expiration
  const handleTimerExpiry = async () => {
    setError('Ihre Reservierungszeit ist abgelaufen. Die Sitzplätze wurden freigegeben.');
    const expiredSeats = [...selectedSeatIds];
    setSelectedSeatIds([]);
    setAppliedPromo(null);
    setPromoCodeInput('');
    setPromoError(null);
    sessionStorage.removeItem('musical_shop_timer_expiry');
    setTimeLeft(null);

    if (sessionId && expiredSeats.length > 0 && selectedEventId) {
      try {
        await fetch('/api/seats/lock', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-session-id': sessionId,
          },
          body: JSON.stringify({
            action: 'unlock',
            seatIds: expiredSeats,
            eventId: selectedEventId,
          }),
        });
      } catch (err) {
        console.error('Error releasing locks on timer expiry:', err);
      }
    }
    fetchSeats(false);
  };

  // Handle applying a promo code
  const handleApplyPromo = async (e?: React.FormEvent, codeToUse?: string) => {
    if (e) e.preventDefault();
    const code = codeToUse !== undefined ? codeToUse : promoCodeInput;
    if (!code.trim() || selectedSeatIds.length === 0) return;

    setPromoLoading(true);
    setPromoError(null);
    try {
      const response = await fetch('/api/checkout/promo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim(), seatIds: selectedSeatIds }),
      });
      const data = await response.json();
      if (response.ok && data.valid) {
        setAppliedPromo(data);
      } else {
        setPromoError(data.error || 'Ungültiger Rabattcode.');
        setAppliedPromo(null);
      }
    } catch (err) {
      console.error(err);
      setPromoError('Fehler bei der Rabattcode-Prüfung.');
    } finally {
      setPromoLoading(false);
    }
  };

  // Sync / set expiration timestamp based on selected seat count & watch for promo recalculation
  useEffect(() => {
    const currentLength = selectedSeatIds.length;
    const prevLength = prevLengthRef.current;
    prevLengthRef.current = currentLength;

    if (currentLength === 0) {
      sessionStorage.removeItem('musical_shop_timer_expiry');
      setTimeLeft(null);
      setAppliedPromo(null);
      setPromoCodeInput('');
      setPromoError(null);
    } else {
      // Re-validate active promo code when seat counts or ticket types change
      if (appliedPromo) {
        handleApplyPromo(undefined, appliedPromo.code);
      }

      if (prevLength === 0 || currentLength > prevLength) {
        // Seat added (new lock created), reset timer to 12 minutes
        const newExpiry = Date.now() + 12 * 60 * 1000;
        sessionStorage.setItem('musical_shop_timer_expiry', newExpiry.toString());
        setTimeLeft(12 * 60);
      } else {
        // Seat removed or just synced, keep counting down based on stored expiry
        const stored = sessionStorage.getItem('musical_shop_timer_expiry');
        if (stored) {
          const diff = Math.max(0, Math.round((parseInt(stored) - Date.now()) / 1000));
          if (diff <= 0) {
            handleTimerExpiry();
          } else {
            setTimeLeft(diff);
          }
        } else {
          const newExpiry = Date.now() + 12 * 60 * 1000;
          sessionStorage.setItem('musical_shop_timer_expiry', newExpiry.toString());
          setTimeLeft(12 * 60);
        }
      }
    }
  }, [selectedSeatIds, ticketTypes]);

  // Tick the timer every second
  useEffect(() => {
    if (timeLeft === null) return;

    const interval = setInterval(() => {
      const stored = sessionStorage.getItem('musical_shop_timer_expiry');
      if (stored) {
        const expiryTime = parseInt(stored);
        const diff = Math.round((expiryTime - Date.now()) / 1000);
        if (diff <= 0) {
          clearInterval(interval);
          setTimeLeft(0);
          handleTimerExpiry();
        } else {
          setTimeLeft(diff);
        }
      } else {
        setTimeLeft(null);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [timeLeft]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle seat click
  const handleSeatClick = async (seat: Seat) => {
    if (submitting) return;

    const isSelected = selectedSeatIds.includes(seat.id);
    const action = isSelected ? 'unlock' : 'lock';

    // Optimistic UI update
    setError(null);

    try {
      const response = await fetch('/api/seats/lock', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': sessionId,
        },
        body: JSON.stringify({
          action,
          seatIds: [seat.id],
          eventId: selectedEventId,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        if (isSelected) {
          setSelectedSeatIds(selectedSeatIds.filter((id) => id !== seat.id));
          setTicketTypes(prev => {
            const next = { ...prev };
            delete next[seat.id];
            return next;
          });
        } else {
          setSelectedSeatIds([...selectedSeatIds, seat.id]);
          setTicketTypes(prev => ({ ...prev, [seat.id]: 'NORMAL' }));
        }
        // Force refresh to get exact status
        fetchSeats(false);
      } else {
        setError(data.error || 'Platzreservierung fehlgeschlagen.');
        fetchSeats(false);
      }
    } catch (err) {
      console.error(err);
      setError('Fehler bei der Platzreservierung.');
      fetchSeats(false);
    }
  };

  // Handle Checkout submission
  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedSeatIds.length === 0 || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId,
          customerName,
          customerEmail,
          seatIds: selectedSeatIds,
          source: 'CUSTOMER',
          promoCode: appliedPromo?.code || null,
          ticketTypes,
          eventId: selectedEventId,
        }),
      });

      const data = await response.json();

      if (response.ok && data.redirectUrl) {
        // Redirect to Stripe Checkout or simulated payment
        window.location.href = data.redirectUrl;
      } else {
        setError(data.error || 'Checkout fehlgeschlagen. Bitte versuchen Sie es erneut.');
        setSubmitting(false);
      }
    } catch (err) {
      console.error(err);
      setError('Verbindungsfehler beim Checkout.');
      setSubmitting(false);
    }
  };

  // Get pricing category details
  const calculateTicketPrice = (basePrice: number, type: string) => {
    if (type === 'STUDENT') return Math.round(basePrice * 0.8 * 100) / 100; // 20% discount
    if (type === 'CHILD') return Math.round(basePrice * 0.6 * 100) / 100;   // 40% discount
    return basePrice;
  };

  const getSelectedSeatsDetails = () => {
    return seats.filter((s) => selectedSeatIds.includes(s.id));
  };

  const selectedSeatsDetails = getSelectedSeatsDetails();

  const baseTotal = selectedSeatsDetails.reduce((sum: number, seat) => {
    const type = ticketTypes[seat.id] || 'NORMAL';
    return sum + calculateTicketPrice(seat.price, type);
  }, 0);

  const totalPrice = baseTotal; // Re-sync totalPrice variable to use baseTotal for other components

  // Group seats by row for the interactive rendering
  const rows: { [key: number]: Seat[] } = {};
  seats.forEach((seat) => {
    if (!rows[seat.row]) {
      rows[seat.row] = [];
    }
    rows[seat.row].push(seat);
  });

  // ==========================================
  // VIEW: Event Selection Page
  // ==========================================
  if (!selectedEventId) {
    return (
      <main className={`${styles.main} ${isEmbedded ? styles.embeddedMain : ''}`}>
        {!isEmbedded && <div className={styles.glowingBackground}></div>}
        
        <header className={styles.header}>
          <div className={styles.badge}>
            <Sparkles size={14} className={styles.goldText} />
            <span>Musical-Highlight 2026</span>
          </div>
          <h1 className={styles.title}>DAS WILDE WEIB</h1>
          <p className={styles.subtitle}>Ein fesselndes Drama aus der Region über Freiheit, Liebe und Rebellion</p>
        </header>

        {eventsLoading ? (
          <div className={styles.loadingOverlay} style={{ minHeight: '300px' }}>
            <Loader2 size={40} className={styles.spinner} />
            <p>Lade Vorstellungen...</p>
          </div>
        ) : events.length === 0 ? (
          <div className={styles.emptyState} style={{ maxWidth: '600px', margin: '3rem auto', padding: '3rem', background: 'rgba(9, 5, 20, 0.6)', border: '1px solid #33275b', borderRadius: '12px', textAlign: 'center' }}>
            <Calendar size={48} style={{ color: '#d97706', marginBottom: '1rem' }} />
            <h2>Keine Vorstellungen geplant</h2>
            <p style={{ color: '#9ca3af', fontSize: '0.95rem' }}>Aktuell sind keine Spieltermine im System eingetragen. Bitte versuchen Sie es später noch einmal.</p>
          </div>
        ) : (
          <div style={{ maxWidth: '900px', margin: '2rem auto', padding: '0 1rem' }}>
            <h2 style={{ textAlign: 'center', color: '#fff', marginBottom: '2.5rem', fontSize: '1.6rem', fontWeight: 600 }}>Bitte wählen Sie einen Termin aus:</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
              {events.map(ev => {
                const dateObj = new Date(ev.date);
                const dayStr = dateObj.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
                const timeStr = dateObj.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr';
                
                return (
                  <div
                    key={ev.id}
                    className="glass"
                    style={{
                      border: '1px solid #33275b',
                      borderRadius: '12px',
                      padding: '1.75rem',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      background: 'rgba(15, 8, 30, 0.45)',
                      transition: 'all 0.3s ease',
                      position: 'relative',
                      overflow: 'hidden'
                    }}
                  >
                    <div>
                      <h3 style={{ color: '#fbbf24', fontSize: '1.25rem', marginBottom: '1rem', fontWeight: 700 }}>{ev.title}</h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', color: '#e5e7eb', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Calendar size={15} style={{ color: '#fbbf24' }} />
                          <span>{dayStr}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Clock size={15} style={{ color: '#fbbf24' }} />
                          <span>{timeStr}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <MapPin size={15} style={{ color: '#fbbf24' }} />
                          <span>Stadthalle Wildeshausen</span>
                        </div>
                      </div>
                      {ev.description && (
                        <p style={{ color: '#9ca3af', fontSize: '0.85rem', lineHeight: '1.4', marginBottom: '1.5rem' }}>
                          {ev.description}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setSelectedEventId(ev.id);
                        setSelectedEvent(ev);
                        const url = new URL(window.location.href);
                        url.searchParams.set('eventId', ev.id);
                        window.history.replaceState({}, '', url.toString());
                      }}
                      className={styles.checkoutButton}
                      style={{
                        width: '100%',
                        backgroundColor: '#fbbf24',
                        color: '#090514',
                        fontWeight: 700,
                        border: 'none',
                        padding: '0.75rem',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        transition: 'transform 0.2s ease',
                        marginTop: 'auto'
                      }}
                    >
                      <Ticket size={16} />
                      Sitzplätze wählen
                      <ChevronRight size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    );
  }

  return (
    <main className={`${styles.main} ${isEmbedded ? styles.embeddedMain : ''}`}>
      {/* Floating Timer at Top Left */}
      {timeLeft !== null && (
        <div className={`${styles.floatingTimer} ${timeLeft < 120 ? styles.floatingTimerUrgent : ''}`}>
          <Timer size={18} className={timeLeft < 120 ? styles.flashingIcon : ''} />
          <div className={styles.timerDetails}>
            <span className={styles.timerTitle}>Sitzplätze reserviert</span>
            <span className={styles.timerCountdown}>{formatTime(timeLeft)}</span>
          </div>
        </div>
      )}

      {/* Background glowing effects */}
      {!isEmbedded && <div className={styles.glowingBackground}></div>}

      {/* Header / Hero Section */}
      {!isEmbedded && (
        <header className={styles.header}>
          <div className={styles.badge}>
            <Sparkles size={14} className={styles.goldText} />
            <span>Musical-Highlight 2026</span>
          </div>
          <h1 className={styles.title}>{selectedEvent?.title ?? 'DAS WILDE WEIB'}</h1>
          <p className={styles.subtitle}>Ein fesselndes Drama aus der Region über Freiheit, Liebe und Rebellion</p>
          
          <div className={styles.infoRow}>
            <div className={styles.infoCard}>
              <Calendar size={18} className={styles.purpleText} />
              <div>
                <h3>Vorstellung</h3>
                <p>
                  {selectedEvent ? new Date(selectedEvent.date).toLocaleDateString('de-DE', {
                    weekday: 'short',
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit'
                  }) + ' Uhr' : 'Spieltermin'}
                </p>
              </div>
            </div>
            <div className={styles.infoCard}>
              <MapPin size={18} className={styles.purpleText} />
              <div>
                <h3>Spielort</h3>
                <p>Stadthalle Wildeshausen</p>
              </div>
            </div>
            <div className={styles.infoCard}>
              <Ticket size={18} className={styles.purpleText} />
              <div>
                <h3>Preise</h3>
                <p>Ab 24,00 €</p>
              </div>
            </div>
          </div>
        </header>
      )}

      {/* Back Button to switch shows */}
      {!isEmbedded && (
        <div style={{ maxWidth: '1200px', margin: '0 auto 1.5rem auto', padding: '0 1rem' }}>
          <button
            onClick={() => {
              setSelectedEventId(null);
              setSelectedEvent(null);
              setSelectedSeatIds([]);
              setTicketTypes({});
              const url = new URL(window.location.href);
              url.searchParams.delete('eventId');
              window.history.replaceState({}, '', url.toString());
            }}
            className={styles.backButton}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              border: '1px solid #33275b',
              backgroundColor: 'rgba(9, 5, 20, 0.6)',
              color: '#fff',
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
              transition: 'all 0.2s ease',
              fontSize: '0.85rem'
            }}
          >
            <ArrowLeft size={14} /> Vorstellung wechseln
          </button>
        </div>
      )}

      {/* Main Content Grid */}
      <div className={styles.grid}>
        
        {/* Left Column: Seat Selector */}
         <section className={`${styles.card} glass`}>
          <div className={styles.cardHeader}>
            <h2>Sitzplatz wählen</h2>
            <p>Klicken Sie auf freie Plätze, um diese zu reservieren (max. 12 Minuten)</p>
          </div>

          {/* Seat Map Legend */}
          <div className={styles.legend}>
            <div className={styles.legendItem}>
              <div className={`${styles.legendBox} ${styles.seatFree}`}></div>
              <span>Frei</span>
            </div>
            <div className={styles.legendItem}>
              <div className={`${styles.legendBox} ${styles.seatSelected}`}></div>
              <span>Ausgewählt</span>
            </div>
            <div className={styles.legendItem}>
              <div className={`${styles.legendBox} ${styles.seatLocked}`}></div>
              <span>Reserviert</span>
            </div>
            <div className={styles.legendItem}>
              <div className={`${styles.legendBox} ${styles.seatBooked}`}></div>
              <span>Belegt</span>
            </div>
          </div>

          <div className={styles.categoryLegend}>
            <div className={styles.legendItem}>
              <span className={styles.catKat1Dot}>●</span>
              <span>Kategorie 1 (Reihe 1-6, leicht gebogen) — 40,00 €</span>
            </div>
            <div className={styles.legendItem}>
              <span className={styles.catKat2Dot}>●</span>
              <span>Kategorie 2 (Reihe 7-16, gerade) — 24,00 €</span>
            </div>
          </div>

          {/* Seat Map Container */}
          <div className={styles.seatMapWrapper}>
            {loading ? (
              <div className={styles.loadingOverlay}>
                <Loader2 size={40} className={styles.spinner} />
                <p>Lade Saalplan...</p>
              </div>
            ) : (
              (() => {
                // Calculate dynamic bounding box of seats to crop out margins
                let viewBox = "0 0 1000 800";
                let stageX1 = 300;
                let stageX2 = 700;
                let stageY = 35;
                let stageTextY = 55;

                if (seats.length > 0) {
                  const xCoords = seats.map(s => s.x);
                  const yCoords = seats.map(s => s.y);
                  const minX = Math.min(...xCoords);
                  const maxX = Math.max(...xCoords);
                  const minY = Math.min(...yCoords);
                  const maxY = Math.max(...yCoords);

                  const paddingX = 40;
                  const paddingBottom = 40;

                  const svgMinX = Math.max(0, minX - paddingX);
                  const stageWidth = Math.min(400, Math.max(150, maxX - minX));
                  const centerX = (minX + maxX) / 2;
                  stageX1 = centerX - stageWidth / 2;
                  stageX2 = centerX + stageWidth / 2;
                  stageY = Math.max(10, minY - 50);
                  stageTextY = stageY + 20;

                  const svgMinY = Math.max(0, stageY - 35);
                  const svgWidth = (maxX + 18 + paddingX) - svgMinX;
                  const svgHeight = (maxY + 18 + paddingBottom) - svgMinY;

                  viewBox = `${svgMinX} ${svgMinY} ${svgWidth} ${svgHeight}`;
                }

                return (
                  <div className={styles.svgContainer}>
                    <svg viewBox={viewBox} className={styles.svgSeatmap}>
                      {/* Stage (Bühne) */}
                      <line 
                        x1={stageX1} 
                        y1={stageY} 
                        x2={stageX2} 
                        y2={stageY} 
                        stroke="var(--accent)" 
                        strokeWidth="8" 
                        strokeLinecap="round"
                        className={styles.stagePath}
                      />
                      <text x={(stageX1 + stageX2) / 2} y={stageTextY} textAnchor="middle" className={styles.stageText}>BÜHNE</text>

                      {/* Render Block Labels */}
                      {(() => {
                        const blockMap: { [key: string]: Seat[] } = {};
                        seats.forEach((seat) => {
                          const blockName = getBlockNameFromSeatId(seat.id);
                          if (blockName) {
                            if (!blockMap[blockName]) blockMap[blockName] = [];
                            blockMap[blockName].push(seat);
                          }
                        });

                        return Object.entries(blockMap).map(([blockName, blockSeats]) => {
                          const firstRowSeats = blockSeats.filter(s => s.row === 1);
                          if (firstRowSeats.length === 0) return null;

                          const minX = Math.min(...blockSeats.map(s => s.x));
                          const minY = Math.min(...firstRowSeats.map(s => s.y));
                          const sampleSeat = blockSeats[0];
                          const categoryLabel = sampleSeat.category === 'KAT1' ? 'Premium' : 'Standard';

                          return (
                            <text
                              key={`label-${blockName}`}
                              x={minX}
                              y={minY - 14}
                              className={styles.blockLabelText}
                            >
                              {blockName} ({categoryLabel}, {sampleSeat.price.toFixed(2)} €)
                            </text>
                          );
                        });
                      })()}

                      {/* Render Rows and Seats */}
                      {Object.entries(rows).map(([rowNumStr, rowSeats]) => {
                        const rowNum = parseInt(rowNumStr);
                        
                        const firstSeatY = rowSeats[0]?.y ?? (90 + (rowNum - 1) * 28 + (rowNum >= 7 ? 24 : 0));
                        const labelY = firstSeatY;

                        const leftSeatX = rowSeats.length > 0 ? Math.min(...rowSeats.map(s => s.x)) : 15;
                        const rightSeatX = rowSeats.length > 0 ? Math.max(...rowSeats.map(s => s.x)) : 615;

                        return (
                          <g key={rowNum} className={styles.seatRowGroup}>
                            {/* Row label left */}
                            <text x={leftSeatX - 25} y={labelY + 14} className={styles.rowLabelText}>R {rowNum}</text>

                            {/* Seats */}
                            {rowSeats.map((seat) => {
                              const x = seat.x;
                              const y = seat.y;

                              let seatColorClass = styles.svgSeatFree;
                              let strokeColor = '';
                              
                              if (seat.category === 'KAT1') strokeColor = 'var(--cat-kat1)';
                              else strokeColor = 'var(--cat-kat2)';

                              if (seat.status === 'booked') {
                                seatColorClass = styles.svgSeatBooked;
                              } else if (seat.status === 'locked') {
                                seatColorClass = seat.isMine ? styles.svgSeatSelected : styles.svgSeatLocked;
                              }

                              return (
                                <g key={seat.id} className={styles.seatGroup}>
                                  <rect
                                    x={x}
                                    y={y}
                                    width="18"
                                    height="18"
                                    rx="4"
                                    className={`${styles.svgSeat} ${seatColorClass}`}
                                    style={{ stroke: seat.status === 'free' ? strokeColor : undefined }}
                                    onClick={() => seat.status !== 'booked' && (seat.status !== 'locked' || seat.isMine) && handleSeatClick(seat)}
                                  >
                                    <title>
                                      {`Reihe ${seat.row}, Platz ${seat.number}\nKategorie: ${seat.category}\nPreis: ${seat.price.toFixed(2)} €\nStatus: ${
                                        seat.status === 'booked' ? 'Belegt' : seat.status === 'locked' ? (seat.isMine ? 'Ausgewählt' : 'Reserviert') : 'Frei'
                                      }`}
                                    </title>
                                  </rect>
                                  {/* Seat number inside rect for readability when zoomed */}
                                  <text 
                                    x={x + 9} 
                                    y={y + 12} 
                                    textAnchor="middle" 
                                    className={styles.seatNumberInside}
                                  >
                                    {seat.number}
                                  </text>
                                </g>
                              );
                            })}

                            {/* Row label right */}
                            <text x={rightSeatX + 18 + 10} y={labelY + 14} className={styles.rowLabelText}>R {rowNum}</text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                );
              })()
            )}
          </div>
        </section>

        {/* Right Column: Cart & Checkout Form */}
        <section className={styles.checkoutSection}>
          <div className={`${styles.card} glass`}>
            <div className={styles.cardHeader}>
              <h2>Ihre Auswahl</h2>
            </div>

            {error && <div className={styles.errorAlert}>{error}</div>}

            {selectedSeatsDetails.length === 0 ? (
              <div className={styles.emptyCart}>
                <Ticket size={48} className={styles.textMuted} />
                <p>Noch keine Plätze ausgewählt.</p>
                <p className={styles.hint}>Klicken Sie auf freie Plätze im Saalplan, um mit der Buchung zu starten.</p>
              </div>
            ) : (
              <div className={styles.cartContainer}>
                          <div className={styles.ticketsList}>
                  {selectedSeatsDetails.map((seat) => {
                    const type = ticketTypes[seat.id] || 'NORMAL';
                    const seatPrice = calculateTicketPrice(seat.price, type);
                    
                    return (
                      <div key={seat.id} className={styles.ticketItem}>
                        <div className={styles.ticketDetails}>
                          <span className={styles.ticketTitle}>{getBlockNameFromSeatId(seat.id)} — Reihe {seat.row}, Platz {seat.number}</span>
                          <span className={styles.ticketCategory} style={{ color: seat.category === 'KAT1' ? 'var(--cat-kat1)' : 'var(--cat-kat2)' }}>
                            {seat.category}
                          </span>
                          <select
                            value={type}
                            onChange={(e) => setTicketTypes(prev => ({ ...prev, [seat.id]: e.target.value }))}
                            className={styles.ticketTypeSelect}
                          >
                            <option value="NORMAL">Normaltarif</option>
                            <option value="STUDENT">Schüler/Student (-20%)</option>
                            <option value="CHILD">Kind (-40%)</option>
                          </select>
                        </div>
                        <span className={styles.ticketPrice}>{seatPrice.toFixed(2)} €</span>
                      </div>
                    );
                  })}
                </div>

                {/* Reservation Hint */}
                <div className={styles.reservationNotice}>
                  <span>Plätze sind reserviert. Bitte schließen Sie die Buchung ab.</span>
                </div>

                {/* Promo Code Input Block */}
                <div className={styles.promoSection}>
                  <div className={styles.promoForm}>
                    <input
                      type="text"
                      placeholder="Rabattcode"
                      value={promoCodeInput}
                      onChange={(e) => setPromoCodeInput(e.target.value)}
                      disabled={promoLoading}
                      className={styles.promoInput}
                    />
                    <button 
                      onClick={(e) => handleApplyPromo(e)}
                      disabled={promoLoading || !promoCodeInput.trim()}
                      className={styles.promoButton}
                    >
                      {promoLoading ? '...' : 'Anwenden'}
                    </button>
                  </div>
                  {promoError && <div className={styles.promoError}>{promoError}</div>}
                  {appliedPromo && (
                    <div className={styles.promoApplied}>
                      <span>Code {appliedPromo.code} aktiv! (-{appliedPromo.discountAmount.toFixed(2)} €)</span>
                      <button 
                        onClick={() => { setAppliedPromo(null); setPromoCodeInput(''); }} 
                        className={styles.promoRemoveBtn}
                      >
                        Entfernen
                      </button>
                    </div>
                  )}
                </div>

                {/* Total price or Breakdown */}
                {appliedPromo ? (
                  <div className={styles.priceBreakdown}>
                    <div className={styles.priceRow}>
                      <span>Zwischensumme</span>
                      <span>{baseTotal.toFixed(2)} €</span>
                    </div>
                    <div className={`${styles.priceRow} ${styles.discountRow}`}>
                      <span>Rabatt ({appliedPromo.code})</span>
                      <span>-{appliedPromo.discountAmount.toFixed(2)} €</span>
                    </div>
                    <div className={styles.totalPriceRow}>
                      <span>Gesamtsumme</span>
                      <span className={styles.totalPrice}>{appliedPromo.newTotal.toFixed(2)} €</span>
                    </div>
                  </div>
                ) : (
                  <div className={styles.totalPriceRow}>
                    <span>Gesamtsumme</span>
                    <span className={styles.totalPrice}>{baseTotal.toFixed(2)} €</span>
                  </div>
                )}

                {/* Customer Form */}
                <form onSubmit={handleCheckout} className={styles.form}>
                  <div className={styles.formGroup}>
                    <label htmlFor="name">Name</label>
                    <input
                      type="text"
                      id="name"
                      required
                      placeholder="Max Mustermann"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label htmlFor="email">E-Mail-Adresse</label>
                    <input
                      type="email"
                      id="email"
                      required
                      placeholder="max@beispiel.de"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                    />
                  </div>

                  <button 
                    type="submit" 
                    className={styles.checkoutButton}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <>
                        <Loader2 size={16} className={`${styles.spinner} ${styles.mr2}`} />
                        <span>Verarbeite...</span>
                      </>
                    ) : (
                      <>
                        <CreditCard size={18} className={styles.mr2} />
                        <span>Jetzt online bezahlen</span>
                      </>
                    )}
                  </button>
                </form>

                <div className={styles.securitySeal}>
                  <ShieldCheck size={14} className={styles.greenText} />
                  <span>Sichere Zahlung via Stripe</span>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

export default function TicketShop() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', color: '#9ca3af', gap: '1rem' }}>
        <Loader2 style={{ animation: 'spin 1.2s linear infinite' }} size={32} />
        <span>Lade Ticketshop...</span>
      </div>
    }>
      <TicketShopContent />
    </Suspense>
  );
}
