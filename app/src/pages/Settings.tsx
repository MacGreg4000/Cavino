import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Plus, Wine, FileDown, Loader2, QrCode, Copy, Check, Printer, ExternalLink, Info } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { useLocationStore } from '../stores/location';
import { useWineStore } from '../stores/wine';
import { apiFetch } from '../lib/api';
import { useToast } from '../components/ui/Toast';

const PUBLIC_BASE = import.meta.env.VITE_PUBLIC_BASE_URL || '';


export function Settings() {
  const { locations, fetchLocations } = useLocationStore();
  const { wines, pendingCount, fetchWines, fetchPending } = useWineStore();
  const [pdfLoading, setPdfLoading] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const qrContainerRef = useRef<HTMLDivElement>(null);
  const publicUrl = `${PUBLIC_BASE || window.location.origin}/public`;
  const { toast } = useToast();

  const handleCopyUrl = async () => {
    await navigator.clipboard.writeText(publicUrl);
    setUrlCopied(true);
    setTimeout(() => setUrlCopied(false), 2000);
  };

  const handlePrintQR = () => {
    const svg = qrContainerRef.current?.querySelector('svg');
    if (!svg) return;
    const svgHtml = new XMLSerializer().serializeToString(svg);
    const printWin = window.open('', '_blank');
    if (!printWin) return;
    printWin.document.write(`<!DOCTYPE html>
<html lang="fr"><head>
  <meta charset="UTF-8">
  <title>QR Code — Cave</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; background: white;
           display: flex; flex-direction: column; align-items: center;
           justify-content: center; min-height: 100vh; gap: 10px; padding: 30px; }
    h1  { font-size: 1.2rem; font-weight: 300; letter-spacing: 0.2em; text-transform: uppercase; color: #111; }
    p   { font-size: 0.75rem; color: #888; letter-spacing: 0.05em; }
    svg { width: 230px; height: 230px; margin: 10px 0; }
    .url { font-size: 0.6rem; color: #bbb; font-family: monospace; max-width: 270px; text-align: center; word-break: break-all; }
    @media print { @page { margin: 20mm; } }
  </style>
</head><body>
  <h1>Ma Cave</h1>
  <p>Scannez pour accéder à la cave</p>
  ${svgHtml}
  <div class="url">${publicUrl}</div>
  <script>window.onload = () => { window.focus(); window.print(); }</script>
</body></html>`);
    printWin.document.close();
  };

  useEffect(() => {
    fetchLocations();
    fetchWines();
    fetchPending();
  }, [fetchLocations, fetchWines, fetchPending]);

  const handleDownloadPdf = async () => {
    setPdfLoading(true);
    try {
      const resp = await apiFetch('/api/pdf/wine-list?template=v2');
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Erreur inconnue' }));
        toast('error', err.error || 'Impossible de générer le PDF');
        return;
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'carte-des-vins.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast('error', 'Erreur lors de la génération du PDF');
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div>
      <PageHeader title="Réglages" />

      <div className="px-4 pt-4 max-w-lg mx-auto space-y-4 pb-8">
        {/* Locations */}
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <MapPin size={16} className="text-accent" />
            <h3 className="text-sm font-semibold">Emplacements</h3>
            <span className="ml-auto text-xs text-text-secondary font-mono">{locations.length}</span>
          </div>
          {locations.length > 0 ? (
            <div className="space-y-2 mb-3">
              {locations.map((loc) => (
                <Link key={loc.id} to={`/cellar/${loc.id}`} className="flex items-center gap-2 text-sm text-text-secondary hover:text-text transition-colors">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: loc.color || '#8B1A1A' }} />
                  <span className="flex-1">{loc.name}</span>
                  <Badge variant="default">{loc.type}</Badge>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-muted mb-3">Aucun emplacement configuré</p>
          )}
          <Link to="/cellar/new">
            <Button variant="secondary" size="sm">
              <Plus size={14} /> Ajouter un emplacement
            </Button>
          </Link>
        </Card>

        {/* Data summary */}
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Wine size={16} className="text-champagne" />
            <h3 className="text-sm font-semibold">Données</h3>
          </div>
          <div className="space-y-1.5 text-sm text-text-secondary">
            <div className="flex justify-between">
              <span>Bouteilles en cave</span>
              <span className="font-mono">{wines.reduce((sum, w) => sum + (w.quantity || 0), 0)}</span>
            </div>
            <div className="flex justify-between">
              <span>Références distinctes</span>
              <span className="font-mono">{wines.length}</span>
            </div>
            <div className="flex justify-between">
              <span>En attente de validation</span>
              <span className="font-mono">{pendingCount}</span>
            </div>
            <div className="flex justify-between">
              <span>Emplacements</span>
              <span className="font-mono">{locations.length}</span>
            </div>
          </div>
        </Card>

        {/* PDF export */}
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <FileDown size={16} className="text-accent" />
            <h3 className="text-sm font-semibold">Exporter</h3>
          </div>
          <p className="text-xs text-text-muted mb-3">
            Génère la carte des vins en PDF — choisissez le format avant de télécharger.
          </p>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleDownloadPdf}
            disabled={pdfLoading}
          >
            {pdfLoading
              ? <><Loader2 size={14} className="animate-spin" /> Génération…</>
              : <><FileDown size={14} /> Télécharger la carte des vins</>
            }
          </Button>
        </Card>

        {/* QR Code public */}
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <QrCode size={16} className="text-champagne" />
            <h3 className="text-sm font-semibold">Accès public</h3>
          </div>
          <p className="text-xs text-text-muted mb-4">
            Partagez ce QR code pour donner accès à la liste publique de votre cave (lecture seule, sans connexion).
          </p>

          <div className="flex gap-4 items-start">
            {/* QR code */}
            <div ref={qrContainerRef} className="bg-white rounded-[var(--radius-md)] p-3 flex-shrink-0 border border-border">
              <QRCodeSVG
                value={publicUrl}
                size={110}
                bgColor="#ffffff"
                fgColor="#111111"
                level="M"
              />
            </div>

            <div className="flex-1 min-w-0 flex flex-col gap-2">
              {/* URL */}
              <p className="text-[10px] font-mono text-text-muted break-all leading-relaxed bg-surface-hover rounded-[var(--radius-sm)] px-2 py-1.5">
                {publicUrl}
              </p>

              {/* Actions */}
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={handleCopyUrl}
                  className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text transition-colors"
                >
                  {urlCopied
                    ? <><Check size={13} className="text-success" /> Lien copié</>
                    : <><Copy size={13} /> Copier le lien</>
                  }
                </button>
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text transition-colors"
                >
                  <ExternalLink size={13} /> Ouvrir la page
                </a>
                <button
                  onClick={handlePrintQR}
                  className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text transition-colors"
                >
                  <Printer size={13} /> Imprimer le QR code
                </button>
              </div>
            </div>
          </div>
        </Card>

        {/* Version */}
        <Card>
          <div className="flex items-center gap-2 mb-2">
            <Info size={16} className="text-text-muted" />
            <h3 className="text-sm font-semibold">Version</h3>
          </div>
          <div className="space-y-1 text-sm text-text-secondary">
            <div className="flex justify-between">
              <span>Application</span>
              <span className="font-mono text-text-muted text-xs">Cavino</span>
            </div>
            <div className="flex justify-between">
              <span>Version</span>
              <span className="font-mono text-text-muted text-xs">4.0</span>
            </div>
            <div className="flex justify-between">
              <span>Dernière mise à jour</span>
              <span className="font-mono text-text-muted text-xs">{new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
