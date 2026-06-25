import { useState } from 'react';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, Globe, Database, Sparkles, CheckCircle, AlertCircle, MapPin } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { scrapegraphApi } from '@/lib/api/scrapegraph';
import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';

type ScrapeResult = {
  success: boolean;
  total_scraped?: number;
  inserted?: number;
  errors?: string[];
  error?: string;
};

type SmartScrapeResult = {
  success: boolean;
  data?: any;
  error?: string;
};

export default function AdminScrape() {
  const { user } = useAuth();
  const { toast } = useToast();

  // Scrape Places state
  const [placeUrl, setPlaceUrl] = useState('');
  const [area, setArea] = useState<string>('baner');
  const [customPrompt, setCustomPrompt] = useState('');
  const [isScrapingPlaces, setIsScrapingPlaces] = useState(false);
  const [placeResult, setPlaceResult] = useState<ScrapeResult | null>(null);

  // Smart Scrape state
  const [smartUrl, setSmartUrl] = useState('');
  const [smartPrompt, setSmartPrompt] = useState('');
  const [isSmartScraping, setIsSmartScraping] = useState(false);
  const [smartResult, setSmartResult] = useState<SmartScrapeResult | null>(null);

  // Enrich state
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichResult, setEnrichResult] = useState<{ success: boolean; total?: number; enriched?: number; error?: string } | null>(null);

  // Import (OpenStreetMap) state
  const [importCategory, setImportCategory] = useState('cafe');
  const [importArea, setImportArea] = useState('baner');
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; found?: number; inserted?: number; skipped?: number; error?: string } | null>(null);

  // Import-everything state
  const [isImportingAll, setIsImportingAll] = useState(false);
  const [importAllProgress, setImportAllProgress] = useState('');
  const [importAllResult, setImportAllResult] = useState<{ inserted: number; areasDone: number; errors: number } | null>(null);

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const handleScrapePlaces = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!placeUrl.trim()) return;

    setIsScrapingPlaces(true);
    setPlaceResult(null);

    try {
      const result = await scrapegraphApi.scrapePlaces({
        url: placeUrl,
        area: area as 'baner' | 'koregaon_park',
        prompt: customPrompt || undefined,
      });
      setPlaceResult(result as ScrapeResult);
      if (result.success && result.data?.inserted) {
        toast({ title: `Inserted ${result.data.inserted} places!` });
      }
    } catch (err) {
      setPlaceResult({ success: false, error: 'Request failed' });
    } finally {
      setIsScrapingPlaces(false);
    }
  };

  const ALL_AREAS = [
    'baner', 'koregaon_park', 'viman_nagar', 'hinjewadi', 'kothrud', 'aundh', 'wakad',
    'hadapsar', 'deccan', 'camp', 'kalyani_nagar', 'magarpatta', 'pimpri_chinchwad',
  ];

  const handleImportAll = async () => {
    setIsImportingAll(true);
    setImportAllResult(null);
    let totalInserted = 0;
    let errors = 0;

    for (let i = 0; i < ALL_AREAS.length; i++) {
      const area = ALL_AREAS[i];
      setImportAllProgress(`Importing all categories in ${area.replace(/_/g, ' ')}... (${i + 1}/${ALL_AREAS.length})`);
      try {
        const result = await scrapegraphApi.importPlaces({ category: 'all', area });
        if (result.success) {
          totalInserted += (result as any).inserted ?? 0;
        } else {
          errors++;
        }
      } catch {
        errors++;
      }
      setImportAllResult({ inserted: totalInserted, areasDone: i + 1, errors });
      // Be polite to the free Overpass API between area queries.
      await new Promise((r) => setTimeout(r, 1500));
    }

    setImportAllProgress('');
    setIsImportingAll(false);
    toast({ title: `Import complete: ${totalInserted} new places across ${ALL_AREAS.length} areas.` });
  };

  const handleImport = async () => {
    setIsImporting(true);
    setImportResult(null);

    try {
      const result = await scrapegraphApi.importPlaces({ category: importCategory, area: importArea });
      setImportResult(result as any);
      if (result.success) {
        toast({ title: `Imported ${(result as any).inserted ?? 0} new places from OpenStreetMap.` });
      } else {
        toast({ variant: 'destructive', title: 'Import failed', description: result.error });
      }
    } catch (err) {
      setImportResult({ success: false, error: 'Request failed' });
    } finally {
      setIsImporting(false);
    }
  };

  const handleEnrich = async () => {
    setIsEnriching(true);
    setEnrichResult(null);

    try {
      const result = await scrapegraphApi.enrichPlaces({ limit: 10 });
      setEnrichResult(result as any);
      if (result.success) {
        toast({ title: `Enriched ${(result as any).enriched ?? 0} places with coordinates/photos.` });
      } else {
        toast({ variant: 'destructive', title: 'Enrichment failed', description: result.error });
      }
    } catch (err) {
      setEnrichResult({ success: false, error: 'Request failed' });
    } finally {
      setIsEnriching(false);
    }
  };

  const handleSmartScrape = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!smartUrl.trim() || !smartPrompt.trim()) return;

    setIsSmartScraping(true);
    setSmartResult(null);

    try {
      const result = await scrapegraphApi.smartScrape({
        website_url: smartUrl,
        user_prompt: smartPrompt,
      });
      setSmartResult(result);
    } catch (err) {
      setSmartResult({ success: false, error: 'Request failed' });
    } finally {
      setIsSmartScraping(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-4xl space-y-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Admin: Scraper</h1>
            <p className="text-muted-foreground mt-1">
              Use ScrapeGraphAI to populate your places database or extract data from any website.
            </p>
          </div>

          {/* Import from OpenStreetMap Card (primary data source) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-primary" />
                Import Real Places (OpenStreetMap)
              </CardTitle>
              <CardDescription>
                Bulk-import real, existing places for a category + area straight from OpenStreetMap —
                free, with coordinates included. This is the primary way to populate the database.
                Start with one category/area to check quality, then expand.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 space-y-2">
                  <Label>Category</Label>
                  <Select value={importCategory} onValueChange={setImportCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cafe">Cafés</SelectItem>
                      <SelectItem value="restaurant">Restaurants</SelectItem>
                      <SelectItem value="bar">Bars / Pubs / Clubs</SelectItem>
                      <SelectItem value="gym">Gyms / Fitness</SelectItem>
                      <SelectItem value="park">Parks / Gardens</SelectItem>
                      <SelectItem value="mall">Malls / Shopping</SelectItem>
                      <SelectItem value="museum">Museums / Galleries</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 space-y-2">
                  <Label>Area</Label>
                  <Select value={importArea} onValueChange={setImportArea}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="baner">Baner</SelectItem>
                      <SelectItem value="koregaon_park">Koregaon Park</SelectItem>
                      <SelectItem value="viman_nagar">Viman Nagar</SelectItem>
                      <SelectItem value="hinjewadi">Hinjewadi</SelectItem>
                      <SelectItem value="kothrud">Kothrud</SelectItem>
                      <SelectItem value="aundh">Aundh</SelectItem>
                      <SelectItem value="wakad">Wakad</SelectItem>
                      <SelectItem value="hadapsar">Hadapsar</SelectItem>
                      <SelectItem value="deccan">Deccan</SelectItem>
                      <SelectItem value="camp">Camp</SelectItem>
                      <SelectItem value="kalyani_nagar">Kalyani Nagar</SelectItem>
                      <SelectItem value="magarpatta">Magarpatta</SelectItem>
                      <SelectItem value="pimpri_chinchwad">Pimpri Chinchwad</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button onClick={handleImport} disabled={isImporting} className="w-full mt-4">
                {isImporting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Importing from OpenStreetMap...
                  </>
                ) : (
                  <>
                    <MapPin className="w-4 h-4 mr-2" />
                    Import Places
                  </>
                )}
              </Button>

              {importResult && (
                <div className="mt-6">
                  {importResult.success ? (
                    <Alert className="border-primary/20">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <AlertDescription>
                        Found <Badge variant="secondary">{importResult.found ?? 0}</Badge> places,
                        inserted <Badge variant="secondary">{importResult.inserted ?? 0}</Badge> new
                        (<Badge variant="secondary">{importResult.skipped ?? 0}</Badge> skipped/existing).
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{importResult.error}</AlertDescription>
                    </Alert>
                  )}
                </div>
              )}

              <div className="mt-6 pt-6 border-t">
                <p className="text-sm text-muted-foreground mb-3">
                  Or import <strong>all categories across all areas</strong> in one go (takes a couple of minutes):
                </p>
                <Button onClick={handleImportAll} disabled={isImportingAll || isImporting} variant="secondary" className="w-full">
                  {isImportingAll ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {importAllProgress || 'Importing everything...'}
                    </>
                  ) : (
                    <>
                      <Database className="w-4 h-4 mr-2" />
                      Import Everything (all categories × all areas)
                    </>
                  )}
                </Button>

                {importAllResult && (
                  <Alert className="mt-4 border-primary/20">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <AlertDescription>
                      {isImportingAll ? 'In progress: ' : 'Done: '}
                      inserted <Badge variant="secondary">{importAllResult.inserted}</Badge> new places across{' '}
                      <Badge variant="secondary">{importAllResult.areasDone}</Badge>/{ALL_AREAS.length} areas
                      {importAllResult.errors > 0 && <> (<Badge variant="secondary">{importAllResult.errors}</Badge> area errors)</>}.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Scrape Places Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5 text-primary" />
                Scrape Places into Database
              </CardTitle>
              <CardDescription>
                Provide a URL (e.g. Zomato, Google Maps listing) and we'll extract place data and insert it directly into your database.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleScrapePlaces} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="placeUrl">Website URL</Label>
                  <Input
                    id="placeUrl"
                    type="url"
                    placeholder="https://www.zomato.com/pune/baner-restaurants"
                    value={placeUrl}
                    onChange={(e) => setPlaceUrl(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label>Area</Label>
                  <Select value={area} onValueChange={(v) => setArea(v as any)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="baner">Baner</SelectItem>
                      <SelectItem value="koregaon_park">Koregaon Park</SelectItem>
                      <SelectItem value="viman_nagar">Viman Nagar</SelectItem>
                      <SelectItem value="hinjewadi">Hinjewadi</SelectItem>
                      <SelectItem value="kothrud">Kothrud</SelectItem>
                      <SelectItem value="aundh">Aundh</SelectItem>
                      <SelectItem value="wakad">Wakad</SelectItem>
                      <SelectItem value="hadapsar">Hadapsar</SelectItem>
                      <SelectItem value="deccan">Deccan</SelectItem>
                      <SelectItem value="camp">Camp</SelectItem>
                      <SelectItem value="kalyani_nagar">Kalyani Nagar</SelectItem>
                      <SelectItem value="magarpatta">Magarpatta</SelectItem>
                      <SelectItem value="pimpri_chinchwad">Pimpri Chinchwad</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="customPrompt">Custom Extraction Prompt (optional)</Label>
                  <Textarea
                    id="customPrompt"
                    placeholder="Leave empty to use default extraction prompt..."
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    rows={3}
                  />
                </div>

                <Button type="submit" disabled={isScrapingPlaces} className="w-full">
                  {isScrapingPlaces ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Scraping & Inserting... (this may take 1-2 min)
                    </>
                  ) : (
                    <>
                      <Globe className="w-4 h-4 mr-2" />
                      Scrape & Insert Places
                    </>
                  )}
                </Button>
              </form>

              {placeResult && (
                <div className="mt-6">
                  {placeResult.success ? (
                    <Alert className="border-primary/20">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <AlertDescription>
                        Scraped <Badge variant="secondary">{placeResult.total_scraped}</Badge> places,
                        inserted <Badge variant="secondary">{placeResult.inserted}</Badge> into database.
                        {placeResult.errors && placeResult.errors.length > 0 && (
                          <div className="mt-2 text-sm text-muted-foreground">
                            <p className="font-medium">Errors:</p>
                            <ul className="list-disc pl-4">
                              {placeResult.errors.map((err, i) => <li key={i}>{err}</li>)}
                            </ul>
                          </div>
                        )}
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{placeResult.error}</AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Enrich Places Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-primary" />
                Enrich Existing Places
              </CardTitle>
              <CardDescription>
                Fill in real coordinates (via OpenStreetMap) and real photos + opening hours (via ScrapeGraph)
                for places that are missing them. Processes up to 10 places per run; click again for more.
                This is slow (~a few seconds per place) — please wait for it to finish.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleEnrich} disabled={isEnriching} className="w-full">
                {isEnriching ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Enriching... (this can take a couple of minutes)
                  </>
                ) : (
                  <>
                    <MapPin className="w-4 h-4 mr-2" />
                    Enrich Places (coordinates + photos)
                  </>
                )}
              </Button>

              {enrichResult && (
                <div className="mt-6">
                  {enrichResult.success ? (
                    <Alert className="border-primary/20">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <AlertDescription>
                        Enriched <Badge variant="secondary">{enrichResult.enriched ?? 0}</Badge> of{' '}
                        <Badge variant="secondary">{enrichResult.total ?? 0}</Badge> places processed.
                        {(enrichResult.total ?? 0) === 0 && ' No places needed enrichment.'}
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{enrichResult.error}</AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Smart Scrape Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-accent" />
                Smart Scrape (General)
              </CardTitle>
              <CardDescription>
                Extract any structured data from any website using AI. Results shown as JSON.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSmartScrape} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="smartUrl">Website URL</Label>
                  <Input
                    id="smartUrl"
                    type="url"
                    placeholder="https://example.com"
                    value={smartUrl}
                    onChange={(e) => setSmartUrl(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="smartPrompt">What to extract?</Label>
                  <Textarea
                    id="smartPrompt"
                    placeholder="Extract all product names, prices, and descriptions..."
                    value={smartPrompt}
                    onChange={(e) => setSmartPrompt(e.target.value)}
                    required
                    rows={3}
                  />
                </div>

                <Button type="submit" disabled={isSmartScraping} className="w-full" variant="secondary">
                  {isSmartScraping ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Extracting... (this may take 30-60s)
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Smart Scrape
                    </>
                  )}
                </Button>
              </form>

              {smartResult && (
                <div className="mt-6">
                  {smartResult.success ? (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">Extracted Data:</p>
                      <pre className="bg-muted p-4 rounded-lg overflow-auto max-h-96 text-xs">
                        {JSON.stringify(smartResult.data, null, 2)}
                      </pre>
                    </div>
                  ) : (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{smartResult.error}</AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
