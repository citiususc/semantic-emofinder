import React from 'react';
import './NavBar.css';

// Si el logo está en public/, puedes referenciarlo así:
const logoSrc = '/logo.png';

interface NavBarProps {
    view: 'finder' | 'databases' | 'sparql';
    setView: React.Dispatch<React.SetStateAction<'finder' | 'databases' | 'sparql'>>;
}

export default function NavBar({ view, setView }: NavBarProps) {
    return (
        <nav className="navbar">
            <div className="navbar-brand">
                <img src={logoSrc} alt="Logo" className="navbar-logo" />
                <h1 className="navbar-title">Semantic emoFinder</h1>
            </div>
            <div className="navbar-links">
                <button
                    className={view === 'finder' ? 'active' : ''}
                    onClick={() => setView('finder')}
                >
                    Finder
                </button>
                <button
                    className={view === 'databases' ? 'active' : ''}
                    onClick={() => setView('databases')}
                >
                    Upload Database
                </button>
                <button
                    className={view === 'sparql' ? 'active' : ''}
                    onClick={() => setView('sparql')}
                >
                    SPARQL
                </button>
            </div>
        </nav>
    );
}