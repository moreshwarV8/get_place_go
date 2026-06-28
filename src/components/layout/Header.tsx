import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MapPin, Menu, X, User, LogOut, Heart, Globe, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, signOut } = useAuth();
  const { isAdmin } = useIsAdmin();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group">
            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow group-hover:scale-105 transition-transform">
              <MapPin className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-display text-xl font-bold text-foreground">
              Get Place Go
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-6">
            <Link to="/concierge" className="text-primary hover:text-primary/80 transition-colors font-semibold flex items-center gap-1">
              <Sparkles className="w-4 h-4" />
              Ask AI
            </Link>
            <Link to="/explore" className="text-muted-foreground hover:text-foreground transition-colors font-medium">
              Explore
            </Link>
            <Link to="/vibes" className="text-muted-foreground hover:text-foreground transition-colors font-medium">
              Vibes
            </Link>
            <Link to="/itineraries" className="text-muted-foreground hover:text-foreground transition-colors font-medium">
              Itineraries
            </Link>
            {isAdmin && (
              <Link to="/admin/scrape" className="text-muted-foreground hover:text-foreground transition-colors font-medium flex items-center gap-1">
                <Globe className="w-3.5 h-3.5" />
                Scraper
              </Link>
            )}
          </nav>

          {/* Auth Buttons */}
          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <User className="w-4 h-4" />
                    {user.email?.split('@')[0]}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => navigate('/favorites')}>
                    <Heart className="w-4 h-4 mr-2" />
                    Favorites
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/profile')}>
                    <User className="w-4 h-4 mr-2" />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleSignOut}>
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => navigate('/auth')}>
                  Sign In
                </Button>
                <Button size="sm" className="gradient-primary" onClick={() => navigate('/auth?mode=signup')}>
                  Get Started
                </Button>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-border animate-fade-in">
            <nav className="flex flex-col gap-4">
              <Link
                to="/concierge"
                className="text-primary font-semibold flex items-center gap-1"
                onClick={() => setMobileMenuOpen(false)}
              >
                <Sparkles className="w-4 h-4" />
                Ask AI
              </Link>
              <Link
                to="/explore"
                className="text-muted-foreground hover:text-foreground transition-colors font-medium"
                onClick={() => setMobileMenuOpen(false)}
              >
                Explore
              </Link>
              <Link
                to="/vibes"
                className="text-muted-foreground hover:text-foreground transition-colors font-medium"
                onClick={() => setMobileMenuOpen(false)}
              >
                Vibes
              </Link>
              <Link
                to="/itineraries"
                className="text-muted-foreground hover:text-foreground transition-colors font-medium"
                onClick={() => setMobileMenuOpen(false)}
              >
                Itineraries
              </Link>
              {isAdmin && (
                <Link
                  to="/admin/scrape"
                  className="text-muted-foreground hover:text-foreground transition-colors font-medium flex items-center gap-1"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Globe className="w-3.5 h-3.5" />
                  Scraper
                </Link>
              )}
              <div className="pt-4 border-t border-border flex flex-col gap-2">
                {user ? (
                  <>
                    <Button variant="outline" onClick={() => { navigate('/favorites'); setMobileMenuOpen(false); }}>
                      <Heart className="w-4 h-4 mr-2" />
                      Favorites
                    </Button>
                    <Button variant="outline" onClick={() => { navigate('/profile'); setMobileMenuOpen(false); }}>
                      Profile
                    </Button>
                    <Button variant="ghost" onClick={handleSignOut}>
                      Sign Out
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="ghost" onClick={() => { navigate('/auth'); setMobileMenuOpen(false); }}>
                      Sign In
                    </Button>
                    <Button className="gradient-primary" onClick={() => { navigate('/auth?mode=signup'); setMobileMenuOpen(false); }}>
                      Get Started
                    </Button>
                  </>
                )}
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
