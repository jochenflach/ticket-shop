'use client';

import { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, 
  Plus, 
  Trash2, 
  Grid, 
  Save, 
  RotateCcw, 
  KeyRound, 
  Sparkles,
  Info
} from 'lucide-react';
import styles from './seatmap.module.css';

interface Block {
  id: string;
  rowPrefix: string;
  rows: number;
  seatsPerRow: number;
  startX: number;
  startY: number;
  category: 'KAT1' | 'KAT2';
  price: number;
  curvature: number;
}

interface GeneratedSeat {
  id: string;
  row: number;
  number: number;
  category: 'KAT1' | 'KAT2';
  price: number;
  x: number;
  y: number;
}

export default function SeatmapEditor() {
  // Authentication state
  const [pin, setPin] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Editor configuration state
  const [blocks, setBlocks] = useState<Block[]>([
    {
      id: 'A',
      rowPrefix: 'A',
      rows: 6,
      seatsPerRow: 20,
      startX: 40,
      startY: 106,
      category: 'KAT1',
      price: 40.0,
      curvature: -0.18, // Curved shape
    },
    {
      id: 'B',
      rowPrefix: 'B',
      rows: 10,
      seatsPerRow: 20,
      startX: 40,
      startY: 282,
      category: 'KAT2',
      price: 24.0,
      curvature: 0, // Flat shape
    }
  ]);

  const [selectedBlockId, setSelectedBlockId] = useState<string | null>('A');
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [showGrid, setShowGrid] = useState(true);

  // Drag & drop state
  const [isDragging, setIsDragging] = useState(false);
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Notifications
  const [editorError, setEditorError] = useState<string | null>(null);
  const [editorSuccess, setEditorSuccess] = useState<string | null>(null);

  // Load PIN from session storage
  useEffect(() => {
    const storedPin = sessionStorage.getItem('admin_session_pin');
    if (storedPin) {
      verifyAndLoad(storedPin);
    }
  }, []);

  const verifyAndLoad = async (enteredPin: string) => {
    setLoading(true);
    setAuthError(null);
    try {
      // Authenticate against admin API
      const response = await fetch('/api/admin/promo', {
        headers: { 'x-admin-pin': enteredPin },
      });
      if (response.ok) {
        setIsAuthorized(true);
        sessionStorage.setItem('admin_session_pin', enteredPin);
      } else {
        setAuthError('Ungültige Admin-PIN.');
        sessionStorage.removeItem('admin_session_pin');
      }
    } catch (err) {
      console.error(err);
      setAuthError('Verbindungsfehler zum Server.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin) verifyAndLoad(pin);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('admin_session_pin');
    setIsAuthorized(false);
    setPin('');
  };

  // Convert client cursor coordinates to SVG coordinates
  const getSVGCoords = (e: React.MouseEvent<any>, svgElement: SVGSVGElement) => {
    const rect = svgElement.getBoundingClientRect();
    
    // Width and height of viewbox are 650 x 560
    const x = ((e.clientX - rect.left) / rect.width) * 650;
    const y = ((e.clientY - rect.top) / rect.height) * 560;
    return { x, y };
  };

  // Drag Start
  const handleBlockMouseDown = (e: React.MouseEvent<SVGGElement>, block: Block, svgElement: SVGSVGElement) => {
    e.stopPropagation();
    setSelectedBlockId(block.id);
    setDraggedBlockId(block.id);
    setIsDragging(true);

    const coords = getSVGCoords(e, svgElement);
    setDragOffset({
      x: coords.x - block.startX,
      y: coords.y - block.startY,
    });
  };

  // Drag Move
  const handleCanvasMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isDragging || !draggedBlockId) return;

    const coords = getSVGCoords(e, e.currentTarget);
    let newX = coords.x - dragOffset.x;
    let newY = coords.y - dragOffset.y;

    if (snapToGrid) {
      newX = Math.round(newX / 10) * 10;
      newY = Math.round(newY / 10) * 10;
    }

    // Keep blocks within reasonable viewport bounds
    newX = Math.max(10, Math.min(600 - 50, newX));
    newY = Math.max(60, Math.min(560 - 50, newY));

    setBlocks(blocks.map(b => b.id === draggedBlockId ? { ...b, startX: newX, startY: newY } : b));
  };

  // Drag End
  const handleCanvasMouseUpOrLeave = () => {
    setIsDragging(false);
    setDraggedBlockId(null);
  };

  // Calculate coordinates for a seat inside a block dynamically
  const getSeatsInBlock = (block: Block): GeneratedSeat[] => {
    const seats: GeneratedSeat[] = [];
    const seatSpacing = 24;
    const rowSpacing = 26;

    for (let r = 0; r < block.rows; r++) {
      for (let s = 0; s < block.seatsPerRow; s++) {
        const isRightSide = s >= block.seatsPerRow / 2;
        
        // Horizontal position inside block with center corridor gap
        const xOffset = s * seatSpacing + (isRightSide ? 22 : 0);
        
        // Vertical position
        let yOffset = r * rowSpacing;

        // Apply curvature: center goes lower (positive bend), sides lift higher
        if (block.curvature !== 0) {
          const colOffset = s - (block.seatsPerRow - 1) / 2;
          const curveFactor = colOffset * colOffset * block.curvature;
          
          // We add/subtract curvature offset based on block parameters
          yOffset += curveFactor;
        }

        seats.push({
          id: `${block.id}-R${r + 1}-S${s + 1}`,
          row: r + 1,
          number: s + 1,
          category: block.category,
          price: block.price,
          x: block.startX + xOffset,
          y: block.startY + yOffset,
        });
      }
    }
    return seats;
  };

  // Add Block
  const handleAddBlock = () => {
    // Generate next uppercase letter ID
    const existingIds = blocks.map(b => b.id);
    let nextId = 'A';
    for (let i = 65; i < 90; i++) {
      const char = String.fromCharCode(i);
      if (!existingIds.includes(char)) {
        nextId = char;
        break;
      }
    }

    const newBlock: Block = {
      id: nextId,
      rowPrefix: nextId,
      rows: 4,
      seatsPerRow: 10,
      startX: 150,
      startY: 200,
      category: 'KAT2',
      price: 24.0,
      curvature: 0,
    };

    setBlocks([...blocks, newBlock]);
    setSelectedBlockId(nextId);
  };

  // Delete Block
  const handleDeleteBlock = (id: string) => {
    setBlocks(blocks.filter(b => b.id !== id));
    if (selectedBlockId === id) {
      setSelectedBlockId(null);
    }
  };

  // Update properties of the selected block
  const handleUpdateBlockProperty = (property: keyof Block, value: any) => {
    if (!selectedBlockId) return;
    setBlocks(blocks.map(b => b.id === selectedBlockId ? { ...b, [property]: value } : b));
  };

  // Reset to original layout
  const handleResetLayout = () => {
    if (window.confirm('Möchten Sie den Saalplan wirklich auf die Standardeinstellungen zurücksetzen? Un gespeicherte Änderungen gehen verloren.')) {
      setBlocks([
        {
          id: 'A',
          rowPrefix: 'A',
          rows: 6,
          seatsPerRow: 20,
          startX: 40,
          startY: 106,
          category: 'KAT1',
          price: 40.0,
          curvature: -0.18,
        },
        {
          id: 'B',
          rowPrefix: 'B',
          rows: 10,
          seatsPerRow: 20,
          startX: 40,
          startY: 282,
          category: 'KAT2',
          price: 24.0,
          curvature: 0,
        }
      ]);
      setSelectedBlockId('A');
    }
  };

  // Generate flat array of seats and save to database
  const handleSaveSeatmap = async () => {
    setEditorError(null);
    setEditorSuccess(null);

    const confirmSave = window.confirm(
      'WARNUNG:\nDas Speichern überschreibt den gesamten Saalplan in der Datenbank.\n' +
      'Falls bereits Tickets für die alten Sitz-IDs verkauft wurden, blockiert das System das Speichern zum Schutz der Ticketintegrität.\n\n' +
      'Möchten Sie fortfahren?'
    );
    if (!confirmSave) return;

    // Convert block model into single Seat list
    const seatsToSave: any[] = [];
    
    // Track row offsets so rows are sequentially numbered globally in the database
    let globalRowOffset = 0;

    for (const block of blocks) {
      const blockSeats = getSeatsInBlock(block);
      
      // Map to database schema structure
      blockSeats.forEach(s => {
        seatsToSave.push({
          id: `${block.id}-R${s.row}-S${s.number}`,
          row: globalRowOffset + s.row, // Offset rows sequentially
          number: s.number,
          category: s.category,
          price: s.price,
          x: Math.round(s.x * 100) / 100, // Round to 2 decimals for precision
          y: Math.round(s.y * 100) / 100,
        });
      });

      globalRowOffset += block.rows;
    }

    if (seatsToSave.length === 0) {
      setEditorError('Der Saalplan ist leer. Bitte erstellen Sie mindestens einen Sitzplatzblock.');
      return;
    }

    try {
      const adminPin = sessionStorage.getItem('admin_session_pin') || '';
      const response = await fetch('/api/admin/seatmap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pin': adminPin,
        },
        body: JSON.stringify({ seats: seatsToSave }),
      });

      const data = await response.json();
      if (response.ok) {
        setEditorSuccess(`${seatsToSave.length} Sitzplätze wurden erfolgreich in die Datenbank übertragen und sind ab sofort live im Shop verfügbar!`);
      } else {
        setEditorError(data.error || 'Fehler beim Speichern des Saalplans.');
      }
    } catch (err: any) {
      console.error(err);
      setEditorError('Serverfehler beim Senden des Saalplans: ' + err.message);
    }
  };

  const selectedBlock = blocks.find(b => b.id === selectedBlockId);

  // ==========================================
  // VIEW: Login Page
  // ==========================================
  if (!isAuthorized) {
    return (
      <main className={styles.loginContainer}>
        <div className={styles.glowingBackground}></div>
        <div className={styles.loginCard}>
          <div className={styles.loginIcon}>
            <KeyRound size={28} />
          </div>
          <h2>Admin-Bereich</h2>
          <p>Bitte geben Sie Ihre Admin-PIN ein, um den Saalplan-Editor zu öffnen.</p>

          <form onSubmit={handleLogin}>
            <div className={styles.pinInputGroup}>
              <label htmlFor="pin">PIN-Code</label>
              <input
                type="password"
                id="pin"
                required
                maxLength={8}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="••••"
              />
            </div>
            <button type="submit" disabled={loading} className={styles.loginButton}>
              {loading ? 'Prüfe...' : 'Anmelden'}
            </button>
          </form>

          {authError && <div className={styles.loginError}>{authError}</div>}
        </div>
      </main>
    );
  }

  // ==========================================
  // VIEW: Editor Page
  // ==========================================
  const svgRef = useRef<SVGSVGElement>(null);

  return (
    <main className={styles.container}>
      <div className={styles.glowingBackground}></div>

      {/* Header */}
      <header className={styles.header}>
        <div>
          <h1>Saalplan-Editor</h1>
          <p className={styles.subtitle}>Sitzplatzblöcke erstellen, krümmen und anordnen</p>
        </div>
        <div className={styles.headerButtons}>
          <a href="/admin" className={styles.navButton}>
            <ArrowLeft size={16} />
            Rabatt-Manager
          </a>
          <button onClick={handleResetLayout} className={styles.navButton} title="Layout zurücksetzen">
            <RotateCcw size={16} />
            Zurücksetzen
          </button>
          <button onClick={handleSaveSeatmap} className={styles.saveButton}>
            <Save size={16} />
            Saalplan speichern
          </button>
        </div>
      </header>

      {editorError && <div className={`${styles.errorAlert} mb-4`} style={{marginBottom: '1rem'}}>{editorError}</div>}
      {editorSuccess && <div className={`${styles.successAlert} mb-4`} style={{marginBottom: '1rem'}}>{editorSuccess}</div>}

      <div className={styles.layout}>
        
        {/* Left Column: Canvas */}
        <section className={styles.canvasCard}>
          <div className={styles.canvasHeader}>
            <h3>Sitzplan-Arbeitsfläche (650 x 560 px)</h3>
            <div className={styles.canvasActions}>
              <button 
                onClick={() => setShowGrid(!showGrid)} 
                className={`${styles.actionButton} ${showGrid ? styles.actionButtonActive : ''}`}
                title="Rasterlinien umschalten"
              >
                <Grid size={15} />
                Raster
              </button>
              <button 
                onClick={() => setSnapToGrid(!snapToGrid)} 
                className={`${styles.actionButton} ${snapToGrid ? styles.actionButtonActive : ''}`}
                title="Ausrichtung am Gitter umschalten"
              >
                Magnetisch
              </button>
              <button onClick={handleAddBlock} className={styles.actionButton} style={{backgroundColor: '#090514', color: '#fff'}}>
                <Plus size={15} />
                Block hinzufügen
              </button>
            </div>
          </div>

          <div className={styles.canvasWrapper}>
            <svg 
              ref={svgRef}
              viewBox="0 0 650 560" 
              className={styles.svgEditor}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUpOrLeave}
              onMouseLeave={handleCanvasMouseUpOrLeave}
            >
              {/* Grid Lines */}
              {showGrid && (
                <g>
                  {/* Minor grids (10px step) */}
                  <g className={styles.gridPatternSub}>
                    {Array.from({ length: 65 }).map((_, i) => (
                      <line key={`x-sub-${i}`} x1={i * 10} y1="0" x2={i * 10} y2="560" />
                    ))}
                    {Array.from({ length: 56 }).map((_, i) => (
                      <line key={`y-sub-${i}`} x1="0" y1={i * 10} x2="650" y2={i * 10} />
                    ))}
                  </g>
                  {/* Major grids (50px step) */}
                  <g className={styles.gridPattern}>
                    {Array.from({ length: 13 }).map((_, i) => (
                      <line key={`x-${i}`} x1={i * 50} y1="0" x2={i * 50} y2="560" />
                    ))}
                    {Array.from({ length: 11 }).map((_, i) => (
                      <line key={`y-${i}`} x1="0" y1={i * 50} x2="650" y2={i * 50} />
                    ))}
                  </g>
                </g>
              )}

              {/* Stage Reference */}
              <line x1="120" y1="35" x2="530" y2="35" strokeWidth="8" strokeLinecap="round" className={styles.stagePath} />
              <text x="325" y="55" textAnchor="middle" className={styles.stageText}>BÜHNE</text>

              {/* Render Blocks */}
              {blocks.map((block) => {
                const blockSeats = getSeatsInBlock(block);
                
                // Calculate bounding box values to draw a dotted frame around the block
                const seatSpacing = 24;
                const rowSpacing = 26;
                const width = (block.seatsPerRow - 1) * seatSpacing + 18 + (block.seatsPerRow > 1 ? 22 : 0);
                const height = (block.rows - 1) * rowSpacing + 18 + (block.curvature !== 0 ? Math.pow((block.seatsPerRow - 1) / 2, 2) * Math.abs(block.curvature) : 0);

                const isSelected = selectedBlockId === block.id;

                return (
                  <g 
                    key={block.id} 
                    className={`${styles.editorBlockGroup} ${isSelected ? styles.editorBlockGroupSelected : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedBlockId(block.id);
                    }}
                    onMouseDown={(e) => svgRef.current && handleBlockMouseDown(e, block, svgRef.current)}
                  >
                    {/* Bounding box frame */}
                    <rect 
                      x={block.startX - 10} 
                      y={block.startY - 10} 
                      width={width + 20} 
                      height={height + 20} 
                      rx="8"
                      className={styles.blockRect} 
                    />
                    
                    {/* Block label inside boundary */}
                    <text x={block.startX} y={block.startY - 18} className={styles.blockLabelText}>
                      Block {block.id} ({block.category}, {block.price.toFixed(2)} €)
                    </text>

                    {/* Render Row Labels inside Block */}
                    {Array.from({ length: block.rows }).map((_, r) => {
                      // Grab y coordinate of the first seat in this row
                      const rowFirstSeat = blockSeats.find(s => s.row === r + 1 && s.number === 1);
                      const labelY = rowFirstSeat ? rowFirstSeat.y : block.startY + r * rowSpacing;

                      return (
                        <text key={`label-r-${r}`} x={block.startX - 22} y={labelY + 13} className={styles.rowLabelText}>
                          R {r + 1}
                        </text>
                      );
                    })}

                    {/* Render block seats */}
                    {blockSeats.map((seat) => {
                      let strokeColor = seat.category === 'KAT1' ? 'var(--cat-kat1)' : 'var(--cat-kat2)';
                      return (
                        <rect
                          key={seat.id}
                          x={seat.x}
                          y={seat.y}
                          width="16"
                          height="16"
                          rx="3"
                          className={`${styles.svgSeat} ${styles.svgSeatFree}`}
                          style={{ stroke: strokeColor, strokeWidth: 1.5 }}
                        />
                      );
                    })}
                  </g>
                );
              })}
            </svg>
          </div>
        </section>

        {/* Right Column: Sidebar controls */}
        <section className={styles.sidebarCard}>
          <div className={styles.cardHeader}>
            <h2>Eigenschaften</h2>
          </div>

          {selectedBlock ? (
            <div className={styles.form}>
              <div className={styles.formGroup}>
                <label>Block ID</label>
                <input 
                  type="text" 
                  maxLength={5}
                  value={selectedBlock.id} 
                  onChange={(e) => handleUpdateBlockProperty('id', e.target.value.toUpperCase())}
                />
              </div>

              <div className={styles.formGroup}>
                <label>Kategorie</label>
                <select 
                  value={selectedBlock.category}
                  onChange={(e) => handleUpdateBlockProperty('category', e.target.value)}
                >
                  <option value="KAT1">Kategorie 1 (Premium)</option>
                  <option value="KAT2">Kategorie 2 (Standard)</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label>Preis (€)</label>
                <input 
                  type="number" 
                  step="0.50"
                  min="0"
                  value={selectedBlock.price} 
                  onChange={(e) => handleUpdateBlockProperty('price', parseFloat(e.target.value) || 0)}
                />
              </div>

              <div className={styles.formGroup}>
                <label>Reihen Anzahl</label>
                <input 
                  type="number" 
                  min="1"
                  max="30"
                  value={selectedBlock.rows} 
                  onChange={(e) => handleUpdateBlockProperty('rows', parseInt(e.target.value) || 1)}
                />
              </div>

              <div className={styles.formGroup}>
                <label>Sitze pro Reihe</label>
                <input 
                  type="number" 
                  min="1"
                  max="40"
                  value={selectedBlock.seatsPerRow} 
                  onChange={(e) => handleUpdateBlockProperty('seatsPerRow', parseInt(e.target.value) || 1)}
                />
              </div>

              <div className={styles.formGroup}>
                <label>Krümmung (Anfasser)</label>
                <div className={styles.sliderRow}>
                  <input 
                    type="range" 
                    min="-0.5" 
                    max="0.5" 
                    step="0.01"
                    value={selectedBlock.curvature} 
                    onChange={(e) => handleUpdateBlockProperty('curvature', parseFloat(e.target.value))}
                  />
                  <span className={styles.sliderValue}>
                    {selectedBlock.curvature.toFixed(2)}
                  </span>
                </div>
                <small style={{color: '#6b7280', fontSize: '0.75rem', marginTop: '0.2rem'}}>
                  Negativer Wert biegt die Reihe U-förmig nach unten (wie Kat. 1 im Standardplan).
                </small>
              </div>

              <button 
                onClick={() => handleDeleteBlock(selectedBlock.id)}
                className={styles.deleteBlockButton}
              >
                <Trash2 size={14} />
                Block löschen
              </button>
            </div>
          ) : (
            <div className={styles.emptyState}>
              <Info size={32} />
              <p>Klicken Sie auf einen Block auf der Arbeitsfläche, um seine Eigenschaften zu bearbeiten, oder verschieben Sie ihn per Drag & Drop.</p>
            </div>
          )}
        </section>

      </div>
    </main>
  );
}
