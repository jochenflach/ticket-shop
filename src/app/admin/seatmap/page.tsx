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
  Info,
  ChevronRight,
  FolderOpen
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
  hasAisle?: boolean;
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

interface LayoutDB {
  id: string;
  name: string;
  blocks: string;
  createdAt: string;
  updatedAt: string;
}

export default function SeatmapEditor() {
  // Authentication state
  const [pin, setPin] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Layout List
  const [layouts, setLayouts] = useState<LayoutDB[]>([]);
  const [selectedLayoutId, setSelectedLayoutId] = useState<string | null>('default-layout');
  const [layoutName, setLayoutName] = useState('Musical Standard (320 Plätze)');

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
      curvature: -0.18,
      hasAisle: true,
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
      hasAisle: true,
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

  const svgRef = useRef<SVGSVGElement>(null);

  // Load PIN and layouts
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
      const response = await fetch('/api/admin/promo', {
        headers: { 'x-admin-pin': enteredPin },
      });
      if (response.ok) {
        setIsAuthorized(true);
        sessionStorage.setItem('admin_session_pin', enteredPin);
        
        // Fetch layouts
        await fetchLayouts(enteredPin);
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

  const fetchLayouts = async (adminPin?: string) => {
    try {
      const pin = adminPin || sessionStorage.getItem('admin_session_pin') || '';
      const response = await fetch('/api/admin/seatmap/layouts', {
        headers: { 'x-admin-pin': pin },
      });
      const data = await response.json();
      if (response.ok && data.layouts) {
        setLayouts(data.layouts);
      }
    } catch (err) {
      console.error('Error fetching layouts:', err);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin) verifyAndLoad(pin);
  };

  // Convert client cursor coordinates to SVG coordinates
  const getSVGCoords = (e: React.MouseEvent<any>, svgElement: SVGSVGElement) => {
    const rect = svgElement.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 1000;
    const y = ((e.clientY - rect.top) / rect.height) * 800;
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
      newX = Math.round(newX / 25) * 25;
      newY = Math.round(newY / 25) * 25;
    }

    newX = Math.max(10, Math.min(1000 - 100, newX));
    newY = Math.max(60, Math.min(800 - 80, newY));

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
        // Apply center aisle gap only if hasAisle is true (default to true for legacy blocks)
        const xOffset = s * seatSpacing + (((block.hasAisle ?? true) && isRightSide) ? 22 : 0);
        let yOffset = r * rowSpacing;

        if (block.curvature !== 0) {
          const colOffset = s - (block.seatsPerRow - 1) / 2;
          const curveFactor = colOffset * colOffset * block.curvature;
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
      hasAisle: false, // New blocks do not have an aisle by default
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

  // Load a layout template from DB
  const handleLoadLayout = (layoutId: string) => {
    setEditorError(null);
    setEditorSuccess(null);

    if (!layoutId) {
      // Clear and start new layout template
      setBlocks([
        {
          id: 'A',
          rowPrefix: 'A',
          rows: 4,
          seatsPerRow: 10,
          startX: 150,
          startY: 200,
          category: 'KAT2',
          price: 24.0,
          curvature: 0,
        }
      ]);
      setSelectedLayoutId(null);
      setLayoutName('Neuer Saalplan');
      setSelectedBlockId('A');
      return;
    }

    const layout = layouts.find(l => l.id === layoutId);
    if (layout) {
      try {
        const parsedBlocks = JSON.parse(layout.blocks);
        setBlocks(parsedBlocks);
        setSelectedLayoutId(layout.id);
        setLayoutName(layout.name);
        setSelectedBlockId(parsedBlocks[0]?.id || null);
      } catch (err) {
        console.error('Error parsing blocks:', err);
        setEditorError('Fehler beim Einlesen der Saalplan-Struktur.');
      }
    }
  };

  // Delete layout template
  const handleDeleteLayout = async () => {
    if (!selectedLayoutId) return;
    if (selectedLayoutId === 'default-layout') {
      alert('Das Standard-Layout kann nicht gelöscht werden.');
      return;
    }

    const confirmDelete = window.confirm(
      `Möchten Sie den Saalplan "${layoutName}" wirklich unwiderruflich aus der Datenbank löschen?\n` +
      'Dies schlägt fehl, wenn dieser Saalplan noch Veranstaltungen zugeordnet ist.'
    );
    if (!confirmDelete) return;

    try {
      const adminPin = sessionStorage.getItem('admin_session_pin') || '';
      const response = await fetch(`/api/admin/seatmap/layouts?id=${selectedLayoutId}`, {
        method: 'DELETE',
        headers: {
          'x-admin-pin': adminPin,
        },
      });

      const data = await response.json();
      if (response.ok) {
        setEditorSuccess('Saalplan erfolgreich gelöscht.');
        await fetchLayouts();
        handleLoadLayout('');
      } else {
        setEditorError(data.error || 'Fehler beim Löschen des Saalplans.');
      }
    } catch (err: any) {
      console.error(err);
      setEditorError('Verbindungsfehler beim Löschen: ' + err.message);
    }
  };

  // Save layout template (and generate seats)
  const handleSaveSeatmap = async () => {
    setEditorError(null);
    setEditorSuccess(null);

    if (!layoutName.trim()) {
      setEditorError('Bitte geben Sie einen Namen für den Saalplan ein.');
      return;
    }

    const confirmSave = window.confirm(
      'Möchten Sie diesen Saalplan speichern?\n' +
      'Wenn Sie einen bestehenden Saalplan überschreiben, der mit Veranstaltungen verknüpft ist, darf dafür noch kein Ticket verkauft worden sein.'
    );
    if (!confirmSave) return;

    // Convert block model into single Seat list
    const seatsToSave: any[] = [];
    let globalRowOffset = 0;

    for (const block of blocks) {
      const blockSeats = getSeatsInBlock(block);
      blockSeats.forEach(s => {
        seatsToSave.push({
          // The database layoutId prefix will be added securely on the server!
          id: `${block.id}-R${s.row}-S${s.number}`,
          row: globalRowOffset + s.row,
          number: s.number,
          category: s.category,
          price: s.price,
          x: Math.round(s.x * 100) / 100,
          y: Math.round(s.y * 100) / 100,
        });
      });
      globalRowOffset += block.rows;
    }

    try {
      const adminPin = sessionStorage.getItem('admin_session_pin') || '';
      const response = await fetch('/api/admin/seatmap/layouts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pin': adminPin,
        },
        body: JSON.stringify({
          id: selectedLayoutId,
          name: layoutName,
          blocks: blocks,
          seats: seatsToSave
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setEditorSuccess(data.message || 'Saalplan erfolgreich gespeichert!');
        
        // Refresh layout list and select the newly created/saved layout ID
        await fetchLayouts();
        if (data.layoutId) {
          setSelectedLayoutId(data.layoutId);
        }
      } else {
        setEditorError(data.error || 'Fehler beim Speichern des Saalplans.');
      }
    } catch (err: any) {
      console.error(err);
      setEditorError('Serverfehler beim Speichern des Saalplans: ' + err.message);
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
          <button onClick={handleSaveSeatmap} className={styles.saveButton}>
            <Save size={16} />
            Saalplan speichern
          </button>
        </div>
      </header>

      {editorError && <div className={`${styles.errorAlert}`} style={{marginBottom: '1rem'}}>{editorError}</div>}
      {editorSuccess && <div className={`${styles.successAlert}`} style={{marginBottom: '1rem'}}>{editorSuccess}</div>}

      <div className={styles.layout}>
        
        {/* Left Column: Canvas */}
        <section className={styles.canvasCard}>
          <div className={styles.canvasHeader}>
            <h3 style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
              <FolderOpen size={18} style={{color: '#d97706'}} />
              {layoutName}
            </h3>
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
              viewBox="0 0 1000 800" 
              className={styles.svgEditor}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUpOrLeave}
              onMouseLeave={handleCanvasMouseUpOrLeave}
            >
              {/* Grid Lines */}
              {showGrid && (
                <g>
                  <g className={styles.gridPatternSub}>
                    {Array.from({ length: 101 }).map((_, i) => (
                      <line key={`x-sub-${i}`} x1={i * 10} y1="0" x2={i * 10} y2="800" />
                    ))}
                    {Array.from({ length: 81 }).map((_, i) => (
                      <line key={`y-sub-${i}`} x1="0" y1={i * 10} x2="1000" y2={i * 10} />
                    ))}
                  </g>
                  <g className={styles.gridPattern}>
                    {Array.from({ length: 21 }).map((_, i) => (
                      <line key={`x-${i}`} x1={i * 50} y1="0" x2={i * 50} y2="800" />
                    ))}
                    {Array.from({ length: 17 }).map((_, i) => (
                      <line key={`y-${i}`} x1="0" y1={i * 50} x2="1000" y2={i * 50} />
                    ))}
                  </g>
                </g>
              )}

              {/* Stage Reference */}
              <line x1="300" y1="35" x2="700" y2="35" strokeWidth="8" strokeLinecap="round" className={styles.stagePath} />
              <text x="500" y="55" textAnchor="middle" className={styles.stageText}>BÜHNE</text>

              {/* Render Blocks */}
              {blocks.map((block) => {
                const seatSpacing = 24;
                const rowSpacing = 26;
                const blockSeats = getSeatsInBlock(block);
                const width = (block.seatsPerRow - 1) * seatSpacing + 18 + (((block.hasAisle ?? true) && block.seatsPerRow > 1) ? 22 : 0);
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
                    <rect 
                      x={block.startX - 10} 
                      y={block.startY - 10} 
                      width={width + 20} 
                      height={height + 20} 
                      rx="8"
                      className={styles.blockRect} 
                    />
                    
                    <text x={block.startX} y={block.startY - 18} className={styles.blockLabelText}>
                      Block {block.id} ({block.category}, {block.price.toFixed(2)} €)
                    </text>

                    {Array.from({ length: block.rows }).map((_, r) => {
                      const rowFirstSeat = blockSeats.find(s => s.row === r + 1 && s.number === 1);
                      const labelY = rowFirstSeat ? rowFirstSeat.y : block.startY + r * rowSpacing;

                      return (
                        <text key={`label-r-${r}`} x={block.startX - 22} y={labelY + 13} className={styles.rowLabelText}>
                          R {r + 1}
                        </text>
                      );
                    })}

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
            <h2>Saalplan-Auswahl</h2>
          </div>

          <div className={styles.form} style={{borderBottom: '1px solid #e5e7eb', paddingBottom: '1.5rem'}}>
            <div className={styles.formGroup}>
              <label>Vorlage laden</label>
              <select
                value={selectedLayoutId || ''}
                onChange={(e) => handleLoadLayout(e.target.value)}
              >
                <option value="">-- Neuen Saalplan entwerfen --</option>
                {layouts.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.name} {l.id === 'default-layout' ? '(Standard)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label>Name des Saalplans</label>
              <input 
                type="text" 
                placeholder="z.B. Konzert 200 Plätze"
                value={layoutName} 
                onChange={(e) => setLayoutName(e.target.value)}
              />
            </div>
            
            {selectedLayoutId && selectedLayoutId !== 'default-layout' && (
              <button 
                onClick={handleDeleteLayout}
                className={styles.deleteBlockButton}
                style={{marginTop: '0.2rem'}}
              >
                <Trash2 size={14} />
                Vorlage löschen
              </button>
            )}
          </div>

          <div className={styles.cardHeader} style={{marginTop: '-0.5rem'}}>
            <h2>Block-Eigenschaften</h2>
          </div>

          {selectedBlock ? (
            <div className={styles.form}>
              <div className={styles.formGroup}>
                <label>Block ID / Name</label>
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

              <div className={styles.formGroup} style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginTop: '0.25rem', marginBottom: '0.25rem' }}>
                <input 
                  type="checkbox" 
                  id="hasAisle"
                  checked={selectedBlock.hasAisle ?? false} 
                  onChange={(e) => handleUpdateBlockProperty('hasAisle', e.target.checked)}
                  style={{ width: '18px', height: '18px', margin: 0, cursor: 'pointer' }}
                />
                <label htmlFor="hasAisle" style={{ margin: 0, cursor: 'pointer', textTransform: 'none', fontSize: '0.85rem', fontWeight: 600 }}>
                  Mittelgang einfügen
                </label>
              </div>

              <div className={styles.formGroup}>
                <label>Krümmung</label>
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
