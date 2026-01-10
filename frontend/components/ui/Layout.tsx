import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import Logo from '../Logo';
import { LayoutDashboard, PlusCircle, User, Menu, X, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { cn } from '../../utils/cn';
import { useApiHealth } from '../../hooks/useApiHealth';
import { setupDemoAuth } from '../../hooks/useDemoAuth';

interface LayoutProps {
  children: React.ReactNode;
}

const NavItem: React.FC<{ to: string; icon: React.ReactNode; label: string; active: boolean }> = ({ 
  to, icon, label, active 
}) => (
  <Link
    to={to}
    className={cn(
      "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
      active 
        ? "bg-brand-50 text-brand-700" 
        : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
    )}
  >
    {React.cloneElement(icon as React.ReactElement, { 
      className: cn("w-5 h-5", active ? "text-brand-600" : "text-slate-400") 
    })}
    {label}
  </Link>
);

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const { isHealthy, isLoading, error, data } = useApiHealth();

  // Setup demo auth automatically on mount
  React.useEffect(() => {
    setupDemoAuth();
  }, []);

  // Show loading spinner while checking health
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-brand-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-600 text-lg">Connecting to backend...</p>
          <p className="text-slate-400 text-sm mt-2">Checking API health</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Navbar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center gap-8">
              <Logo />
              
              {/* Desktop Nav */}
              <nav className="hidden md:flex gap-1">
                <NavItem 
                  to="/dashboard" 
                  icon={<LayoutDashboard />} 
                  label="Dashboard" 
                  active={location.pathname === '/dashboard' || location.pathname === '/'} 
                />
                <NavItem 
                  to="/create" 
                  icon={<PlusCircle />} 
                  label="Create Payment" 
                  active={location.pathname === '/create'} 
                />
              </nav>
            </div>

            <div className="flex items-center gap-4">
              {/* API Health Status Indicator */}
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border"
                   title={error || `Environment: ${data?.environment || 'unknown'}`}>
                {isHealthy ? (
                  <>
                    <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                    <span className="text-green-700">API Connected</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                    <span className="text-red-700">API Offline</span>
                  </>
                )}
              </div>

               {/* Mobile Menu Button */}
               <button 
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="md:hidden p-2 text-slate-500 hover:bg-slate-100 rounded-md"
              >
                {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>

              {/* Profile Placeholder */}
              <div className="hidden md:flex items-center gap-3 pl-6 border-l border-slate-200">
                <div className="flex flex-col text-right">
                  <span className="text-sm font-medium text-slate-900">Admin User</span>
                  <span className="text-xs text-slate-500">Engineering</span>
                </div>
                <div className="w-9 h-9 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 border border-brand-200">
                  <User className="w-5 h-5" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200 bg-white px-4 py-2 space-y-1">
             <NavItem 
                  to="/dashboard" 
                  icon={<LayoutDashboard />} 
                  label="Dashboard" 
                  active={location.pathname === '/dashboard' || location.pathname === '/'} 
                />
                <NavItem 
                  to="/create" 
                  icon={<PlusCircle />} 
                  label="Create Payment" 
                  active={location.pathname === '/create'} 
                />
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-slate-400">
          © {new Date().getFullYear()} Payeazie. Enterprise Payment Systems.
        </div>
      </footer>
    </div>
  );
};

export default Layout;
