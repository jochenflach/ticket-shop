'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Calendar, MapPin, Ticket, CreditCard, Loader2, Sparkles, ShieldCheck, Timer } from 'lucide-react';
import styles from './page.module.css';

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

  const prevLengthRef = useRef(0);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize Session ID
  useEffect(() => {
    // Check if session ID exists in localStorage, otherwise create new one
    let storedSessionId = localStorage.getItem('musical_shop_session_id');
    if (!storedSessionId) {
      storedSessionId = 'sess_' + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('musical_shop_session_id', storedSessionId);
    }
    setSessionId(storedSessionId);
  }, []);

  // Fetch seats data
  const fetchSeats = async (showLoading = false) => {
    if (!sessionId) return;
    if (showLoading) setLoading(true);
    try {
      const response = await fetch('/api/seats', {
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

  // Poll for seat status updates
  useEffect(() => {
    if (sessionId) {
      fetchSeats(true);
      
      // Poll every 5 seconds for real-time multi-location updates
      pollingRef.current = setInterval(() => {
        fetchSeats(false);
      }, 5000);
    }

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [sessionId]);

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

    if (sessionId && expiredSeats.length > 0) {
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
          <h1 className={styles.title}>DAS WILDE WEIB</h1>
          <p className={styles.subtitle}>Ein fesselndes Drama aus der Region über Freiheit, Liebe und Rebellion</p>
        
        <div className={styles.infoRow}>
          <div className={styles.infoCard}>
            <Calendar size={18} className={styles.purpleText} />
            <div>
              <h3>Termine</h3>
              <p>24. & 25. Oktober 2026</p>
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
              <p>Ab 29,00 €</p>
          </div>
        </div>
      </div>
    </header>
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
              <div className={styles.svgContainer}>
                <svg viewBox="0 0 650 560" className={styles.svgSeatmap}>
                  {/* Stage (Bühne) */}
                  <line 
                    x1="120" 
                    y1="35" 
                    x2="530" 
                    y2="35" 
                    stroke="var(--accent)" 
                    strokeWidth="8" 
                    strokeLinecap="round"
                    className={styles.stagePath}
                  />
                  <text x="325" y="55" textAnchor="middle" className={styles.stageText}>BÜHNE</text>

                  {/* Render Rows and Seats */}
                  {Object.entries(rows).map(([rowNumStr, rowSeats]) => {
                    const rowNum = parseInt(rowNumStr);
                    
                    const firstSeatY = rowSeats[0]?.y ?? (90 + (rowNum - 1) * 28 + (rowNum >= 7 ? 24 : 0));
                    const labelY = firstSeatY;

                    return (
                      <g key={rowNum} className={styles.seatRowGroup}>
                        {/* Row label left */}
                        <text x="15" y={labelY + 14} className={styles.rowLabelText}>R {rowNum}</text>

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
                        <text x="615" y={labelY + 14} className={styles.rowLabelText}>R {rowNum}</text>
                      </g>
                    );
                  })}
                </svg>
              </div>
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
                          <span className={styles.ticketTitle}>Reihe {seat.row}, Platz {seat.number}</span>
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
