'use client';

import { useState, useEffect } from 'react';
import { 
  KeyRound, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  XCircle, 
  Tag, 
  Percent, 
  Euro, 
  Calendar, 
  Clock, 
  MapPin, 
  Compass, 
  ChevronRight,
  Sparkles
} from 'lucide-react';
import styles from './admin.module.css';

interface PromoCode {
  id: string;
  code: string;
  type: 'PERCENT' | 'FIXED';
  value: number;
  isActive: boolean;
  maxUses: number | null;
  usedCount: number;
  createdAt: string;
}

interface EventDB {
  id: string;
  title: string;
  date: string;
  description: string | null;
  layoutId: string;
  layout: {
    name: string;
  };
}

interface LayoutDB {
  id: string;
  name: string;
}

export default function AdminDashboard() {
  // Auth state
  const [pin, setPin] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Content states
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [events, setEvents] = useState<EventDB[]>([]);
  const [layouts, setLayouts] = useState<LayoutDB[]>([]);

  // Promo Code Form state
  const [newCode, setNewCode] = useState('');
  const [newType, setNewType] = useState<'PERCENT' | 'FIXED'>('PERCENT');
  const [newValue, setNewValue] = useState('');
  const [newMaxUses, setNewMaxUses] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState(false);

  // Event Form state
  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [eventLayoutId, setEventLayoutId] = useState('');
  const [eventFormError, setEventFormError] = useState<string | null>(null);
  const [eventFormSuccess, setEventFormSuccess] = useState(false);

  // Load PIN from sessionStorage if exists
  useEffect(() => {
    const storedPin = sessionStorage.getItem('admin_session_pin');
    if (storedPin) {
      verifyAndLoad(storedPin);
    }
  }, []);

  const verifyAndLoad = async (enteredPin: string) => {
    setLoading(true);
    setError(null);
    try {
      // 1. Verify access & load promos
      const promoResponse = await fetch('/api/admin/promo', {
        headers: { 'x-admin-pin': enteredPin },
      });
      const promoData = await promoResponse.json();

      if (promoResponse.ok) {
        setIsAuthorized(true);
        setPromoCodes(promoData.promoCodes);
        sessionStorage.setItem('admin_session_pin', enteredPin);

        // 2. Fetch events
        const eventsResponse = await fetch('/api/admin/events', {
          headers: { 'x-admin-pin': enteredPin },
        });
        const eventsData = await eventsResponse.json();
        if (eventsResponse.ok && eventsData.events) {
          setEvents(eventsData.events);
        }

        // 3. Fetch layouts
        const layoutsResponse = await fetch('/api/admin/seatmap/layouts', {
          headers: { 'x-admin-pin': enteredPin },
        });
        const layoutsData = await layoutsResponse.json();
        if (layoutsResponse.ok && layoutsData.layouts) {
          setLayouts(layoutsData.layouts);
          if (layoutsData.layouts.length > 0 && !eventLayoutId) {
            setEventLayoutId(layoutsData.layouts[0].id);
          }
        }
      } else {
        setError(promoData.error || 'Ungültige Admin-PIN.');
        sessionStorage.removeItem('admin_session_pin');
      }
    } catch (err) {
      console.error(err);
      setError('Verbindung zum Server fehlgeschlagen.');
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin) return;
    verifyAndLoad(pin);
  };

  const handleCreatePromo = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(false);

    if (!newCode || !newValue) {
      setFormError('Bitte geben Sie Code und Wert ein.');
      return;
    }

    const valueNum = parseFloat(newValue);
    if (isNaN(valueNum) || valueNum <= 0) {
      setFormError('Der Wert muss eine positive Zahl sein.');
      return;
    }

    if (newType === 'PERCENT' && valueNum > 100) {
      setFormError('Prozentualer Rabatt darf maximal 100% betragen.');
      return;
    }

    const activePin = pin || sessionStorage.getItem('admin_session_pin') || '';

    try {
      const response = await fetch('/api/admin/promo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pin': activePin,
        },
        body: JSON.stringify({
          code: newCode,
          type: newType,
          value: valueNum,
          maxUses: newMaxUses ? parseInt(newMaxUses) : null,
          isActive: true,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setFormSuccess(true);
        setNewCode('');
        setNewValue('');
        setNewMaxUses('');
        verifyAndLoad(activePin);
      } else {
        setFormError(data.error || 'Erstellung fehlgeschlagen.');
      }
    } catch (err) {
      console.error(err);
      setFormError('Fehler beim Senden der Anfrage.');
    }
  };

  const handleDeletePromo = async (id: string) => {
    if (!confirm('Möchten Sie diesen Rabattcode wirklich löschen?')) return;
    const activePin = pin || sessionStorage.getItem('admin_session_pin') || '';

    try {
      const response = await fetch(`/api/admin/promo?id=${id}`, {
        method: 'DELETE',
        headers: { 'x-admin-pin': activePin },
      });

      if (response.ok) {
        verifyAndLoad(activePin);
      } else {
        const data = await response.json();
        alert(data.error || 'Löschen fehlgeschlagen.');
      }
    } catch (err) {
      console.error(err);
      alert('Fehler beim Löschen.');
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setEventFormError(null);
    setEventFormSuccess(false);

    if (!eventTitle || !eventDate || !eventLayoutId) {
      setEventFormError('Bitte füllen Sie alle Pflichtfelder aus.');
      return;
    }

    const activePin = pin || sessionStorage.getItem('admin_session_pin') || '';

    try {
      const response = await fetch('/api/admin/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pin': activePin,
        },
        body: JSON.stringify({
          title: eventTitle,
          date: new Date(eventDate).toISOString(),
          description: eventDescription || null,
          layoutId: eventLayoutId,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setEventFormSuccess(true);
        setEventTitle('');
        setEventDate('');
        setEventDescription('');
        verifyAndLoad(activePin);
      } else {
        setEventFormError(data.error || 'Erstellung der Veranstaltung fehlgeschlagen.');
      }
    } catch (err: any) {
      console.error(err);
      setEventFormError('Fehler: ' + err.message);
    }
  };

  const handleDeleteEvent = async (id: string, name: string) => {
    const confirmDelete = confirm(
      `Möchten Sie die Veranstaltung "${name}" wirklich löschen?\n` +
      'Das ist nur möglich, wenn noch keine Tickets dafür gebucht wurden.'
    );
    if (!confirmDelete) return;

    const activePin = pin || sessionStorage.getItem('admin_session_pin') || '';

    try {
      const response = await fetch(`/api/admin/events?id=${id}`, {
        method: 'DELETE',
        headers: { 'x-admin-pin': activePin },
      });

      const data = await response.json();
      if (response.ok) {
        verifyAndLoad(activePin);
      } else {
        alert(data.error || 'Löschen fehlgeschlagen.');
      }
    } catch (err: any) {
      console.error(err);
      alert('Fehler beim Löschen: ' + err.message);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('admin_session_pin');
    setIsAuthorized(false);
    setPin('');
    setPromoCodes([]);
    setEvents([]);
    setLayouts([]);
  };

  const formatEventDate = (dateString: string) => {
    try {
      const d = new Date(dateString);
      return d.toLocaleDateString('de-DE', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }) + ' Uhr';
    } catch (e) {
      return dateString;
    }
  };

  // ==========================================
  // VIEW: Login screen
  // ==========================================
  if (!isAuthorized) {
    return (
      <main className={styles.loginContainer}>
        <div className={styles.glowingBackground}></div>
        <div className={`${styles.loginCard} glass`}>
          <div className={styles.loginHeader}>
            <KeyRound size={48} className={styles.goldText} />
            <h1>Admin-Dashboard</h1>
            <p>Bitte geben Sie die Admin-PIN ein, um den Ticketshop zu verwalten.</p>
          </div>

          {error && <div className={styles.errorAlert}>{error}</div>}

          <form onSubmit={handleLoginSubmit} className={styles.form}>
            <div className={styles.formGroup}>
              <label htmlFor="pin">Admin-PIN</label>
              <input
                type="password"
                id="pin"
                required
                placeholder="••••"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                autoFocus
              />
            </div>
            <button type="submit" className={styles.loginButton} disabled={loading}>
              {loading ? 'Prüfe...' : 'Freischalten'}
            </button>
          </form>
        </div>
      </main>
    );
  }

  // ==========================================
  // VIEW: Authorized dashboard
  // ==========================================
  return (
    <main className={styles.adminContainer}>
      <div className={styles.glowingBackground}></div>
      
      <header className={styles.header}>
        <div>
          <h1 style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
            <Sparkles size={26} style={{color: '#fbbf24'}} />
            Admin-Dashboard
          </h1>
          <p className={styles.subtitle}>Veranstaltungen, Saalpläne und Rabattcodes verwalten</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <a href="/admin/seatmap" className={styles.logoutButton} style={{ textDecoration: 'none', backgroundColor: '#d97706', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            Saalplan-Editor
          </a>
          <button onClick={handleLogout} className={styles.logoutButton}>
            Abmelden
          </button>
        </div>
      </header>

      {/* Row 1: Events Section */}
      <div className={styles.grid} style={{ marginBottom: '2.5rem' }}>
        
        {/* Left: Create Event */}
        <section className={`${styles.card} glass`}>
          <div className={styles.cardHeader}>
            <h2>Veranstaltung anlegen</h2>
          </div>

          {eventFormError && <div className={styles.errorAlert}>{eventFormError}</div>}
          {eventFormSuccess && <div className={styles.successAlert}>Veranstaltung erfolgreich angelegt!</div>}

          <form onSubmit={handleCreateEvent} className={styles.form}>
            <div className={styles.formGroup}>
              <label htmlFor="eventTitle">Titel der Vorstellung</label>
              <input
                type="text"
                id="eventTitle"
                required
                placeholder="z.B. Das Wilde Weib - Samstagsshow"
                value={eventTitle}
                onChange={(e) => setEventTitle(e.target.value)}
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="eventDate">Datum & Uhrzeit (Einlass/Beginn)</label>
              <input
                type="datetime-local"
                id="eventDate"
                required
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="eventLayout">Zugeordneter Saalplan (Vorlage)</label>
              <select
                id="eventLayout"
                required
                value={eventLayoutId}
                onChange={(e) => setEventLayoutId(e.target.value)}
              >
                {layouts.length === 0 ? (
                  <option value="">Keine Saalpläne vorhanden (Bitte erst erstellen)</option>
                ) : (
                  layouts.map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))
                )}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="eventDescription">Beschreibung / Zusatzinfos (optional)</label>
              <textarea
                id="eventDescription"
                placeholder="Zusatzinfos wie 'Einlass ab 18:30 Uhr' oder ähnliches..."
                value={eventDescription}
                onChange={(e) => setEventDescription(e.target.value)}
                style={{ width: '100%', minHeight: '60px', borderRadius: '6px', border: '1px solid #e5e7eb', padding: '0.5rem', backgroundColor: '#090514', color: '#fff' }}
              />
            </div>

            <button type="submit" className={styles.createButton} style={{ backgroundColor: '#10b981' }}>
              <Calendar size={18} className={styles.mr2} />
              Termin anlegen
            </button>
          </form>
        </section>

        {/* Right: Events list */}
        <section className={`${styles.card} glass`}>
          <div className={styles.cardHeader}>
            <h2>Geplante Veranstaltungen</h2>
          </div>

          {events.length === 0 ? (
            <div className={styles.emptyState}>
              <Calendar size={48} className={styles.textMuted} />
              <p>Keine Veranstaltungen geplant.</p>
              <p className={styles.hint}>Erstellen Sie links einen Termin und weisen Sie einen Saalplan zu.</p>
            </div>
          ) : (
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Vorstellung</th>
                    <th>Termin</th>
                    <th>Saalplan</th>
                    <th>Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id}>
                      <td className={styles.codeCell}>{event.title}</td>
                      <td style={{fontSize: '0.85rem'}}>{formatEventDate(event.date)}</td>
                      <td>
                        <span className={styles.discountBadge} style={{ backgroundColor: '#4f46e5' }}>
                          {event.layout?.name || 'Unbekannt'}
                        </span>
                      </td>
                      <td>
                        <button
                          onClick={() => handleDeleteEvent(event.id, event.title)}
                          className={styles.deleteButton}
                          title="Löschen"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Row 2: Promo Codes Section */}
      <div className={styles.grid}>
        
        {/* Left column: Create new code */}
        <section className={`${styles.card} glass`}>
          <div className={styles.cardHeader}>
            <h2>Rabattcode erstellen</h2>
          </div>

          {formError && <div className={styles.errorAlert}>{formError}</div>}
          {formSuccess && <div className={styles.successAlert}>Rabattcode erfolgreich erstellt!</div>}

          <form onSubmit={handleCreatePromo} className={styles.form}>
            <div className={styles.formGroup}>
              <label htmlFor="code">Code (z.B. EARLYBIRD10)</label>
              <input
                type="text"
                id="code"
                required
                placeholder="CODE"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
              />
            </div>

            <div className={styles.formGroup}>
              <label>Rabatt-Typ</label>
              <div className={styles.radioGroup}>
                <label className={newType === 'PERCENT' ? styles.activeRadio : ''}>
                  <input
                    type="radio"
                    name="type"
                    checked={newType === 'PERCENT'}
                    onChange={() => setNewType('PERCENT')}
                  />
                  Prozentual (%)
                </label>
                <label className={newType === 'FIXED' ? styles.activeRadio : ''}>
                  <input
                    type="radio"
                    name="type"
                    checked={newType === 'FIXED'}
                    onChange={() => setNewType('FIXED')}
                  />
                  Festbetrag (€)
                </label>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="value">
                {newType === 'PERCENT' ? 'Prozentwert (z.B. 10 für 10%)' : 'Rabattwert in € (z.B. 5.00 für 5 €)'}
              </label>
              <input
                type="number"
                id="value"
                step="0.01"
                required
                placeholder="0.00"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="maxUses">Maximale Einlösungen (optional)</label>
              <input
                type="number"
                id="maxUses"
                placeholder="Unbegrenzt"
                value={newMaxUses}
                onChange={(e) => setNewMaxUses(e.target.value)}
              />
            </div>

            <button type="submit" className={styles.createButton}>
              <Plus size={18} className={styles.mr2} />
              Code anlegen
            </button>
          </form>
        </section>

        {/* Right column: Codes list */}
        <section className={`${styles.card} glass`}>
          <div className={styles.cardHeader}>
            <h2>Aktive Rabattcodes</h2>
          </div>

          {promoCodes.length === 0 ? (
            <div className={styles.emptyState}>
              <Tag size={48} className={styles.textMuted} />
              <p>Keine Rabattcodes definiert.</p>
              <p className={styles.hint}>Nutzen Sie das Formular links, um den ersten Code anzulegen.</p>
            </div>
          ) : (
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Rabatt</th>
                    <th>Nutzung</th>
                    <th>Status</th>
                    <th>Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {promoCodes.map((promo) => (
                    <tr key={promo.id}>
                      <td className={styles.codeCell}>{promo.code}</td>
                      <td>
                        <span className={styles.discountBadge}>
                          {promo.type === 'PERCENT' ? (
                            <>
                              <Percent size={12} className={styles.mr1} />
                              {promo.value}%
                            </>
                          ) : (
                            <>
                              <Euro size={12} className={styles.mr1} />
                              {promo.value.toFixed(2)} €
                            </>
                          )}
                        </span>
                      </td>
                      <td>
                        <span className={styles.useCount}>
                          {promo.usedCount}
                          {promo.maxUses !== null ? ` / ${promo.maxUses}` : ' (∞)'}
                        </span>
                      </td>
                      <td>
                        {promo.isActive && (promo.maxUses === null || promo.usedCount < promo.maxUses) ? (
                          <span className={styles.statusActive}>
                            <CheckCircle2 size={12} className={styles.mr1} /> Aktiv
                          </span>
                        ) : (
                          <span className={styles.statusInactive}>
                            <XCircle size={12} className={styles.mr1} /> Inaktiv
                          </span>
                        )}
                      </td>
                      <td>
                        <button
                          onClick={() => handleDeletePromo(promo.id)}
                          className={styles.deleteButton}
                          title="Löschen"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
