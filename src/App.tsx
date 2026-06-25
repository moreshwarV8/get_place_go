import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Explore from "./pages/Explore";
import PlaceDetail from "./pages/PlaceDetail";
import Concierge from "./pages/Concierge";
import Profile from "./pages/Profile";
import Vibes from "./pages/Vibes";
import Itineraries from "./pages/Itineraries";
import ItineraryBuilder from "./pages/ItineraryBuilder";
import Favorites from "./pages/Favorites";
import AdminScrape from "./pages/AdminScrape";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/explore" element={<Explore />} />
            <Route path="/place/:slug" element={<PlaceDetail />} />
            <Route path="/concierge" element={<Concierge />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/vibes" element={<Vibes />} />
            <Route path="/itineraries" element={<Itineraries />} />
            <Route path="/itineraries/:id" element={<ItineraryBuilder />} />
            <Route path="/favorites" element={<Favorites />} />
            <Route path="/admin/scrape" element={<AdminScrape />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
