'use client';

import { useState, useEffect } from 'react';
import { KeyRound, ShieldAlert, Plus, Trash2, CheckCircle2, XCircle, Tag, Percent, Euro } from 'lucide-react';
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

export default function AdminDashboard() {
  const [pin, setPin] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(false);

  // Form state
  const [newCode, setNewCode] = useState('');
  const [newType, setNewType] = useState<'PERCENT' | 'FIXED'>('PERCENT');
  const [newValue, setNewValue] = useState('');
  const [newMaxUses, setNewMaxUses] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState(false);

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
      const response = await fetch('/api/admin/promo', {
        headers: {
          'x-admin-pin': enteredPin,
        },
      });
      const data = await response.json();
      if (response.ok) {
        setIsAuthorized(true);
        setPromoCodes(data.promoCodes);
        sessionStorage.setItem('admin_session_pin', enteredPin);
      } else {
        setError(data.error || 'Ungültige Admin-PIN.');
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
        // Reload list
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
        headers: {
          'x-admin-pin': activePin,
        },
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

  const handleLogout = () => {
    sessionStorage.removeItem('admin_session_pin');
    setIsAuthorized(false);
    setPin('');
    setPromoCodes([]);
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
            <p>Bitte geben Sie die Admin-PIN ein, um Gutscheincodes zu verwalten.</p>
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
          <h1>Rabattcode-Manager</h1>
          <p className={styles.subtitle}>Gutscheine erstellen, überwachen und deaktivieren</p>
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

      <div className={styles.grid}>
        {/* Left column: Create new code */}
        <section className={`${styles.card} glass`}>
          <div className={styles.cardHeader}>
            <h2>Code erstellen</h2>
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
